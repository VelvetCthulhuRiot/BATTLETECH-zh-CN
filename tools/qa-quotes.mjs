import fs from 'node:fs';
import { GAME, SA, LOC } from './game-path.mjs';
import { fileURLToPath } from 'node:url';
// 仓库根目录: 从脚本自身位置推导 (脚本位于 <root>/tools/)。
// 这样克隆下来就能直接跑, 也避免把开发机的用户名写进公开仓库。
const P = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const G = LOC;

function load(f) {
  const m = new Map();
  for (const l of fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '').split('\n')) {
    const i = l.indexOf(','); if (i > 0) m.set(l.slice(0, i), l.slice(i + 1));
  }
  return m;
}
function runs(v) { return [...v.matchAll(/"{2,}/g)].map(m => m[0].length); }

const out = [];
for (const [name, f] of [['de-DE', G + '/strings_de-DE.csv'], ['fr-FR', G + '/strings_fr-FR.csv'], ['ru-RU', G + '/strings_ru-RU.csv'], ['ours', P + '/corpus/strings_zh-CN.csv']]) {
  const m = load(f);
  const hist = new Map();
  let max = 0;
  for (const [, v] of m) for (const r of runs(v)) { hist.set(r, (hist.get(r) || 0) + 1); max = Math.max(max, r); }
  out.push(`${name}: 引号连续段长度分布 ${[...hist.entries()].sort((a, b) => a[0] - b[0]).map(([k, n]) => `${k}连×${n}`).join('  ')} | 最长 ${max}`);
}

const de = load(G + '/strings_de-DE.csv');
const ours = load(P + '/corpus/strings_zh-CN.csv');
out.push('');
out.push('===== 逐行对比: 我们 4连引号 的行 vs 官方德语 =====');
let n = 0;
for (const [k, v] of ours) {
  if (!/""""/.test(v)) continue;
  const d = de.get(k) || '';
  n++;
  if (n > 6) continue;
  const us = v.match(/""""/) ;
  const p = us.index;
  out.push(`key=${k.slice(0, 45)}`);
  out.push(`   zh: …${JSON.stringify(v.slice(Math.max(0, p - 35), p + 45))}…`);
  out.push(`   de: …${JSON.stringify(d.slice(0, 120))}…`);
}
out.push(`含4连引号的行共 ${n}`);

out.push('');
out.push('===== 对照: 我们 2连引号 的行 (应属正确) =====');
let c = 0;
for (const [k, v] of ours) {
  if (/""""/.test(v)) continue;
  if (!/""/.test(v)) continue;
  if (++c > 3) break;
  out.push(`key=${k.slice(0, 45)}`);
  out.push(`   zh: ${JSON.stringify(v.slice(0, 110))}`);
  out.push(`   de: ${JSON.stringify((de.get(k) || '').slice(0, 110))}`);
}

fs.writeFileSync(P + '/corpus/_qa_quotes.txt', out.join('\n') + '\n', 'utf8');
console.log('done');
