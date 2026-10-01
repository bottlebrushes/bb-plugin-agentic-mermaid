// Upgrades diagrams that bb drew with its stock renderer before this plugin loaded.
//
// On a page load bb renders visible chat diagrams roughly a second before plugin
// bundles arrive, and it caches every SVG by source + theme for the page's
// lifetime, so a remounted block can come back from that cache as stock too.
// Neither path calls the patched `render`. bb exposes no API for re-rendering a
// block, so this reads the block's React state (its Mermaid source and rendered
// diagram) and swaps the diagram through the block's own state setter; bb's
// preview, source toggle, and pan/zoom dialog then all show the new SVG. Any
// shape mismatch leaves the stock diagram in place.
import type { AgenticRender } from "./mermaid-renderer";

const DIAGRAM_HOST = '[role="img"][aria-label="Mermaid diagram"]';
/** How far above the SVG host bb's Mermaid block component sits (observed: 4). */
const MAX_FIBER_DEPTH = 12;

type StateUpdate = (previous: unknown) => unknown;
type DiagramBlock = { source: string; diagram: object; setState: (update: StateUpdate) => void };

// The slice of React's internal fiber and hook records this module reads.
type Hook = { memoizedState: unknown; queue: { dispatch?: unknown } | null; next: Hook | null };
type Fiber = { return: Fiber | null; memoizedProps: unknown; memoizedState: unknown };

/** The Mermaid block component owning `host`: props `{ source, preferredTheme }`, state `{ kind: "rendered", diagram }`. */
function findDiagramBlock(host: Element): DiagramBlock | null {
  const fiberKey = Object.keys(host).find((key) => key.startsWith("__reactFiber$"));
  if (fiberKey === undefined) return null;
  // React attaches the host's fiber under this key; its shape is React's invariant, not untrusted data.
  let fiber = Reflect.get(host, fiberKey) as Fiber | null;
  for (let depth = 0; depth < MAX_FIBER_DEPTH && fiber !== null; depth++, fiber = fiber.return) {
    const props = fiber.memoizedProps;
    if (typeof props !== "object" || props === null || !("preferredTheme" in props) || !("source" in props)) continue;
    const source = props.source;
    if (typeof source !== "string") return null;
    // A function component's memoizedState is its hook list.
    for (let hook = fiber.memoizedState as Hook | null; hook !== null; hook = hook.next) {
      const state = hook.memoizedState;
      const dispatch = hook.queue?.dispatch;
      if (
        typeof state === "object" &&
        state !== null &&
        "kind" in state &&
        state.kind === "rendered" &&
        "diagram" in state &&
        typeof state.diagram === "object" &&
        state.diagram !== null &&
        typeof dispatch === "function"
      ) {
        return { source, diagram: state.diagram, setState: (update) => dispatch(update) };
      }
    }
    return null;
  }
  return null;
}

/** Watch for stock-rendered diagrams and replace them; returns the disposer. */
export function upgradeStockDiagrams(render: AgenticRender): () => void {
  // Stock SVG elements already tried, so git graphs and unsupported diagrams are rendered once, not on every mutation.
  const attempted = new WeakSet<Element>();
  let scanQueued = false;
  let stopped = false;

  const upgrade = async (block: DiagramBlock, stockId: string) => {
    const svg = await render(`${stockId}-agentic`, block.source);
    if (svg === null || stopped) return;
    // Only replace the exact stock diagram that was read: if bb re-rendered meanwhile (new source while streaming), keep its result.
    block.setState((previous) =>
      typeof previous === "object" && previous !== null && "diagram" in previous && previous.diagram === block.diagram
        ? { kind: "rendered", diagram: { svg, bindFunctions: undefined } }
        : previous,
    );
  };

  const scan = () => {
    scanQueued = false;
    for (const host of document.querySelectorAll(DIAGRAM_HOST)) {
      const svg = host.firstElementChild;
      if (svg === null || svg.hasAttribute("data-agentic-mermaid") || attempted.has(svg)) continue;
      attempted.add(svg);
      const block = findDiagramBlock(host);
      if (block !== null) void upgrade(block, svg.id || "bb-mermaid");
    }
  };

  const observer = new MutationObserver(() => {
    if (scanQueued) return;
    scanQueued = true;
    queueMicrotask(scan);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  scan();

  return () => {
    stopped = true;
    observer.disconnect();
  };
}
