import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { installAgenticMermaid } from "./mermaid-renderer";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "agentic-mermaid-renderer",
    mount: ({ pluginId, signal }) => installAgenticMermaid(pluginId, signal),
  });
});
