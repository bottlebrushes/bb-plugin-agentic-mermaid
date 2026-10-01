import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { RENDERER_ROUTE } from "./renderer-route";

/** Serves agentic-mermaid's code-split browser build to the frontend (see renderer-route.ts). */
export default function plugin(bb: BbPluginApi) {
  const packageJson = createRequire(import.meta.url).resolve("agentic-mermaid/package.json");
  const root = join(dirname(packageJson), "dist", "browser-lazy");

  // Routes are exact-match, so mount one per file. The set is fixed for an installed version.
  const files = readdirSync(root, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".js"));
  for (const file of files) {
    const absolute = join(root, file);
    const urlPath = `${RENDERER_ROUTE}/${relative(root, absolute).split(sep).join("/")}`;
    bb.http.route("GET", urlPath, async () => {
      return new Response(await readFile(absolute), {
        headers: {
          "content-type": "text/javascript; charset=utf-8",
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
    });
  }
  bb.log.info(`serving agentic-mermaid browser build: ${files.length} files at ${RENDERER_ROUTE}`);
}
