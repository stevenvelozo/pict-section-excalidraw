#!/usr/bin/env node
/**
 * Generate-Notebook-Diagram.js
 *
 * Turns a structured node/edge description into a full Excalidraw scene
 * (elements + appState + files) styled per a style profile.  The intent:
 * a stable JSON-in / JSON-out contract that an AI (or any caller) can hit
 * to produce diagrams that match a personal hand-drawn notebook look.
 *
 * Input shape (the "AI-friendly contract"):
 *
 *   {
 *     nodes:
 *     [
 *       { "id": "user",  "label": "User",     "kind": "ellipse" },
 *       { "id": "api",   "label": "API",      "kind": "rectangle" },
 *       { "id": "db",    "label": "Database", "kind": "rectangle", "x": 800, "y": 200 },
 *       { "id": "cache", "label": "Cache",    "kind": "note",      "accent": "highlight" }
 *     ],
 *     edges:
 *     [
 *       { "from": "user", "to": "api",   "label": "request" },
 *       { "from": "api",  "to": "db",    "label": "query" },
 *       { "from": "api",  "to": "cache", "label": "lookup", "kind": "dashed" }
 *     ],
 *     title:  "service flow",     // optional — rendered as a heading text element
 *     layout: "flow"              // 'flow' (default), 'grid', 'manual'
 *   }
 *
 * The generator:
 *   1. Auto-lays-out nodes that don't have x/y (flow / grid).
 *   2. Builds Excalidraw `rectangle` / `ellipse` / `diamond` / `text` elements
 *      with the style profile's roughness, fill, palette, font, stroke width.
 *   3. Adds bound text labels inside each shape (containerId-bound).
 *   4. Builds `arrow` elements between nodes with proper startBinding /
 *      endBinding so they stay attached when the user drags shapes.
 *   5. Produces a deterministic seed per element so the same input always
 *      wobbles the same way (style profile's SeedRange + RandomSeedSalt).
 *
 * The output JSON is round-trip-safe with Excalidraw's serializeAsJSON /
 * loadFromBlob — you can save it as .excalidraw.json and open it in
 * excalidraw.com unchanged.
 *
 * CLI usage:
 *   node Generate-Notebook-Diagram.js < input.json > out.excalidraw.json
 *   node Generate-Notebook-Diagram.js input.json out.excalidraw.json
 *
 * Library usage:
 *   const { generateNotebookDiagram } = require('./Generate-Notebook-Diagram.js');
 *   const scene = generateNotebookDiagram(input, profile);
 */

const libFs   = require('fs');
const libPath = require('path');

const _DefaultProfile = require('../source/style-profiles/Notebook-Default.js');

// Excalidraw uses small integers for fontFamily, not strings.  Map the
// human-readable names from the style profile to the values Excalidraw's
// renderer understands.  See vendor/excalidraw/packages/common/src/constants.ts
// `FONT_FAMILY` for the source of truth.
const _FontFamilyMap = {
	'Excalifont':    5,
	'Virgil':        1,        // legacy default — handwritten
	'Helvetica':     2,
	'Cascadia':      3,
	'Lilita One':    7,
	'Comic Shanns':  8,
	'Liberation Sans': 6,
	'Nunito':        4
};
const _DefaultFontFamily = 5;  // Excalifont

// ----- Deterministic helpers ------------------------------------------------

/**
 * Tiny deterministic hash → integer in [0, 2^31).  Combined with the style
 * profile's RandomSeedSalt, this lets us produce a per-element rough.js seed
 * that's stable across runs — same input JSON always produces the same
 * wobble.
 */
function hashString(pStr)
{
	let tmpHash = 2166136261;
	for (let i = 0; i < pStr.length; i++)
	{
		tmpHash ^= pStr.charCodeAt(i);
		tmpHash = (tmpHash * 16777619) >>> 0;
	}
	return tmpHash >>> 0;
}

function seedFor(pProfile, pComponentKey)
{
	let tmpSalt   = pProfile.RandomSeedSalt || 0;
	let tmpRange  = pProfile.SeedRange      || [ 1, 99999 ];
	let tmpRaw    = hashString(pComponentKey + ':' + tmpSalt);
	let tmpSpan   = tmpRange[1] - tmpRange[0] + 1;
	return tmpRange[0] + (tmpRaw % tmpSpan);
}

