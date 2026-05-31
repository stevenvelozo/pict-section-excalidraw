# API Reference

Every developer-facing method and callback on `pict-section-excalidraw`. Signatures follow the source in `source/views/PictView-Excalidraw-React.js` and `source/views/PictView-Excalidraw-Iframe.js`.

The default export, `PictSectionExcalidraw`, is a dispatcher that proxies the methods below onto whichever implementation `EmbedMode` selects. The two implementation classes -- reachable as `PictSectionExcalidraw.ReactView` and `PictSectionExcalidraw.IframeView` -- share the same method names; where their behavior differs, it is called out per method. Both extend [`pict-view`](https://fable-retold.github.io/pict-view/), so they inherit `render()`, `initialize()`, and the standard lifecycle methods.

A scene object throughout this reference is the shape `{ elements, appState, files }`.

## Module Exports

```javascript
const libPictSectionExcalidraw = require('pict-section-excalidraw');

libPictSectionExcalidraw;                       // PictSectionExcalidraw (dispatcher, default export)
libPictSectionExcalidraw.default_configuration; // the shared default configuration object
libPictSectionExcalidraw.ReactView;             // PictViewExcalidrawReact
libPictSectionExcalidraw.IframeView;            // PictViewExcalidrawIframe
libPictSectionExcalidraw.selectImplementation;  // (options) => ReactView | IframeView
```

`selectImplementation(pOptions)` returns `IframeView` when `pOptions.EmbedMode` (or the default) is `'iframe'`, and `ReactView` otherwise.

## Callbacks

The callback surface is identical across both modes. All three are passed in the view configuration and default to `null`. The load/save callbacks use the Node-style `fCallback(err, value)` convention so they compose with the rest of the Fable / Pict async patterns.

### `OnLoad(pView, fCallback)`

Invoked by `load()` to fetch the scene to display. Call `fCallback(err, sceneData)` -- pass the error first if loading failed, otherwise pass the scene object (or an elements array, or `null` for "nothing to load"). When `OnLoad` is not set, `load()` reads from `DrawingDataAddress` instead.

| Param | Type | Description |
|---|---|---|
| `pView` | view | The view instance, so the callback can reach `pView.options`, `pView.pict`, etc. |
| `fCallback` | function | `(err, sceneData)`. Resolve with the scene to apply, or `(null, null)` for none. |

```javascript
"OnLoad": (pView, fCallback) =>
{
	fetch('/api/diagrams/42')
		.then((pResponse) => pResponse.json())
		.then((pData) => fCallback(null, pData))
		.catch((pErr) => fCallback(pErr));
}
```

### `OnSave(pView, pSceneData, fCallback)`

Invoked by `save()` with the current scene. Persist it however you like, then call `fCallback(err)` (pass nothing / a falsy value on success). When `OnSave` is not set, `save()` writes the scene to `DrawingDataAddress` instead.

| Param | Type | Description |
|---|---|---|
| `pView` | view | The view instance. |
| `pSceneData` | object | The current scene `{ elements, appState, files }`. |
| `fCallback` | function | `(err)`. Pass an error to log a save failure. |

```javascript
"OnSave": (pView, pSceneData, fCallback) =>
{
	fetch('/api/diagrams/42', { method: 'PUT', body: JSON.stringify(pSceneData) })
		.then(() => fCallback(null))
		.catch((pErr) => fCallback(pErr));
}
```

### `OnChange(pView, pSceneData)`

Fired during active editing, throttled to `OnChangeThrottleMs` (default 250 ms). Excalidraw emits a change on every pointer move; the wrapper batches them. If `DrawingDataAddress` is set, the throttled scene is also written to AppData on the same tick (just before `OnChange` runs). Exceptions thrown by `OnChange` are caught and logged.

| Param | Type | Description |
|---|---|---|
| `pView` | view | The view instance. |
| `pSceneData` | object | A snapshot `{ elements, appState, files }`. In react mode this is a shallow clone (the arrays are copied so the snapshot will not mutate underneath you). |

```javascript
"OnChange": (pView, pScene) =>
{
	document.getElementById('Status').textContent = `${pScene.elements.length} element(s)`;
}
```

## Scene Methods

### `getScene()`

Return the current scene as `{ elements, appState, files }`.

- **React mode:** reads the live scene synchronously from the Excalidraw API. Returns `null` if Excalidraw is not yet mounted.
- **Iframe mode:** returns the most recent change snapshot synchronously (or `null` if none has arrived). For the freshest scene, use `requestScene()`.

**Returns:** `object | null`

### `requestScene()` (iframe mode only)

Ask the iframe for the live scene over postMessage. Resolves with `{ elements, appState, files }`.

**Returns:** `Promise<object>`

> Not on the dispatcher's proxied method list -- call it on an `IframeView` instance directly.

### `setScene(pSceneData)`

Replace the current scene. Accepts either a full `{ elements, appState, files }` object or just an elements array (react mode wraps a bare array into a scene).

- **React mode:** calls `excalidrawAPI.updateScene(...)` and adds any `files`. Returns `false` if not mounted or `pSceneData` is falsy, `true` otherwise.
- **Iframe mode:** posts a `pict-excalidraw:setScene` message. Returns `false` if `pSceneData` is falsy, `true` otherwise.

| Param | Type | Description |
|---|---|---|
| `pSceneData` | object &#124; array | The scene to apply, or an elements array. |

**Returns:** `boolean`

### `serialize()`

Return the current scene as a JSON string compatible with `.excalidraw` files.

- **React mode:** uses Excalidraw's `serializeAsJSON` when available, otherwise builds an equivalent `{ type: 'excalidraw', version: 2, source: 'pict-section-excalidraw', ... }` object.
- **Iframe mode:** serializes the last change snapshot into the same `{ type: 'excalidraw', version: 2, ... }` shape.

Returns `null` if there is no scene to serialize.

**Returns:** `string | null`

## Export Methods

### `exportSvg(pOpts)`

Export the current scene as an `SVGElement`.

- **React mode:** resolves with an `SVGElement`. The export-control keys that Excalidraw expects on `appState` (`exportEmbedScene`, `exportBackground`, `exportPadding`, `exportScale`, `exportWithDarkMode`) are auto-promoted from the top level of `pOpts` onto `appState`, so you can write `view.exportSvg({ exportEmbedScene: true })` without remembering which key lives where. Rejects if Excalidraw is not mounted or the helper is unavailable.
- **Iframe mode:** resolves with the SVG serialized to a **string** (an SVG element is not structured-cloneable across the postMessage boundary).

| Param | Type | Description |
|---|---|---|
| `pOpts` | object | Optional export options, passed through to Excalidraw's `exportToSvg`. |

**Returns:** `Promise<SVGElement>` (react) / `Promise<string>` (iframe)

```javascript
view.exportSvg({ exportEmbedScene: true }).then((pSvg) =>
{
	// react mode: pSvg is an SVGElement
	let tmpBlob = new Blob([new XMLSerializer().serializeToString(pSvg)], { type: 'image/svg+xml' });
	// ...trigger a download
});
```

### `exportBlob(pOpts)`

Export the current scene as a PNG `Blob`.

- **React mode:** resolves with a PNG `Blob`. The same `appState` export keys are auto-promoted as for `exportSvg`. Rejects if not mounted or the helper is unavailable.
- **Iframe mode:** posts a request to the host, which returns the PNG blob via the `blobReply` message. Works in both modes.

| Param | Type | Description |
|---|---|---|
| `pOpts` | object | Optional export options, passed through to Excalidraw's `exportToBlob`. |

**Returns:** `Promise<Blob>`

## Theme & Mode

### `setTheme(pTheme)`

Switch the Excalidraw light/dark theme. Accepts `'light'`, `'dark'`, or `'auto'` (which resolves against the pict theme). Updates the view's `_currentTheme` so subsequent re-mounts use the latest value.

- **React mode:** applies the resolved theme via `excalidrawAPI.updateScene({ appState: { theme } })`.
- **Iframe mode:** posts `pict-excalidraw:setTheme` and re-pushes the theme tokens.

| Param | Type | Description |
|---|---|---|
| `pTheme` | string | `'light'`, `'dark'`, or `'auto'`. |

### `setReadOnly(pReadOnly)`

Toggle Excalidraw's view (read-only) mode. Also updates `options.ViewModeEnabled`.

- **React mode:** `excalidrawAPI.updateScene({ appState: { viewModeEnabled } })`.
- **Iframe mode:** posts `pict-excalidraw:setReadOnly`.

| Param | Type | Description |
|---|---|---|
| `pReadOnly` | boolean | `true` for read-only, `false` for editable. |

## Load & Save

### `load()`

Populate the canvas. If `OnLoad` is registered, it is invoked and the returned scene is applied via `setScene`. Otherwise, if `DrawingDataAddress` is set, the scene is read from AppData and applied. Errors surfaced through the `OnLoad` callback are logged.

### `save()`

Persist the current scene. If `OnSave` is registered, it is invoked with the current scene. Otherwise, if `DrawingDataAddress` is set, the scene is written to AppData.

- **Iframe mode:** prefers the last change snapshot; if none exists yet, it first fetches the live scene via `requestScene()` and then saves.

## Mermaid Import (react mode only)

### `convertMermaidToExcalidraw(pMermaid, pOpts)`

Convert a mermaid diagram source string into Excalidraw scene elements, optionally applying them to the live canvas. Uses the bundled mermaid-to-excalidraw + `convertToExcalidrawElements` helpers exposed on the vendor bundle. Rejects if those helpers are unavailable (an out-of-date wrapper bundle).

| Param | Type | Description |
|---|---|---|
| `pMermaid` | string | Mermaid source (flowchart, sequence, class, ...). |
| `pOpts` | object | Optional. |
| `pOpts.apply` | boolean | When `true` (default), replaces the current scene with the converted elements via `setScene`. When `false`, returns the elements without touching the canvas. |
| `pOpts.mermaidOptions` | object | Forwarded to the mermaid parser (e.g. `{ fontSize: 16 }`). |

**Returns:** `Promise<{ elements: any[], files: object }>`

```javascript
view.convertMermaidToExcalidraw('flowchart TD\n A --> B', { apply: true })
	.then((pResult) => { /* pResult.elements applied to the canvas */ });
```

> In iframe mode the dispatcher proxies this method, but the iframe implementation does not define it, so the call returns `undefined`. Use react mode for mermaid import.

## Vendor & Lifecycle

### `getApi()`

Return the live Excalidraw imperative API handle.

- **React mode:** the handle once mounted, otherwise `null`.
- **Iframe mode:** always `null` -- the live API is hidden behind postMessage.

**Returns:** `object | null`

### `connectExcalidrawGlobal(pVendor)` (react mode)

Supply the vendor globals explicitly instead of having the view resolve `window.PictSectionExcalidrawVendor` at first render. Returns `true` if the object contains `Excalidraw`, `React`, and `ReactDOM`; `false` otherwise.

| Param | Type | Description |
|---|---|---|
| `pVendor` | object | `{ React, ReactDOM, Excalidraw, exportToSvg?, exportToBlob?, serializeAsJSON? }`. |

**Returns:** `boolean`

### `destroy()`

Tear down the view. Idempotent -- safe to call twice. After `destroy()`, public methods that touch the DOM / React become no-ops via the `_destroyed` gate.

- **React mode:** clears the change throttle, unmounts the React root, and clears the destination DOM.
- **Iframe mode:** clears the throttle, removes the `message` listener, rejects any in-flight request promises with `view destroyed`, navigates the iframe to `about:blank`, and clears the destination DOM.

### `isDestroyed()`

**Returns:** `boolean` -- whether `destroy()` has been called.

## Method Availability Matrix

| Method | React | Iframe | Proxied by dispatcher |
|---|---|---|---|
| `getScene()` | live, sync | last snapshot, sync | yes |
| `requestScene()` | -- | yes (async) | no |
| `setScene()` | yes | yes | yes |
| `serialize()` | yes | yes (from snapshot) | yes |
| `exportSvg()` | yes (SVGElement) | yes (string) | yes |
| `exportBlob()` | yes | yes | yes |
| `setTheme()` | yes | yes | yes |
| `setReadOnly()` | yes | yes | yes |
| `load()` | yes | yes | yes |
| `save()` | yes | yes | yes |
| `convertMermaidToExcalidraw()` | yes | -- | yes |
| `getApi()` | yes | `null` | yes |
| `connectExcalidrawGlobal()` | yes | n/a | yes |
| `destroy()` | yes | yes | yes |
| `isDestroyed()` | yes | yes | yes |
