import { defineConfig } from "vite";
import pathUtils from "path";
import dts from "vite-plugin-dts";

export default defineConfig({
    build: {
        lib: {
            entry: pathUtils.resolve(__dirname, 'src/index.ts'),
            name: "AnonTokyo",
            fileName: "index",
        }
    },
    plugins: [dts({ rollupTypes: true })],
});