function idFor(pPrefix, pSeed)
{
	// Excalidraw uses nanoid (21-char alphanum), but we want determinism.
	// Build an ID by base-36-encoding the seed + prefix.
	let tmpBase = (pSeed >>> 0).toString(36);
	while (tmpBase.length < 8) tmpBase = '0' + tmpBase;
	return pPrefix + '-' + tmpBase;
}

// ----- Layout ---------------------------------------------------------------

/**
 * Toposort the DAG implied by edges (best-effort — falls back to insertion
 * order on cycles).  Returns nodes annotated with `__rank` (column index).
 */
function topoRank(pNodes, pEdges)
{
	let tmpById = {};
	for (let i = 0; i < pNodes.length; i++) tmpById[pNodes[i].id] = pNodes[i];

	let tmpIncoming = {};
	for (let i = 0; i < pNodes.length; i++) tmpIncoming[pNodes[i].id] = 0;
	for (let i = 0; i < pEdges.length; i++)
	{
		// Self-loops don't contribute to incoming degree — otherwise the
		// only node in a single-self-loop graph never reaches the queue.
		if (pEdges[i].from === pEdges[i].to) continue;
		if (tmpById[pEdges[i].to]) tmpIncoming[pEdges[i].to] = (tmpIncoming[pEdges[i].to] || 0) + 1;
	}

	let tmpRanks = {};
	let tmpQueue = [];
	for (let i = 0; i < pNodes.length; i++)
	{
		if (tmpIncoming[pNodes[i].id] === 0)
		{
			tmpQueue.push(pNodes[i].id);
			tmpRanks[pNodes[i].id] = 0;
		}
	}

	let tmpProcessed = 0;
	while (tmpQueue.length > 0)
	{
		let tmpId = tmpQueue.shift();
		tmpProcessed++;
		for (let j = 0; j < pEdges.length; j++)
		{
			if (pEdges[j].from === pEdges[j].to) continue;
			if (pEdges[j].from === tmpId)
			{
				let tmpTo = pEdges[j].to;
				if (tmpRanks[tmpTo] === undefined || tmpRanks[tmpTo] <= tmpRanks[tmpId])
				{
					tmpRanks[tmpTo] = (tmpRanks[tmpId] || 0) + 1;
				}
				tmpIncoming[tmpTo]--;
				if (tmpIncoming[tmpTo] === 0) tmpQueue.push(tmpTo);
			}
		}
	}

	// Anything left unranked (cycles or disconnected) gets max-rank + 1
	let tmpMaxRank = 0;
	for (let k in tmpRanks) if (tmpRanks[k] > tmpMaxRank) tmpMaxRank = tmpRanks[k];
	for (let i = 0; i < pNodes.length; i++)
	{
		if (tmpRanks[pNodes[i].id] === undefined)
		{
			tmpRanks[pNodes[i].id] = tmpMaxRank + 1;
		}
	}

	for (let i = 0; i < pNodes.length; i++)
	{
		pNodes[i].__rank = tmpRanks[pNodes[i].id];
	}
	return pNodes;
}

