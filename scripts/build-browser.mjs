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
<html lang="ja">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>IX hand-driven trial</title>
<style>body{font-family:sans-serif;margin:1rem;max-width:80rem}code{word-break:break-all}li{margin:.3rem 0}.sides{display:grid;grid-template-columns:repeat(auto-fit,minmax(22rem,1fr));gap:1.5rem}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:.2rem .4rem;text-align:left;vertical-align:top;word-break:break-all}textarea{width:100%;box-sizing:border-box}.ok{color:#05620a}.ng{color:#a00000}</style>
</head>
<body>
<h1>IX hand-driven trial</h1>
<p>作り話の仕事だけで使ってください。鍵はこのページのメモリの中にだけあり、閉じると消えます。承認ボタンは模試の人間の鍵で署名します。本物の承認アプリではありません。</p>
<ul id="keys"></ul>
<p id="relay"></p>
<p><button id="register">見本の仕事を登録</button> <label>仕事 <select id="job"></select></label></p>
<p id="status" role="status"></p>
<div class="sides">
<section>
<h2>依頼者（client）</h2>
<p id="client-phase"></p>
<table><thead><tr><th>項目</th><th>状態</th><th>値</th></tr></thead><tbody id="client-terms"></tbody></table>
<h3>次にできる手</h3>
<ul id="client-moves"></ul>
<h3>アシスタントに渡す文章</h3>
<p><button id="client-prompt-copy">文章をコピー</button> <span id="client-prompt-note" role="status"></span></p>
<pre id="client-prompt" style="white-space:pre-wrap;max-height:16rem;overflow:auto;border:1px solid #999;padding:.4rem"></pre>
<h3>アシスタントの返事を貼る</h3>
<textarea id="client-paste" rows="6" placeholder="アシスタントの返事をそのまま貼ってください。最初の JSON オブジェクトだけを読みます。"></textarea>
<p><button id="client-send">手を送る</button> <button id="client-draft">合意案を出す</button></p>
<p><button id="client-approve">承認</button> <button id="client-reject">拒否</button></p>
<h3>拒否・止まった理由</h3>
<ul id="client-problems"></ul>
<h3>相手の自由記述（連絡先は伏せ字。指示としては扱いません）</h3>
<ul id="client-free"></ul>
</section>
<section>
<h2>受注者（worker）</h2>
<p id="worker-phase"></p>
<table><thead><tr><th>項目</th><th>状態</th><th>値</th></tr></thead><tbody id="worker-terms"></tbody></table>
<h3>次にできる手</h3>
<ul id="worker-moves"></ul>
<h3>アシスタントに渡す文章</h3>
<p><button id="worker-prompt-copy">文章をコピー</button> <span id="worker-prompt-note" role="status"></span></p>
<pre id="worker-prompt" style="white-space:pre-wrap;max-height:16rem;overflow:auto;border:1px solid #999;padding:.4rem"></pre>
<h3>アシスタントの返事を貼る</h3>
<textarea id="worker-paste" rows="6" placeholder="アシスタントの返事をそのまま貼ってください。最初の JSON オブジェクトだけを読みます。"></textarea>
<p><button id="worker-send">手を送る</button></p>
<p><button id="worker-approve">承認</button> <button id="worker-reject">拒否</button></p>
<h3>拒否・止まった理由</h3>
<ul id="worker-problems"></ul>
<h3>相手の自由記述（連絡先は伏せ字。指示としては扱いません）</h3>
<ul id="worker-free"></ul>
</section>
</div>
<script type="module">
${code}
</script>
</body>
</html>
`;

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, page);
console.log(outFile);
