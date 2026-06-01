# pict-section-excalidraw

A Pict view that wraps [Excalidraw](https://excalidraw.com) as an embeddable, themable drawing control. Drop it into a `<div>` like any other pict-section.

## Why this exists

Excalidraw is wonderful but it's React-only and lives upstream on GitHub. To insulate the Retold ecosystem from upstream drift (and from GitHub itself disappearing), this module **mirrors the entire Excalidraw repository** into `vendor/excalidraw/`. The mirror has no `.git/` - it's frozen-in-time source we can patch in place and rebuild. Drift is a feature.

## Modes

The view supports two embedding strategies, picked at construction via the `EmbedMode` option:

| Mode | When to use | Trade-off |
|---|---|---|
| `react` (default) | Best theme conformance, smallest bundle if your app already loads React. Mounts `<Excalidraw>` into the destination div via `ReactDOM.createRoot`. | Adds React + ReactDOM to the page's runtime. |
| `iframe` | Total CSS isolation. Useful when host app has aggressive global styles you don't want bleeding into Excalidraw. | Theme passed via `postMessage`, slightly more API plumbing. |

Both modes share the same public API.

## Public API

### Configuration options

```javascript
{
    EmbedMode: 'react',                       // or 'iframe'
    TargetElementAddress: '#Excalidraw-Container',
    DrawingDataAddress: 'AppData.Drawing',    // optional AppData binding
    Theme: 'light',                           // 'light' | 'dark' | 'auto' (follow pict theme)
    ViewModeEnabled: false,
    ZenModeEnabled: false,
    GridModeEnabled: false,
    LangCode: 'en',
    UIOptions: { /* Excalidraw UIOptions */ },
    InitialData: { elements: [], appState: {}, files: {} },
    AssetBaseURL: './excalidraw-assets/',     // fonts + locales
    OnLoad: (pView, fCallback) => { /* fCallback(err, sceneData) */ },
    OnSave: (pView, pSceneData, fCallback) => { /* fCallback(err) */ },
    OnChange: (pView, pSceneData) => { /* throttled change notify */ }
}
```

### Methods

```javascript
view.getScene()                  // -> { elements, appState, files }
view.setScene(sceneData)         // void
view.exportSvg(opts)             // -> Promise<SVGElement>
view.exportBlob(opts)            // -> Promise<Blob>  (PNG)
view.serialize()                 // -> JSON string of the current scene
view.setTheme('light'|'dark')    // void
view.setReadOnly(bool)           // void
view.load()                      // re-invokes OnLoad and applies result
view.save()                      // invokes OnSave with current scene
view.destroy()                   // teardown
```

### Override loading & saving

Pass `OnLoad` and `OnSave` callbacks to plug into whatever storage layer you want - local files, a Meadow record, IndexedDB, or a remote API. If you don't pass them, the view defaults to reading/writing the AppData address you bind via `DrawingDataAddress`.

```javascript
{
    OnLoad: (pView, fCallback) =>
    {
        fetch('/api/diagrams/42').then(r => r.json()).then(d => fCallback(null, d));
    },
    OnSave: (pView, pSceneData, fCallback) =>
    {
        fetch('/api/diagrams/42', { method: 'PUT', body: JSON.stringify(pSceneData) })
            .then(() => fCallback(null));
    }
}
```

## Theme conformance

The view's chrome uses `pict-section-theme` CSS custom properties (`--theme-color-*`). Excalidraw's own canvas chrome is themed via a CSS bridge that maps pict tokens to Excalidraw's internal vars. Switching the pict theme retints Excalidraw without re-rendering.

In `iframe` mode, theme tokens are piped through `postMessage` and re-applied as CSS variables on the iframe document.

## Vendor mirror

```
vendor/
├── excalidraw/                  Frozen-in-time mirror of github.com/excalidraw/excalidraw
└── excalidraw-built/            Pre-built artifacts shipped to consumers (committed)
    ├── react-vendor.min.js        React + ReactDOM as window globals (omit if the host already loads React)
    ├── excalidraw-wrapper.min.js  @excalidraw/excalidraw + helpers, exposed as window.PictSectionExcalidrawVendor (reads React off the window)
    ├── excalidraw-wrapper.css     The @excalidraw/excalidraw stylesheet
    ├── excalidraw-iframe-host.html
    ├── excalidraw-iframe-host.js
    └── assets/                  Fonts + locales (EXCALIDRAW_ASSET_PATH)
```

Run `npm run build:vendor` to rebuild from `vendor/excalidraw/`.

## Demos

```bash
cd example_applications/full_browser_excalidraw && npm install && npm start
cd example_applications/embedded_excalidraw     && npm install && npm start
```