function autoLayoutFlow(pNodes, pEdges, pProfile)
{
	let tmpRanked = topoRank(pNodes, pEdges);

	// Group by rank → assign vertical positions within each column
	let tmpByRank = {};
	for (let i = 0; i < tmpRanked.length; i++)
	{
		let tmpR = tmpRanked[i].__rank;
		if (!tmpByRank[tmpR]) tmpByRank[tmpR] = [];
		tmpByRank[tmpR].push(tmpRanked[i]);
	}

	let tmpHGap = pProfile.Layout.horizontalGap || 80;
	let tmpVGap = pProfile.Layout.verticalGap   || 120;
	let tmpPad  = pProfile.Layout.padding       || 40;
	let tmpTitleSpace = 80; // leave room above the diagram for the title

	// Self-loops on rank-0 nodes arch up out of the diagram's normal
	// vertical extent.  Reserve enough headroom that the loop's apex and
	// its edge label both clear the title.
	let tmpById = {};
	for (let i = 0; i < tmpRanked.length; i++) tmpById[tmpRanked[i].id] = tmpRanked[i];
	let tmpRank0LoopH = 0;
	for (let i = 0; i < pEdges.length; i++)
	{
		let tmpE = pEdges[i];
		if (tmpE.from !== tmpE.to) continue;
		let tmpN = tmpById[tmpE.from];
		if (!tmpN || tmpN.__rank !== 0) continue;
		let tmpLoopH = selfLoopHeightFor(sizeFor(tmpN, pProfile).height);
		if (tmpLoopH > tmpRank0LoopH) tmpRank0LoopH = tmpLoopH;
	}
	if (tmpRank0LoopH > 0)
	{
		let tmpEdgeLabelFs = Math.max(14, (pProfile.FontSize || 20) - 4);
		let tmpEdgeLabelH  = Math.ceil(tmpEdgeLabelFs * 1.25);
		tmpTitleSpace += tmpRank0LoopH + tmpEdgeLabelH + 12;
	}

	let tmpRanks = Object.keys(tmpByRank).map((k) => parseInt(k, 10)).sort((a, b) => a - b);

	// First pass: compute each column's max width.  Variable-width nodes
	// otherwise overlap when column N+1 is positioned by column N's own
	// node width (which can be smaller).  Same for max height per row
	// inside each column.
	let tmpColMaxWidth = {};
	for (let r = 0; r < tmpRanks.length; r++)
	{
		let tmpRank   = tmpRanks[r];
		let tmpColumn = tmpByRank[tmpRank];
		let tmpMax = 0;
		for (let n = 0; n < tmpColumn.length; n++)
		{
			let tmpS = sizeFor(tmpColumn[n], pProfile);
			if (tmpS.width > tmpMax) tmpMax = tmpS.width;
		}
		tmpColMaxWidth[tmpRank] = tmpMax;
	}

	// Cumulative X offsets per column — column r starts at sum of all
	// previous max-widths + gaps.  Guarantees no horizontal overlap
	// even when widths vary.
	let tmpColX = {};
	let tmpRunningX = tmpPad;
	for (let r = 0; r < tmpRanks.length; r++)
	{
		tmpColX[tmpRanks[r]] = tmpRunningX;
		tmpRunningX += tmpColMaxWidth[tmpRanks[r]] + tmpHGap;
	}

	// Second pass: place nodes, centering each column's nodes within the
	// column's max width and stacking them vertically with consistent gap.
	for (let r = 0; r < tmpRanks.length; r++)
	{
		let tmpRank   = tmpRanks[r];
		let tmpColumn = tmpByRank[tmpRank];
		let tmpColW   = tmpColMaxWidth[tmpRank];
		let tmpY      = tmpPad + tmpTitleSpace;
		for (let n = 0; n < tmpColumn.length; n++)
		{
			let tmpNode = tmpColumn[n];
			if (typeof tmpNode.x === 'number') continue;
			let tmpSize = sizeFor(tmpNode, pProfile);
			// Center within the column's max width so narrow shapes don't
			// hug the left of a wide column.
			tmpNode.x = tmpColX[tmpRank] + Math.floor((tmpColW - tmpSize.width) / 2);
			tmpNode.y = tmpY;
			tmpY += tmpSize.height + tmpVGap;
		}
	}
	return pNodes;
}

function autoLayoutGrid(pNodes, pProfile)
{
	let tmpCols = Math.ceil(Math.sqrt(pNodes.length));
	let tmpHGap = pProfile.Layout.horizontalGap || 80;
	let tmpVGap = pProfile.Layout.verticalGap   || 120;
	let tmpPad  = pProfile.Layout.padding       || 40;
	for (let i = 0; i < pNodes.length; i++)
	{
		if (typeof pNodes[i].x !== 'number')
		{
			let tmpSize = sizeFor(pNodes[i], pProfile);
			pNodes[i].x = tmpPad + (i % tmpCols) * (tmpSize.width + tmpHGap);
			pNodes[i].y = tmpPad + Math.floor(i / tmpCols) * (tmpSize.height + tmpVGap);
		}
	}
	return pNodes;
}

// ----- Element construction --------------------------------------------------

