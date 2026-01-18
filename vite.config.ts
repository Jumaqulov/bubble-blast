// vite.config.ts
import { defineConfig } from "vite";

export default defineConfig({
    // IMPORTANT for Yandex Games (static hosting from zip root)
    // Ensures built asset paths are relative, not absolute.
    base: "./",

    server: {
        port: 5173,
        strictPort: true,
        open: true,
    },

    build: {
        outDir: "dist",
        assetsDir: "assets",
        sourcemap: false,
        target: "es2019",
        emptyOutDir: true,
    },
});
