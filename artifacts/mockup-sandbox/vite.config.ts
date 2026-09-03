import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin";

// PORT/BASE_PATH default to the values Replit's own artifact service uses
// (.replit-artifact/artifact.toml: PORT=8081, BASE_PATH=/__mockup) rather
// than throwing when unset. This app is a Replit-internal preview tool,
// never meant to be its own deployment target, but the monorepo root
// `build` script (`pnpm -r --if-present run build`) builds every
// workspace package — including this one — so any CI/Vercel project that
// invokes the root build without Replit's env vars set was hard-crashing
// here, unrelated to whatever it actually deploys. A real Replit run
// still gets its explicit values from artifact.toml and behaves exactly
// as before; only a generic build without those vars set now succeeds
// instead of throwing.
const rawPort = process.env.PORT ?? "8081";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/__mockup";

export default defineConfig({
  base: basePath,
  plugins: [
    mockupPreviewPlugin(),
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
