// Replaces bb's Mermaid renderer with agentic-mermaid.
//
// bb has no plugin slot for fenced ```mermaid blocks. Its chat Markdown lazily
// imports one hashed Mermaid ESM module (`/assets/mermaid.core-<hash>.js`) and
// calls `default.render(id, source)` for every diagram, injecting the returned
// SVG string. ES modules are singletons per URL, so importing that same URL here
// yields the object bb uses; swapping its `render` replaces rendering everywhere
// while bb keeps its own chrome (source toggle, pan/zoom dialog, render cache).
//
// Families agentic-mermaid draws worse than stock (gitGraph), families it does
// not support, and any render error fall through to bb's original `render`.
// Diagrams bb drew before this plugin loaded are upgraded by stock-diagrams.ts.
import type { renderMermaidSVGAsync } from "agentic-mermaid/browser/lazy";
import { RENDERER_ROUTE } from "./renderer-route";
import { upgradeStockDiagrams } from "./stock-diagrams";

/** Families that stay on bb's stock renderer even though agentic-mermaid parses them. */
const STOCK_FAMILIES: Record<string, true> = { gitgraph: true };

const MERMAID_CORE = /mermaid\.core-[\w-]+\.js/;
const MARKDOWN_PREVIEW = /markdown-preview-[\w-]+\.js/;
/** Ids bb passes to `render` (`bb-mermaid-<useId>-<n>`); anything else is not a safe CSS selector. */
const SAFE_ID = /^[A-Za-z][\w-]*$/;

// Every color reads bb's design tokens, so theme and light/dark switches recolor
// rendered diagrams without a re-render. All optional roles are pinned: the SVG
// stylesheet reads var(--muted)/var(--border)/var(--surface)/var(--line) as
// overrides, and bb's own tokens of those names would otherwise cascade in.
// Values land in a style="" attribute, so they must not contain double quotes.
const SURFACE = "var(--surface-recessed-solid, var(--background))";
const RENDER_OPTIONS = {
  bg: SURFACE,
  fg: "var(--foreground)",
  accent: "var(--primary)",
  line: `color-mix(in srgb, var(--foreground) 45%, ${SURFACE})`,
  muted: "var(--muted-foreground)",
  surface: `color-mix(in srgb, var(--foreground) 6%, ${SURFACE})`,
  border: `color-mix(in srgb, var(--foreground) 28%, ${SURFACE})`,
  font: "'Inter Variable', Inter",
  transparent: true,
  security: "strict",
} as const;

type MermaidRenderResult = { svg: string; diagramType?: string; bindFunctions?: (element: Element) => void };
type MermaidRender = (id: string, text: string, container?: Element) => Promise<MermaidRenderResult>;
type MermaidApi = { render: MermaidRender };
type RendererModule = { renderMermaidSVGAsync: typeof renderMermaidSVGAsync };

const FRONT_MATTER = /^\s*---\r?\n[\s\S]*?\r?\n---\s*(\r?\n|$)/;
const FLOWCHART_HEADER = /^(\s*(?:flowchart(?:-elk)?|graph)\s+)(LR|RL)\b/i;
const GITGRAPH_HEADER = /^(\s*gitGraph)(?:\s+LR)?\s*:?(\r?)$/i;
/** `direction` statements: flowchart subgraphs, state, class, and ER diagrams. */
const DIRECTION_STATEMENT = /^(\s*direction\s+)(LR|RL)\b/i;
const PLUGIN_MARK = "data-agentic-mermaid";

/** First diagram keyword after front matter, `%%` comments/directives, and blank lines, lowercased. */
function diagramKeyword(source: string): string {
  const lines = source.replace(FRONT_MATTER, "").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("%%")) continue;
    return (trimmed.match(/^[\w-]+/)?.[0] ?? "").toLowerCase();
  }
  return "";
}

/** Replacer for the direction regexes: LR becomes TB, RL becomes BT. */
const VERTICAL_DIRECTION = (_match: string, head: string, direction: string) =>
  head + (direction.toUpperCase() === "RL" ? "BT" : "TB");

/**
 * Lay every diagram out top-to-bottom: bb's chat column is narrow and scrolls
 * vertically, so a left-right diagram is shrunk to fit its width until unreadable.
 * Rewrites the flowchart/graph header, `direction` statements, and the gitGraph
 * orientation. Other families have no direction to change.
 */
function verticalize(source: string): string {
  const frontMatter = source.match(FRONT_MATTER)?.[0] ?? "";
  let headerSeen = false;
  const lines = source
    .slice(frontMatter.length)
    .split("\n")
    .map((line) => {
      if (headerSeen) return line.replace(DIRECTION_STATEMENT, VERTICAL_DIRECTION);
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("%%")) return line;
      headerSeen = true;
      return line.replace(FLOWCHART_HEADER, VERTICAL_DIRECTION).replace(GITGRAPH_HEADER, "$1 TB:$2");
    });
  return frontMatter + lines.join("\n");
}

/** Tag a stock SVG as drawn through this plugin, so stock-diagrams.ts leaves it alone. */
function markSvg(svg: string): string | null {
  return /^<svg\b/.test(svg) ? svg.replace(/^<svg\b/, `<svg ${PLUGIN_MARK}=""`) : null;
}

/**
 * Resolve the URL of the Mermaid module bb imports. Its hash changes every bb
 * release, so read it from the chunk that imports it: the markdown-preview chunk,
 * which the app entry references.
 */