function sizeFor(pNode, pProfile)
{
	let tmpDefaults = pProfile.DefaultSizes || {};
	let tmpKind     = pNode.kind || 'rectangle';
	let tmpBase     = tmpDefaults[tmpKind] || tmpDefaults.rectangle || { width: 180, height: 80 };
	let tmpW        = pNode.width  || tmpBase.width;
	let tmpH        = pNode.height || tmpBase.height;
	// Expand width if the label is long enough that it wouldn't fit at the
	// given font size.  Cheap heuristic: ~8 px per char at fontSize 20.
	let tmpLabelLen = (pNode.label || '').length;
	let tmpFontSize = pProfile.FontSize || 20;
	let tmpEstWidth = tmpLabelLen * tmpFontSize * 0.55 + 32;  // 0.55 ≈ avg glyph width / fontSize
	if (tmpEstWidth > tmpW) tmpW = Math.ceil(tmpEstWidth);
	return { width: tmpW, height: tmpH };
}

function strokeColorFor(pNode, pProfile)
{
	let tmpPalette = pProfile.Palette || {};
	let tmpAccent  = pNode.accent;     // 'ink' | 'accent' | 'highlight' | 'deemphasis' | 'link'
	if (tmpAccent && tmpPalette[tmpAccent]) return tmpPalette[tmpAccent];
	return tmpPalette.ink || '#1B1F23';
}

function backgroundColorFor(pNode, pProfile)
{
	let tmpPalette = pProfile.Palette || {};
	if (pNode.background && tmpPalette[pNode.background]) return tmpPalette[pNode.background];
	if (pNode.kind === 'note') return tmpPalette.highlight || '#FFF3B0';
	return 'transparent';
}

function fontFamilyIndex(pProfile)
{
	let tmpName = pProfile.FontFamily || 'Excalifont';
	return _FontFamilyMap[tmpName] || _DefaultFontFamily;
}

function buildShapeElement(pNode, pProfile)
{
	let tmpKind  = pNode.kind || 'rectangle';
	let tmpSize  = sizeFor(pNode, pProfile);
	let tmpSeed  = seedFor(pProfile, 'shape:' + pNode.id);
	let tmpId    = idFor('shape-' + pNode.id, tmpSeed);

	// 'note' is a synthetic kind that maps to a filled rectangle with the
	// highlight color — sticky-note vibe.
	let tmpExType   = (tmpKind === 'note') ? 'rectangle' : tmpKind;
	let tmpBg       = backgroundColorFor(pNode, pProfile);
	let tmpHasFill  = tmpBg !== 'transparent' || tmpKind === 'note';

	let tmpEl = {
		id:               tmpId,
		type:             tmpExType,
		x:                pNode.x | 0,
		y:                pNode.y | 0,
		width:            tmpSize.width,
		height:           tmpSize.height,
		angle:            0,
		strokeColor:      strokeColorFor(pNode, pProfile),
		backgroundColor:  tmpBg,
		fillStyle:        tmpHasFill ? (pProfile.FillStyle || 'hachure') : 'solid',
		strokeWidth:      pProfile.StrokeWidth || 2,
		strokeStyle:      pProfile.StrokeStyle || 'solid',
		roughness:        (pProfile.Roughness !== undefined) ? pProfile.Roughness : 1,
		opacity:          100,
		groupIds:         [],
		frameId:          null,
		// Roundness for rectangles/diamonds; null for ellipses (Excalidraw ignores)
		roundness:        (tmpExType === 'rectangle' || tmpExType === 'diamond')
		                    ? { type: 3 }
		                    : null,
		seed:             tmpSeed,
		version:          1,
		versionNonce:     tmpSeed,
		isDeleted:        false,
		boundElements:    [],
		updated:          1,
		link:             null,
		locked:           false,
		index:            null  // restored by Excalidraw on load
	};

	// Persist the synthetic "note" hint into customData so a round-trip
	// preserves the kind for re-edit by the generator.
	if (tmpKind === 'note')
	{
		tmpEl.customData = { sourceKind: 'note', generator: 'pict-section-excalidraw/notebook' };
	}
	return tmpEl;
}

