import { build } from "esbuild";
import { createWriteStream } from "fs";
import { readFile } from "fs/promises";
import archiver from "archiver";

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

await new Promise((resolve, reject) => {
  const output = createWriteStream("dist/handler.zip");
  const archive = archiver("zip", { zlib: { level: 6 } });
  output.on("close", resolve);
  archive.on("error", reject);
  archive.pipe(output);
  archive.file("dist/handler.js", { name: "handler.js" });
  archive.file("dist/handler.js.map", { name: "handler.js.map" });
  archive.finalize();
});

console.log("Build completata -> dist/handler.js + dist/handler.zip");
