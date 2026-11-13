/* SPDX-License-Identifier: Apache-2.0 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = resolve(root, process.argv[2] ?? "artifacts/browser/ix-trial.html");

const result = await build({
  entryPoints: [resolve(root, "scripts/browser/entry.mjs")],
  bundle: true,
  write: false,
  platform: "browser",
  format: "esm",
  target: "es2022",
  minify: false,
  legalComments: "none",
  logLevel: "warning",
  alias: { "node:util": resolve(root, "scripts/browser/node-util-shim.mjs") },
});

const output = result.outputFiles[0];
if (output === undefined || result.outputFiles.length !== 1) {
  throw new Error("expected exactly one bundle");
}
const code = output.text;
if (/<\/script/i.test(code)) {
  throw new Error("the bundle contains a closing script tag");
}

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>IX hand-driven trial</title>
<style>body{font-family:sans-serif;margin:2rem;max-width:60rem}code{word-break:break-all}li{margin:.5rem 0}</style>
</head>
<body>
<h1>IX hand-driven trial</h1>
<p>Made-up jobs only. Keys live in this page's memory and vanish when it closes.</p>
<ul id="keys"></ul>
<p id="relay"></p>
<script type="module">
${code}
</script>
</body>
</html>
`;

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, page);
console.log(outFile);