function buildLabelElement(pNode, pShape, pProfile)
{
	if (!pNode.label) return null;
	let tmpSeed     = seedFor(pProfile, 'label:' + pNode.id);
	let tmpId       = idFor('label-' + pNode.id, tmpSeed);
	let tmpFontSize = pProfile.FontSize || 20;
	let tmpLines    = String(pNode.label).split('\n').length;
	let tmpLineHt   = 1.25;

	// Label sits inside its container — Excalidraw uses containerId binding
	// + centered text alignment to keep it visually centered on the shape.
	let tmpEl = {
		id:              tmpId,
		type:            'text',
		x:               pShape.x + 8,
		y:               pShape.y + Math.max(8, (pShape.height - tmpFontSize * tmpLines * tmpLineHt) / 2),
		width:           pShape.width - 16,
		height:          Math.ceil(tmpFontSize * tmpLines * tmpLineHt),
		angle:           0,
		strokeColor:     strokeColorFor(pNode, pProfile),
		backgroundColor: 'transparent',
		fillStyle:       'solid',
		strokeWidth:     1,
		strokeStyle:     'solid',
		roughness:       1,
		opacity:         100,
		groupIds:        [],
		frameId:         null,
		roundness:       null,
		seed:            tmpSeed,
		version:         1,
		versionNonce:    tmpSeed,
		isDeleted:       false,
		boundElements:   null,
		updated:         1,
		link:            null,
		locked:          false,
		text:            pNode.label,
		fontSize:        tmpFontSize,
		fontFamily:      fontFamilyIndex(pProfile),
		textAlign:       'center',
		verticalAlign:   'middle',
		baseline:        Math.round(tmpFontSize * 0.75),
		containerId:     pShape.id,
		originalText:    pNode.label,
		autoResize:      true,
		lineHeight:      tmpLineHt,
		index:           null
	};

	// Wire the binding both directions: shape carries a boundElements ref
	// to the text, text carries containerId to the shape.
	pShape.boundElements = pShape.boundElements || [];
	pShape.boundElements.push({ id: tmpEl.id, type: 'text' });

	return tmpEl;
}

// Loop height for a self-loop on a node of the given height.  Shared
// between the arrow builder (which draws the arch) and autoLayoutFlow
// (which reserves matching headroom above rank-0 self-loops).
function selfLoopHeightFor(pNodeHeight)
{
	return Math.max(60, Math.round(pNodeHeight * 0.8));
}

