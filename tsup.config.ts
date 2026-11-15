import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", "apps/metapixel": "src/apps/metapixel.ts" },
  format: ["esm", "cjs"],
  dts: { entry: { index: "src/index.ts", "apps/metapixel": "src/apps/metapixel.ts" } },
  clean: true,
  sourcemap: false,
  target: "es2022",
  splitting: false,
  shims: false,
});
