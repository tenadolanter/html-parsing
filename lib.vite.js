import { resolve } from "path";
export default () => {
  return {
    build: {
      lib: {
        entry: resolve(__dirname, 'src/index.js'),
        name: 'htmlParsing',
        fileName: 'index',
      },
      outDir: "lib",
      // 库模式下不单独拆分css了
      cssCodeSplit: false,
    },
    plugins: [],
    resolve: {
      alias: {
        "@src": resolve("./src"),
      },
    },
  };
};