function buildArrowElement(pEdge, pFromShape, pToShape, pProfile)
{
	let tmpSeed = seedFor(pProfile, 'arrow:' + pEdge.from + '->' + pEdge.to);
	let tmpId   = idFor('arrow-' + pEdge.from + '-' + pEdge.to, tmpSeed);
	let tmpIsSelfLoop = (pFromShape === pToShape);

	let tmpKind         = pEdge.kind || 'solid';        // 'solid' | 'dashed' | 'dotted' | 'curved'
	let tmpStrokeStyle  = (tmpKind === 'dashed' || tmpKind === 'dotted') ? tmpKind : 'solid';
	let tmpStrokeColor  = (pProfile.Palette && pProfile.Palette[pEdge.accent || 'link'])
	                       ? pProfile.Palette[pEdge.accent || 'link']
	                       : (pProfile.Palette && pProfile.Palette.link) || '#2E7D74';

	// Excalidraw arrows are stored as points relative to (x, y).  For a
	// normal edge we anchor the arrow at the from-shape's right edge and
	// let Excalidraw recompute the endpoints through the startBinding /
	// endBinding constraints when the user moves shapes.  For a self-loop
	// we hand-build a four-point arch over the top of the node and skip
	// the bindings (otherwise Excalidraw would straight-line the path
	// between the bound shape's edges, defeating the points we wrote).
	let tmpAabbX, tmpAabbY, tmpAabbW, tmpAabbH, tmpPoints;
	let tmpStartBinding, tmpEndBinding;
	if (tmpIsSelfLoop)
	{
		let tmpLoopH     = selfLoopHeightFor(pFromShape.height);
		let tmpStartAbsX = pFromShape.x + Math.round(pFromShape.width * 0.7);
		let tmpEndAbsX   = pFromShape.x + Math.round(pFromShape.width * 0.3);
		tmpAabbX = tmpEndAbsX;
		tmpAabbY = pFromShape.y - tmpLoopH;
		tmpAabbW = tmpStartAbsX - tmpEndAbsX;
		tmpAabbH = tmpLoopH;
		// Path: start (top-right of node) → up → across → end (top-left).
		// With roundness 2 Excalidraw smooths the corners into an arc.
		tmpPoints = [
			[ tmpAabbW, tmpAabbH ],
			[ tmpAabbW, 0        ],
			[ 0,        0        ],
			[ 0,        tmpAabbH ]
		];
		tmpStartBinding = null;
		tmpEndBinding   = null;
	}
	else
	{
		let tmpStartX = pFromShape.x + pFromShape.width;
		let tmpStartY = pFromShape.y + pFromShape.height / 2;
		let tmpEndX   = pToShape.x;
		let tmpEndY   = pToShape.y + pToShape.height / 2;
		tmpAabbX = tmpStartX;
		tmpAabbY = tmpStartY;
		tmpAabbW = tmpEndX - tmpStartX;
		tmpAabbH = tmpEndY - tmpStartY;
		tmpPoints = [ [0, 0], [ tmpAabbW, tmpAabbH ] ];
		tmpStartBinding = { elementId: pFromShape.id, focus: 0, gap: 8 };
		tmpEndBinding   = { elementId: pToShape.id,   focus: 0, gap: 8 };
	}

	let tmpEl = {
		id:                tmpId,
		type:              'arrow',
		x:                 tmpAabbX,
		y:                 tmpAabbY,
		width:             tmpAabbW,
		height:            tmpAabbH,
		angle:             0,
		strokeColor:       tmpStrokeColor,
		backgroundColor:   'transparent',
		fillStyle:         'solid',
		strokeWidth:       pProfile.StrokeWidth || 2,
		strokeStyle:       tmpStrokeStyle,
		roughness:         (pProfile.Roughness !== undefined) ? pProfile.Roughness : 1,
		opacity:           100,
		groupIds:          [],
		frameId:           null,
		roundness:         { type: 2 },
		seed:              tmpSeed,
		version:           1,
		versionNonce:      tmpSeed,
		isDeleted:         false,
		boundElements:     [],
		updated:           1,
		link:              null,
		locked:            false,
		points:            tmpPoints,
		lastCommittedPoint: null,
		startBinding:      tmpStartBinding,
		endBinding:        tmpEndBinding,
		startArrowhead:    null,
		endArrowhead:      'arrow',
		elbowed:           false,
		index:             null
	};

	// Carry the from/to shape binding info on the shapes themselves so
	// Excalidraw redraws the arrow correctly on shape moves.  For a
	// self-loop both endpoints land on the same shape; record the arrow
	// once to avoid a duplicate entry.
	pFromShape.boundElements = pFromShape.boundElements || [];
	pFromShape.boundElements.push({ id: tmpEl.id, type: 'arrow' });
	if (pToShape !== pFromShape)
	{
		pToShape.boundElements = pToShape.boundElements || [];
		pToShape.boundElements.push({ id: tmpEl.id, type: 'arrow' });
	}

	return tmpEl;
}

function buildEdgeLabel(pEdge, pArrow, pProfile)
{
	if (!pEdge.label) return null;
	let tmpSeed     = seedFor(pProfile, 'edge-label:' + pEdge.from + '->' + pEdge.to);
	let tmpId       = idFor('edge-label-' + pEdge.from + '-' + pEdge.to, tmpSeed);
	let tmpFontSize = Math.max(14, (pProfile.FontSize || 20) - 4);

	let tmpW    = Math.max(40, (pEdge.label.length * tmpFontSize * 0.55));
	let tmpH    = Math.ceil(tmpFontSize * 1.25);

	let tmpX, tmpY;
	if (pEdge.from === pEdge.to)
	{
		// Self-loop: pArrow.y is the apex of the arch (the AABB top) and
		// pArrow.x is the arch's leftmost x.  Center the label above the
		// apex rather than at the midpoint — the geometric midpoint sits
		// inside the arch (or on top of the node body for shallow loops).
		let tmpCenterX = pArrow.x + pArrow.width / 2;
		tmpX = Math.round(tmpCenterX - tmpW / 2);
		tmpY = Math.round(pArrow.y - tmpH - 6);
	}
	else
	{
		// Center the label on the arrow midpoint.
		let tmpMidX = pArrow.x + pArrow.width  / 2;
		let tmpMidY = pArrow.y + pArrow.height / 2;
		tmpX = Math.round(tmpMidX - tmpW / 2);
		tmpY = Math.round(tmpMidY - tmpH / 2 - 6);
	}

	let tmpEl = {
		id:               tmpId,
		type:             'text',
		x:                tmpX,
		y:                tmpY,
		width:            tmpW,
		height:           tmpH,
		angle:            0,
		strokeColor:      pArrow.strokeColor,
		backgroundColor:  'transparent',
		fillStyle:        'solid',
		strokeWidth:      1,
		strokeStyle:      'solid',
		roughness:        1,
		opacity:          100,
		groupIds:         [],
		frameId:          null,
		roundness:        null,
		seed:             tmpSeed,
		version:          1,
		versionNonce:     tmpSeed,
		isDeleted:        false,
		boundElements:    null,
		updated:          1,
		link:             null,
		locked:           false,
		text:             pEdge.label,
		fontSize:         tmpFontSize,
		fontFamily:       fontFamilyIndex(pProfile),
		textAlign:        'center',
		verticalAlign:    'middle',
		baseline:         Math.round(tmpFontSize * 0.75),
		containerId:      null,
		originalText:     pEdge.label,
		autoResize:       true,
		lineHeight:       1.25,
		index:            null
	};
	return tmpEl;
}

