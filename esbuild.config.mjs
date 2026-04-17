import { build } from "esbuild";

await build({
  entryPoints: ["src/handler.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  outdir: "dist",
  format: "cjs",
  sourcemap: true,
  minify: false,
  jsx: "automatic",
  jsxImportSource: "react",
});

console.log("Build completata -> dist/handler.js");
