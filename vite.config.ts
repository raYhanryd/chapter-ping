import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig, type Plugin } from "vite";
import { renderAssetHeaders } from "./src/shared/security-headers";

/**
 * Static assets are served before the Worker, so they never see its middleware.
 * Write the same header set into the build output instead of hand-maintaining a
 * second copy that can drift from the Worker's.
 */
function assetHeaders(): Plugin {
  const clientDir = fileURLToPath(new URL("./dist/client", import.meta.url));

  return {
    name: "chapter-ping:asset-headers",
    closeBundle() {
      // The client environment writes dist/client; a worker-only build has no
      // document assets to cover, and scripts/clean-build.mjs fails the build
      // if the file is missing after a full build.
      if (!existsSync(clientDir)) return;
      writeFileSync(join(clientDir, "_headers"), renderAssetHeaders());
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(), assetHeaders()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 8787,
    strictPort: true,
  },
});
