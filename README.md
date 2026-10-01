# Agentic Mermaid for bb

Replaces bb's chat Mermaid renderer with [agentic-mermaid](https://github.com/adewale/agentic-mermaid), a maintained fork of beautiful-mermaid. Every ```` ```mermaid ```` block in chat and in Markdown file previews renders through it. bb's own block chrome keeps working: the source toggle, copy, and the pan/zoom dialog.

| Diagram | Renderer |
|---|---|
| flowchart, state, sequence, class, ER, gantt, pie, mindmap, timeline, journey, quadrant, xychart, architecture, radar | agentic-mermaid |
| gitGraph | bb's stock Mermaid (it draws git graphs better) |
| anything agentic-mermaid can't render (sankey, block, kanban, …) or fails to parse | bb's stock Mermaid |

Colors come from bb's design tokens (`--foreground`, `--muted-foreground`, `--primary`, `--surface-recessed-solid`), so diagrams follow the active theme and switch between light and dark without re-rendering.

## Install

```sh
cd bb-plugin-agentic-mermaid
npm install
bb plugin install . --yes
```

Reload open bb windows afterwards. To turn it off, run `bb plugin disable agentic-mermaid`; diagrams go back to bb's renderer on the next page load.

## How it works

bb has no plugin slot for Markdown code blocks, so the plugin works through bb internals:

- **Renderer swap** (`mermaid-renderer.ts`): bb lazily imports one hashed Mermaid module (`/assets/mermaid.core-<hash>.js`) and calls its `render(id, source)` for each diagram. The content script finds that URL in bb's bundle, imports the same module (ES modules are singletons per URL), and replaces `render`. Unwanted or failed renders call the original.
- **Pre-load diagrams** (`stock-diagrams.ts`): on a page load bb draws visible diagrams before plugin bundles arrive, and caches them per page. A `MutationObserver` finds those stock SVGs, reads the block's Mermaid source from its React state, and swaps in the agentic-mermaid SVG through the block's own state setter.
- **Lazy renderer** (`server.ts`, `renderer-route.ts`): bb's plugin bundler inlines dynamic imports, which would add about 2.5 MB to every bb page load. Instead the backend serves agentic-mermaid's code-split browser build from `/api/v1/plugins/agentic-mermaid/http/agentic-mermaid/<version>/`, and the browser downloads only the diagram families a conversation uses.
- **Isolation**: agentic-mermaid's SVG `<style>` rules are unscoped and would restyle every SVG in bb, so each rule is prefixed with the diagram's id. Marker and def ids are namespaced per diagram. Rendering runs in agentic-mermaid's `strict` security mode (no external fetches; labels are escaped).

Because it depends on bb internals, a bb update can break it. If the Mermaid module can't be found, or the React state doesn't have the expected shape, the plugin does nothing and bb's stock renderer stays in place. `gallery.md` contains one diagram of every type; open it in bb's file preview to check rendering after an upgrade.

## Known gaps

- Pie charts use agentic-mermaid's fixed blue palette instead of the theme accent.
- `crit` gantt tasks draw in the foreground color rather than a warning color.
- In dark themes, bb's stock git graph draws black branch lines.

## Development

```sh
npm run typecheck
bb plugin build && bb plugin reload agentic-mermaid
```