async function findMermaidCoreUrl(signal: AbortSignal): Promise<URL | null> {
  const loaded = performance.getEntriesByType("resource").map((entry) => entry.name);
  const core = loaded.find((name) => MERMAID_CORE.test(new URL(name).pathname));
  if (core) return new URL(core);

  let previewUrl: URL | null = null;
  const loadedPreview = loaded.find((name) => MARKDOWN_PREVIEW.test(new URL(name).pathname));
  if (loadedPreview) {
    previewUrl = new URL(loadedPreview);
  } else {
    for (const script of document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')) {
      const entryUrl = new URL(script.src, document.baseURI);
      const entry = await (await fetch(entryUrl, { signal })).text();
      const name = entry.match(MARKDOWN_PREVIEW)?.[0];
      if (name) {
        previewUrl = new URL(name, entryUrl);
        break;
      }
    }
  }
  if (!previewUrl) return null;

  const preview = await (await fetch(previewUrl, { signal })).text();
  const name = preview.match(MERMAID_CORE)?.[0];
  return name ? new URL(name, previewUrl) : null;
}

/**
 * Prefix every selector with the diagram's root. A rule for `svg` itself (where
 * agentic-mermaid declares its derived color variables) becomes the root;
 * everything else becomes a descendant of it. `@scope` cannot express the
 * former without rewriting selectors anyway: its rules match descendants only.
 */
function scopeRules(rules: CSSRuleList, root: string): void {
  for (const rule of rules) {
    if (rule instanceof CSSStyleRule) {
      const selector = rule.selectorText;
      rule.selectorText = selector.includes("(")
        ? `${root} :is(${selector})`
        : selector
            .split(",")
            .map((part) => part.trim())
            .map((part) => (/^svg\b/.test(part) ? `${root}${part.slice(3)}` : `${root} ${part}`))
            .join(", ");
    }
    if (rule instanceof CSSGroupingRule) scopeRules(rule.cssRules, root);
  }
}

/**
 * agentic-mermaid emits unscoped rules (`text`, `svg`, `.gantt-bar`, ...), and an
 * inline SVG's <style> applies to the whole document, so confine every rule to
 * this diagram. Def ids are already namespaced through `idPrefix`.
 */
function scopeSvg(svg: string, id: string): string {
  return svg
    .replace(/^<svg\b/, `<svg id="${id}" ${PLUGIN_MARK}=""`)
    .replace(/<style>([\s\S]*?)<\/style>/g, (_match, css: string) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      scopeRules(sheet.cssRules, `#${id}`);
      return `<style>${Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n")}</style>`;
    });
}

function isMermaidModule(value: unknown): value is { default: MermaidApi } {
  if (typeof value !== "object" || value === null || !("default" in value)) return false;
  const api = value.default;
  return typeof api === "object" && api !== null && "render" in api && typeof api.render === "function";
}

function isRendererModule(value: unknown): value is RendererModule {
  return (
    typeof value === "object" &&
    value !== null &&
    "renderMermaidSVGAsync" in value &&
    typeof value.renderMermaidSVGAsync === "function"
  );
}

/** Plugin-side renderer: agentic-mermaid's scoped SVG, or `null` when bb's stock renderer should draw it. */
export type AgenticRender = (id: string, text: string) => Promise<string | null>;

function createAgenticRender(rendererUrl: string): AgenticRender {
  return async (id, text) => {
    const family = diagramKeyword(text);
    if (STOCK_FAMILIES[family] || !SAFE_ID.test(id)) return null;
    try {
      // Runtime-selected specifier: served by this plugin's backend (see renderer-route.ts).
      const rendererModule: unknown = await import(/* @vite-ignore */ rendererUrl);
      if (!isRendererModule(rendererModule)) throw new Error(`unexpected module at ${rendererUrl}`);
      const svg = await rendererModule.renderMermaidSVGAsync(text, { ...RENDER_OPTIONS, idPrefix: `${id}-` });
      return scopeSvg(svg, id);
    } catch (error) {
      // Unsupported family (sankey, block, kanban, ...) or a parse error: bb's
      // renderer either draws it or shows its own error state.
      console.debug(`[agentic-mermaid] using bb's renderer (${family || "unknown"}): ${String(error)}`);
      return null;
    }
  };
}

export async function installAgenticMermaid(pluginId: string, signal: AbortSignal): Promise<(() => void) | undefined> {
  const coreUrl = await findMermaidCoreUrl(signal);
  if (!coreUrl) {
    console.warn("[agentic-mermaid] could not locate bb's Mermaid module; leaving the stock renderer in place");
    return undefined;
  }
  // Runtime-selected specifier: the hashed URL differs per bb release.
  const coreModule: unknown = await import(/* @vite-ignore */ coreUrl.href);
  if (signal.aborted || !isMermaidModule(coreModule)) return undefined;
  const mermaid = coreModule.default;
  const renderAgentic = createAgenticRender(
    new URL(`/api/v1/plugins/${pluginId}/http${RENDERER_ROUTE}/index.js`, location.origin).href,
  );

  const original = mermaid.render;
  const patched: MermaidRender = async function (this: unknown, id, text, container) {
    const vertical = verticalize(text);
    const svg = await renderAgentic(id, vertical);
    if (svg !== null) return { svg, diagramType: diagramKeyword(vertical) };
    const result = await original.call(this, id, vertical, container);
    return { ...result, svg: markSvg(result.svg) ?? result.svg };
  };
  mermaid.render = patched;
  const stopUpgrading = upgradeStockDiagrams(async (id, text) => {
    const vertical = verticalize(text);
    const svg = await renderAgentic(id, vertical);
    if (svg !== null || vertical === text) return svg;
    // A stock-only family (gitGraph) bb drew left-right before this plugin loaded: redraw it vertically.
    // Unmarked output would be picked up again by the stock-diagram observer, so it is dropped.
    try {
      return markSvg((await original.call(mermaid, id, vertical)).svg);
    } catch {
      return null;
    }
  });

  return () => {
    stopUpgrading();
    if (mermaid.render === patched) mermaid.render = original;
  };
}
