# Configuration

`pict-section-excalidraw` ships with a `default_configuration` object that is merged with any options you pass in the constructor (or via `pict.addView(name, options, Class)`). Your options take precedence, so you only need to specify the keys you want to change.

The same configuration object backs the dispatcher and both implementation views, defined in `source/Pict-Section-Excalidraw-DefaultConfiguration.js`.

## Default Configuration

```javascript
{
	"RenderOnLoad": true,

	"DefaultRenderable": "Excalidraw-Wrap",
	"DefaultDestinationAddress": "#Excalidraw-Container-Div",
	"TargetElementAddress": "#Excalidraw-Container-Div",

	"EmbedMode": "react",

	"DrawingDataAddress": false,

	"Theme": "light",
	"ViewModeEnabled": false,
	"ZenModeEnabled": false,
	"GridModeEnabled": false,
	"LangCode": "en",
	"UIOptions": {},

	"InitialData": { "elements": [], "appState": {}, "files": {} },

	"AssetBaseURL": "./excalidraw-assets/",
	"IframeHostURL": "./excalidraw-iframe-host.html",

	"LazyLoadReactVendorURL": null,
	"LazyLoadWrapperURL": null,

	"OnLoad": null,
	"OnSave": null,
	"OnChange": null,
	"OnChangeThrottleMs": 250,

	"Templates": [ /* default placeholder container */ ],
	"Renderables": [ /* default renderable */ ],
	"CSS": "/* theme-bridge CSS — see below */"
}
```

## Settings Reference

### Pict / Rendering

| Setting | Type | Default | Description |
|---|---|---|---|
| `RenderOnLoad` | boolean | `true` | Inherited from `pict-view`. When true, the view renders as soon as it is initialized. |
| `DefaultRenderable` | string | `"Excalidraw-Wrap"` | Hash of the default renderable invoked on render. Override only if you supply your own template. |
| `DefaultDestinationAddress` | string | `"#Excalidraw-Container-Div"` | CSS selector the default renderable writes into. |
| `TargetElementAddress` | string | `"#Excalidraw-Container-Div"` | CSS selector for the element the view takes ownership of and mounts Excalidraw into. The host page must provide this element. |

### Mode

| Setting | Type | Default | Description |
|---|---|---|---|
| `EmbedMode` | string | `"react"` | `"react"` mounts `<Excalidraw>` via `ReactDOM.createRoot`; `"iframe"` hosts an `<iframe>` and communicates over postMessage. Only read by the dispatcher (`PictSectionExcalidraw`); ignored if you instantiate `ReactView` / `IframeView` directly. See [Architecture](architecture.md). |

### Data Binding

| Setting | Type | Default | Description |
|---|---|---|---|
| `DrawingDataAddress` | string &#124; `false` | `false` | Dot-notation address in `pict.AppData` to two-way bind the scene JSON into. The view reads it on load and writes the throttled scene back on change. A leading `AppData.` prefix is stripped automatically. Set to `false` to opt out. |
| `InitialData` | object | `{ elements: [], appState: {}, files: {} }` | The scene used for the synchronous mount when neither `DrawingDataAddress` nor `OnLoad` yields anything first. `OnLoad` fires asynchronously and replaces it via `setScene` once it resolves. |

### Excalidraw Behavior

These are forwarded to the `<Excalidraw>` props (react mode) or the `pict-excalidraw:init` payload (iframe mode).

| Setting | Type | Default | Description |
|---|---|---|---|
| `Theme` | string | `"light"` | `"light"`, `"dark"`, or `"auto"`. `"auto"` follows the pict theme -- it checks for a `theme-mode-dark` class on `documentElement`, then `pict.providers.ThemeSection.getCurrentMode()`. |
| `ViewModeEnabled` | boolean | `false` | Start Excalidraw in view (read-only) mode. Also toggled at runtime by `setReadOnly()`. |
| `ZenModeEnabled` | boolean | `false` | Start in zen mode (minimal chrome). |
| `GridModeEnabled` | boolean | `false` | Start with the dot grid visible. |
| `LangCode` | string | `"en"` | Excalidraw UI language code. |
| `UIOptions` | object | `{}` | Forwarded verbatim to `<Excalidraw UIOptions={...}>`. See the [Excalidraw UIOptions docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/ui-options). |

