import { defineConfig } from "vite";
import { resolve } from "path";
export default defineConfig(() => {
  return {
    build: {
      lib: {
        entry: resolve(__dirname, "src/index.js"),
        name: "htmlParsing",
        fileName: "index",
      },
      outDir: "lib",
      cssCodeSplit: false,
      sourcemap: true,
      minify: false,
    },
  };
});
