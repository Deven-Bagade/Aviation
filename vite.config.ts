import { defineConfig, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// onnxruntime-web dynamically import()s its .mjs glue files at runtime
// (e.g. /ort/ort-wasm-simd-threaded.mjs). Vite's dev server refuses to run
// such imports through its transform pipeline when they resolve into /public.
// This plugin serves anything under /ort/ as a raw static file, registered
// ahead of Vite's own middleware so it wins before that guard ever triggers.
function serveOrtRaw() {
  return {
    name: "serve-ort-raw",
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith("/ort/")) {
          const filePath = path.join(process.cwd(), "public", req.url.split("?")[0]);
          if (fs.existsSync(filePath)) {
            if (filePath.endsWith(".mjs")) {
              res.setHeader("Content-Type", "text/javascript");
            } else if (filePath.endsWith(".wasm")) {
              res.setHeader("Content-Type", "application/wasm");
            }
            fs.createReadStream(filePath).pipe(res);
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serveOrtRaw()],
});