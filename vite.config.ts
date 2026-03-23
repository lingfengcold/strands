import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  base:
    mode === "production"
      ? (() => {
          const explicit = process.env.VITE_BASE ?? process.env.BASE_URL;
          if (explicit) return explicit;
          const [owner, repo] = process.env.GITHUB_REPOSITORY?.split("/") ?? [];
          if (repo) {
            if (repo.endsWith(".github.io") && owner && repo.startsWith(owner)) return "/";
            return `/${repo}/`;
          }
          return "/";
        })()
      : "/",
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
}));
