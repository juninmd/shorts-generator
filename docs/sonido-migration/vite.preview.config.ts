import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A prévia mora na raiz do repo (docs/), fora do root do app (web/). Este config existe só
// para servir a comparação lado a lado com o CSS/Tailwind reais do app.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const webRoot = path.join(repoRoot, "web");

export default defineConfig({
  root: repoRoot,
  plugins: [react()],
  css: { postcss: path.join(webRoot, "postcss.config.js") },
  server: { port: 5304, strictPort: true, fs: { allow: [repoRoot] } },
});
