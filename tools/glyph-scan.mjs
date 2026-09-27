// 用字体图集的真实覆盖表, 离线扫描全部译文里会变方框的字符
import fs from 'node:fs';
import path from 'node:path';

const PROJ = 'C:\\Users\\lxp_0\\Documents\\BTHanHua';
const GLYPHS = path.join(process.env.USERPROFILE, 'Documents', 'My Games', 'BattleTech', 'mods', 'BTHanHuaFont', 'BTHanHuaFont.glyphs.txt');
const CSV = path.join(PROJ, 'corpus', 'strings_zh-CN.csv');

const glyphText = fs.readFileSync(GLYPHS, 'utf8').replace(/^\uFEFF/, '');
const covered = new Set(glyphText);
console.log(`图集覆盖码位: ${covered.size}`);

const lines = fs.readFileSync(CSV, 'utf8').replace(/^\uFEFF/, '').split('\n');
let affected = 0, total = 0;
const missFreq = new Map();      // 缺失字符 -> 出现次数
const affectedKeys = [];
for (let i = 1; i < lines.length; i++) {
  const L = lines[i];
  if (!L) continue;
  const j = L.indexOf(',');
  if (j <= 0) continue;
  total++;
  const k = L.slice(0, j), v = L.slice(j + 1);
  const missing = new Set();
  for (const ch of v) {
    const c = ch.codePointAt(0);
    if (c < 0x80) continue;                  // ASCII 一定有
    if (covered.has(ch)) continue;
    missing.add(ch);
  }
  if (missing.size) {
    affected++;
    for (const ch of missing) missFreq.set(ch, (missFreq.get(ch) || 0) + 1);
    if (affectedKeys.length < 400) affectedKeys.push([k, v, [...missing].join('')]);
  }
}
console.log(`\n译文条目: ${total}`);
console.log(`含"图集外字符"(会显示方框)的条目: ${affected}  (${(affected / total * 100).toFixed(2)}%)`);
console.log(`缺失字符种类: ${missFreq.size}`);

const sorted = [...missFreq].sort((a, b) => b[1] - a[1]);
console.log(`\n=== 缺失字符 (按出现条目数排序, 前 120) ===`);
console.log(sorted.slice(0, 120).map(([c, n]) => `${c}:${n}`).join(' '));

console.log(`\n=== 受影响条目样例 30 条 ===`);
for (const [k, v, m] of affectedKeys.slice(0, 30)) {
  console.log(`  [缺:${m}] ${k.slice(0, 44)}`);
  console.log(`        ${v.slice(0, 80)}`);
}

// 输出待修清单
fs.writeFileSync(path.join(PROJ, 'corpus', 'glyphfix.jsonl'),
  affectedKeys.map(([k, v, m]) => JSON.stringify({ key: k, zh: v, missing: m })).join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(PROJ, 'corpus', 'glyph-missing-chars.tsv'),
  sorted.map(([c, n]) => `${c}\t${n}`).join('\n') + '\n', 'utf8');
console.log(`\n已写出 corpus/glyphfix.jsonl (前 ${affectedKeys.length} 条) 与 corpus/glyph-missing-chars.tsv`);
