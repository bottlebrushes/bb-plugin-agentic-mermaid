import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { installAgenticMermaid } from "./mermaid-renderer";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "agentic-mermaid-renderer",
    mount: ({ pluginId, signal }) => {
      // Setup fetches bb's chunks and imports Mermaid, so it stays outside the returned promise:
      // bb attributes every DOM move made while a mount is pending to this plugin and blocks it,
      // which kept bb's own plugin overlay container out of the page.
      let dispose: (() => void) | undefined;
      installAgenticMermaid(pluginId, signal).then(
        (installed) => {
          if (signal.aborted) installed?.();
          else dispose = installed;
        },
        (error: unknown) => {
          if (!signal.aborted) console.warn("[agentic-mermaid] setup failed; leaving the stock renderer in place", error);
        },
      );
      return () => dispose?.();
    },
  });
});
