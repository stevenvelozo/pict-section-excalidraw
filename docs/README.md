# Pict Section Excalidraw

> An embeddable, themable Excalidraw drawing control for Pict applications

Pict Section Excalidraw is a [`pict-view`](https://fable-retold.github.io/pict-view/) subclass that wraps [Excalidraw](https://excalidraw.com) -- the open-source virtual whiteboard -- into the Pict MVC framework. Drop it into a `<div>` like any other pict-section and you get a fully wired drawing canvas: toolbars, shapes, text, freehand, and the full Excalidraw editing surface.

Excalidraw is React-only and lives upstream on GitHub. To insulate the Retold ecosystem from upstream drift, this module mirrors the entire Excalidraw repository into `vendor/excalidraw/` and ships pre-built browser bundles in `vendor/excalidraw-built/`. The host page loads those bundles via `<script>` tags (or lazily), and the view picks them up at render time.

## Two Classes, One Surface

The module exports a single dispatch view plus the two implementation classes it can choose between:

- **`PictSectionExcalidraw`** (default export) -- a thin dispatcher. It reads the `EmbedMode` option at construction, instantiates the matching implementation as a sibling view, and proxies the public API onto it. Hold a reference to the dispatcher and you do not have to care which mode is active.
- **`PictSectionExcalidraw.ReactView`** -- mounts `<Excalidraw>` into the destination div via `ReactDOM.createRoot`.
- **`PictSectionExcalidraw.IframeView`** -- hosts an `<iframe>` pointing at a vendored host page and talks to it over `postMessage`.

Both implementations expose the same `OnLoad` / `OnSave` / `OnChange` callback surface and the same `getScene` / `setScene` / `exportSvg` / `serialize` / `setTheme` method set, so you can switch modes by changing one option.

## Features

- **Two Embed Modes** -- `react` (default, best theme conformance) or `iframe` (total CSS isolation). See [Architecture](architecture.md).
- **Pluggable Save/Load** -- pass `OnLoad` and `OnSave` callbacks to read/write any storage layer. Omit them and the view falls back to the `DrawingDataAddress` AppData binding.
- **AppData Binding** -- set `DrawingDataAddress` to two-way bind the scene JSON into `pict.AppData`.
- **Throttled Change Notifications** -- `OnChange` fires on a configurable throttle (`OnChangeThrottleMs`, default 250 ms) because Excalidraw emits a change on every pointer move.
- **Theme Conformance** -- the wrapper chrome reads `pict-section-theme` CSS custom properties; a CSS bridge maps those tokens onto Excalidraw's own internal variables.
- **Export** -- `exportSvg()` returns an `SVGElement`, `exportBlob()` returns a PNG `Blob`, and `serialize()` returns an `.excalidraw`-compatible JSON string.
- **Mermaid Import** -- `convertMermaidToExcalidraw()` parses a mermaid source string into Excalidraw elements (React mode).
- **Lazy Loading** -- optionally fetch the vendor bundles on demand the first time a diagram mounts, instead of loading them eagerly on every page.
- **Pict Native** -- extends `pict-view`, uses `ContentAssignment`, registers its template / renderable / CSS through the standard configuration object.

## When to Use It

Reach for this view when your Pict application needs to:

- Embed a full drawing / diagramming canvas (whiteboards, architecture sketches, flowcharts, mind maps).
- Persist user-drawn diagrams to your own backend via custom load/save hooks.
- Render a stored `.excalidraw` scene in read-only mode.
- Isolate the canvas from an aggressive host stylesheet (use `iframe` mode).
- Generate diagrams programmatically (e.g. from a graph description) and paint them live -- see the bundled Notebook Studio example.

## Learn More

- [Quick Start](quickstart.md) -- Install, load the bundles, register the view, and render your first canvas.
- [Architecture](architecture.md) -- The two embed modes, the postMessage protocol, the theme bridge, and the vendoring strategy.
- [Configuration](configuration.md) -- Every key in `default_configuration`.
- [API Reference](api-reference.md) -- Every public method and the `OnLoad` / `OnSave` / `OnChange` callback surface.

## Related Modules

- [pict](https://fable-retold.github.io/pict/) -- The MVC framework this view plugs into (templates, renderables, AppData, ContentAssignment).
- [pict-view](https://fable-retold.github.io/pict-view/) -- The base class both implementations extend.
- [pict-section-theme](https://fable-retold.github.io/pict-section-theme/) -- Supplies the `--theme-color-*` tokens the wrapper chrome and the Excalidraw theme bridge read.
- [pict-renderer-graph](https://fable-retold.github.io/pict-renderer-graph/) -- Headless Excalidraw rendering (JSON graph to SVG); a server-side companion to this in-browser view.
- [retold-content-system](https://fable-retold.github.io/retold-content-system/) -- Content management that can persist `.excalidraw` scenes alongside other content.