function buildTitleElement(pTitle, pProfile, pBounds)
{
	let tmpSeed     = seedFor(pProfile, 'title:' + pTitle);
	let tmpId       = idFor('title', tmpSeed);
	let tmpFontSize = Math.round((pProfile.FontSize || 20) * 1.5);
	let tmpW        = Math.max(160, pTitle.length * tmpFontSize * 0.55);
	let tmpH        = Math.ceil(tmpFontSize * 1.25);
	let tmpPad      = (pProfile.Layout && pProfile.Layout.padding) || 40;

	// autoLayoutFlow reserves 80px of title space above its first row,
	// so the title can sit inside the diagram's bounding box instead of
	// risking placement at negative y (where viewers may not see it).
	let tmpTitleY = Math.max(tmpPad / 2, pBounds.minY - tmpH - 12);

	return {
		id:              tmpId,
		type:            'text',
		x:               pBounds.minX,
		y:               tmpTitleY,
		width:           tmpW,
		height:          tmpH,
		angle:           0,
		strokeColor:     (pProfile.Palette && pProfile.Palette.ink) || '#1B1F23',
		backgroundColor: 'transparent',
		fillStyle:       'solid',
		strokeWidth:     1,
		strokeStyle:     'solid',
		roughness:       1,
		opacity:         100,
		groupIds:        [],
		frameId:         null,
		roundness:       null,
		seed:            tmpSeed,
		version:         1,
		versionNonce:    tmpSeed,
		isDeleted:       false,
		boundElements:   null,
		updated:         1,
		link:            null,
		locked:          false,
		text:            pTitle,
		fontSize:        tmpFontSize,
		fontFamily:      fontFamilyIndex(pProfile),
		textAlign:       'left',
		verticalAlign:   'top',
		baseline:        Math.round(tmpFontSize * 0.75),
		containerId:     null,
		originalText:    pTitle,
		autoResize:      true,
		lineHeight:      1.25,
		index:           null
	};
}

// ----- Top-level generator --------------------------------------------------

