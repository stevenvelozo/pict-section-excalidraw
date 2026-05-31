# Quick Start

This guide walks through a minimal working integration of `pict-section-excalidraw` into a Pict application.

## 1. Install

```bash
npm install pict-section-excalidraw
```

## 2. Build (or Copy) the Vendor Bundles

The view does not bundle Excalidraw itself -- it expects the pre-built browser artifacts to be on the page. Build them once from the vendored Excalidraw source:

```bash
npm run build:vendor
```

This writes the following into `vendor/excalidraw-built/`:

| File | What it provides |
|---|---|
| `react-vendor.min.js` | React + ReactDOM as window globals. Skip loading this if your app already provides React. |
| `excalidraw-wrapper.min.js` | Excalidraw + its export/serialize/mermaid helpers, exposed as `window.PictSectionExcalidrawVendor`. |
| `excalidraw-wrapper.css` | The Excalidraw stylesheet. |
| `excalidraw-iframe-host.html` / `.js` | The host page used by `iframe` mode. |
| `assets/` | Fonts + locale chunks, located at runtime via `EXCALIDRAW_ASSET_PATH`. |

Copy these next to your built page at deploy time (e.g. with a Quackage `copyFiles` entry).

## 3. Load the Browser Prerequisites

In `react` mode (the default), include the bundles in your page. Order matters -- `react-vendor.min.js` must come before `excalidraw-wrapper.min.js`:

```html
<style id="PICT-CSS"></style>
<link rel="stylesheet" href="./excalidraw-wrapper.css" />

<script src="./pict.min.js"></script>

<!-- React + ReactDOM as window globals.  Omit this <script> if React
     is already loaded elsewhere on the page. -->
<script src="./react-vendor.min.js"></script>

<!-- Excalidraw wrapper — must come AFTER react-vendor. -->
<script src="./excalidraw-wrapper.min.js"></script>

<!-- Your built Pict application bundle. -->
<script src="./my_app.min.js"></script>
```

> If you would rather not load these eagerly on every page, leave the script tags off and set `LazyLoadReactVendorURL` / `LazyLoadWrapperURL` in the view configuration instead -- see [Configuration](configuration.md). The first time a view mounts it will inject the scripts on demand.

## 4. Provide a Mount Point

The view's `default_configuration` renders into the element at `#Excalidraw-Container-Div`. Add an element that fills the area you want the canvas to occupy. Excalidraw reflows to fit its container, so give the container a height:

```html
<div id="Excalidraw-Container-Div" style="width: 100%; height: 600px;"></div>
```

## 5. Extend the View Class

Subclass one of the implementation views. The examples extend `ReactView` directly:

```javascript
const libPictSectionExcalidraw = require('pict-section-excalidraw');

class ExampleDrawingView extends libPictSectionExcalidraw.ReactView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}
}
```

To let the `EmbedMode` option pick the implementation at runtime instead, subclass the default export (`libPictSectionExcalidraw`) -- the dispatcher proxies the full public API onto whichever mode it selects.

## 6. Register the View

Merge any custom options and register the class with Pict:

```javascript
const _ExampleDrawingConfiguration =
{
	"ViewIdentifier": "ExampleDrawingView",
	"TargetElementAddress": "#Excalidraw-Container-Div",
	"DrawingDataAddress": "AppData.Drawing",
	"Theme": "light",
	"AssetBaseURL": "./excalidraw-assets/"
};

this.pict.addView('ExampleDrawingView', _ExampleDrawingConfiguration, ExampleDrawingView);
```

`DrawingDataAddress` two-way binds the scene to `pict.AppData.Drawing`: the view reads it on load and writes the throttled scene back on every change. Set it to `false` to opt out.

## 7. Render It

Trigger the render once the application has initialized:

```javascript
onAfterInitialize()
{
	super.onAfterInitialize();
	let tmpView = this.pict.views.ExampleDrawingView;
	if (tmpView)
	{
		tmpView.render();
	}
}
```

This is enough for a fully editable, theme-aware drawing canvas.

## 8. Custom Save & Load

To plug into your own storage instead of (or in addition to) the AppData binding, pass `OnLoad` and `OnSave` callbacks. Both use the Node-style `fCallback(err, value)` convention so they compose with the rest of the Fable / Pict async patterns:

```javascript
const STORAGE_KEY = 'my-app-scene';

const _ExampleDrawingConfiguration =
{
	"ViewIdentifier": "ExampleDrawingView",
	"TargetElementAddress": "#Excalidraw-Container-Div",

	"OnLoad": (pView, fCallback) =>
	{
		try
		{
			let tmpRaw = window.localStorage.getItem(STORAGE_KEY);
			if (!tmpRaw)
			{
				return fCallback(null, null);
			}
			fCallback(null, JSON.parse(tmpRaw));
		}
		catch (pErr)
		{
			fCallback(pErr);
		}
	},

	"OnSave": (pView, pSceneData, fCallback) =>
	{
		try
		{
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pSceneData));
			fCallback(null);
		}
		catch (pErr)
		{
			fCallback(pErr);
		}
	},

	"OnChange": (pView, pScene) =>
	{
		// Fires on a throttle (default 250 ms) during active editing.
		let tmpStatus = document.getElementById('SceneStatus');
		if (tmpStatus)
		{
			tmpStatus.textContent = `${pScene.elements.length} element(s).`;
		}
	}
};
```

Then call `pView.load()` to invoke `OnLoad` and apply the result, and `pView.save()` to invoke `OnSave` with the current scene. Real apps swap the localStorage body for a [Meadow](https://fable-retold.github.io/meadow/) record, IndexedDB, or a remote API.

## 9. Common Adjustments

| Need | Setting |
|---|---|
| Use iframe isolation | `EmbedMode: 'iframe'` |
| Start in dark mode | `Theme: 'dark'` |
| Follow the pict theme automatically | `Theme: 'auto'` |
| Open read-only | `ViewModeEnabled: true` |
| Start in zen mode | `ZenModeEnabled: true` |
| Show the dot grid | `GridModeEnabled: true` |
| Slow down change notifications | `OnChangeThrottleMs: 1000` |
| Lazy-load the bundles | `LazyLoadReactVendorURL` + `LazyLoadWrapperURL` |

## 10. Next Steps

- Read the [Architecture](architecture.md) to understand the two embed modes, the postMessage protocol, and the theme bridge.
- Browse the [API Reference](api-reference.md) for the full method set and callback signatures.
- Consult the [Configuration](configuration.md) reference for every key you can set.