### Assets & Bundles

| Setting | Type | Default | Description |
|---|---|---|---|
| `AssetBaseURL` | string | `"./excalidraw-assets/"` | Base URL for Excalidraw's fonts + locale chunks. Set this to wherever you copied `vendor/excalidraw-built/assets/` at deploy time. In react mode it seeds `window.EXCALIDRAW_ASSET_PATH` (if not already set); in iframe mode it is forwarded in the init payload. |
| `IframeHostURL` | string | `"./excalidraw-iframe-host.html"` | (iframe mode only) URL of the iframe host page. Defaults to the host HTML sitting next to the page that loaded the wrapper bundle. |
| `LazyLoadReactVendorURL` | string &#124; `null` | `null` | URL to `react-vendor.min.js` (or any script that sets `window.React` + `window.ReactDOM`). Injected on demand the first time the view mounts if React is not already present. Leave `null` to require the host to load React via a `<script>` tag. |
| `LazyLoadWrapperURL` | string &#124; `null` | `null` | URL to `excalidraw-wrapper.min.js` (or any script that sets `window.PictSectionExcalidrawVendor`). When set, the view lazily injects the wrapper (and the react-vendor script, if configured) on first mount instead of requiring eager `<script>` tags. Leave `null` to preserve eager-load behavior. |

### Callbacks

See the [API Reference](api-reference.md) for full signatures and behavior.

| Setting | Type | Default | Description |
|---|---|---|---|
| `OnLoad` | function &#124; `null` | `null` | `(pView, fCallback) => { ... fCallback(err, sceneData) }`. Invoked by `load()` to fetch the scene. If unset, `load()` reads from `DrawingDataAddress`. |
| `OnSave` | function &#124; `null` | `null` | `(pView, pSceneData, fCallback) => { ... fCallback(err) }`. Invoked by `save()` with the current scene. If unset, `save()` writes to `DrawingDataAddress`. |
| `OnChange` | function &#124; `null` | `null` | `(pView, pSceneData) => { ... }`. Fired on a throttle during active editing. |
| `OnChangeThrottleMs` | number | `250` | Throttle interval (ms) for `OnChange` and the AppData write-back. Excalidraw fires its own change event on every pointer move; the wrapper batches them to this rate. |

### Pict View Internals

| Setting | Type | Default | Description |
|---|---|---|---|
| `Templates` | array | (default placeholder) | Pict template descriptors. The default registers a single `Excalidraw-Container` placeholder template; the views build the real DOM imperatively in `onAfterInitialRender`. Override only if you need to restructure the outer container. |
| `Renderables` | array | (default) | Pict renderable descriptors. The default wires `Excalidraw-Wrap` to the placeholder template at `#Excalidraw-Container-Div`. |
| `CSS` | string | (theme-bridge CSS) | The wrapper stylesheet, auto-registered through the Pict CSS cascade. Defines `.pict-excalidraw-wrap` (and the theme-bridge variables), `.pict-excalidraw-mount`, `.pict-excalidraw-iframe`, and `.pict-excalidraw-status`. See the [Theme Bridge](architecture.md) section. |

## Theme-Bridge CSS

The `CSS` key carries the wrapper's stylesheet. Two responsibilities live there:

1. **Layout** for the wrap, the react mount div, the iframe element, and the status/error overlay.
2. **The theme bridge** -- a block on `.pict-excalidraw-wrap` that maps `pict-section-theme` tokens onto the CSS variables Excalidraw's own stylesheet reads (`--default-bg-color`, `--island-bg-color`, `--color-primary`, `--button-hover-bg`, and others).

Every color is a `var(--theme-color-*, fallback)` chain, so the control re-tints when the app switches themes and still renders correctly (Excalidraw's official light palette) when no theme provider is present. Layout values are local; Excalidraw's chrome owns its own internal sizing.

You generally do not need to edit this CSS -- override theme behavior by supplying `--theme-color-*` tokens through [pict-section-theme](https://fable-retold.github.io/pict-section-theme/) instead.