function generateNotebookDiagram(pInput, pProfile)
{
	let tmpProfile = Object.assign({}, _DefaultProfile, pProfile || {});
	let tmpInput   = pInput || {};

	let tmpNodes = (tmpInput.nodes || []).map((n) => Object.assign({}, n));
	let tmpEdges = (tmpInput.edges || []).map((e) => Object.assign({}, e));
	let tmpLayout = tmpInput.layout || 'flow';

	if (tmpLayout === 'flow')      autoLayoutFlow(tmpNodes, tmpEdges, tmpProfile);
	else if (tmpLayout === 'grid') autoLayoutGrid(tmpNodes, tmpProfile);
	// 'manual' leaves x/y untouched

	// Build the shapes + labels.  Track shapes-by-id so edge construction
	// can resolve binding targets.
	let tmpElements = [];
	let tmpShapeById = {};
	for (let i = 0; i < tmpNodes.length; i++)
	{
		let tmpShape = buildShapeElement(tmpNodes[i], tmpProfile);
		tmpShapeById[tmpNodes[i].id] = tmpShape;
		tmpElements.push(tmpShape);
		let tmpLabel = buildLabelElement(tmpNodes[i], tmpShape, tmpProfile);
		if (tmpLabel) tmpElements.push(tmpLabel);
	}

	// Build arrows + their midpoint labels
	for (let i = 0; i < tmpEdges.length; i++)
	{
		let tmpEdge = tmpEdges[i];
		let tmpFrom = tmpShapeById[tmpEdge.from];
		let tmpTo   = tmpShapeById[tmpEdge.to];
		if (!tmpFrom || !tmpTo) continue;
		let tmpArrow = buildArrowElement(tmpEdge, tmpFrom, tmpTo, tmpProfile);
		tmpElements.push(tmpArrow);
		let tmpEdgeLabel = buildEdgeLabel(tmpEdge, tmpArrow, tmpProfile);
		if (tmpEdgeLabel) tmpElements.push(tmpEdgeLabel);
	}

	// Compute bounds for the title placement
	let tmpBounds = { minX: 9999999, minY: 9999999, maxX: -9999999, maxY: -9999999 };
	for (let i = 0; i < tmpElements.length; i++)
	{
		let tmpE = tmpElements[i];
		if (tmpE.x < tmpBounds.minX) tmpBounds.minX = tmpE.x;
		if (tmpE.y < tmpBounds.minY) tmpBounds.minY = tmpE.y;
		if (tmpE.x + tmpE.width  > tmpBounds.maxX) tmpBounds.maxX = tmpE.x + tmpE.width;
		if (tmpE.y + tmpE.height > tmpBounds.maxY) tmpBounds.maxY = tmpE.y + tmpE.height;
	}
	if (tmpInput.title)
	{
		tmpElements.unshift(buildTitleElement(tmpInput.title, tmpProfile, tmpBounds));
	}

	let tmpAppState = Object.assign(
		{},
		tmpProfile.AppState || {},
		{ currentItemFontFamily: fontFamilyIndex(tmpProfile) }
	);

	return {
		type:     'excalidraw',
		version:  2,
		source:   'pict-section-excalidraw/notebook-generator',
		elements: tmpElements,
		appState: tmpAppState,
		files:    {}
	};
}

module.exports = generateNotebookDiagram;
module.exports.generateNotebookDiagram = generateNotebookDiagram;
module.exports.defaultProfile = _DefaultProfile;
module.exports.fontFamilyMap  = _FontFamilyMap;

// ----- CLI ------------------------------------------------------------------

if (require.main === module)
{
	let tmpArgs = process.argv.slice(2);
	let tmpInPath  = tmpArgs[0] || null;
	let tmpOutPath = tmpArgs[1] || null;

	let tmpRead = (p) => libFs.readFileSync(p, 'utf8');
	let tmpInJSON;
	if (tmpInPath)
	{
		tmpInJSON = tmpRead(tmpInPath);
	}
	else
	{
		let tmpChunks = [];
		process.stdin.on('data', (c) => tmpChunks.push(c));
		process.stdin.on('end', () =>
		{
			tmpInJSON = Buffer.concat(tmpChunks).toString('utf8');
			run();
		});
		if (process.stdin.isTTY)
		{
			process.stderr.write('Usage: node Generate-Notebook-Diagram.js <input.json> [output.json]\n' +
				'   or: cat input.json | node Generate-Notebook-Diagram.js > output.json\n');
			process.exit(1);
		}
		return;
	}
	run();

	function run()
	{
		let tmpInput;
		try { tmpInput = JSON.parse(tmpInJSON); }
		catch (pErr) { process.stderr.write('Invalid input JSON: ' + pErr.message + '\n'); process.exit(2); }

		let tmpScene = generateNotebookDiagram(tmpInput, null);
		let tmpOut   = JSON.stringify(tmpScene, null, 2);
		if (tmpOutPath)
		{
			libFs.writeFileSync(tmpOutPath, tmpOut, 'utf8');
			process.stderr.write('[notebook-diagram] wrote ' + tmpOutPath + ' (' + tmpScene.elements.length + ' elements)\n');
		}
		else
		{
			process.stdout.write(tmpOut + '\n');
		}
	}
}
