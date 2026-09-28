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
const de = load(G + '/strings_de-DE.csv'), fr = load(G + '/strings_fr-FR.csv'), ru = load(G + '/strings_ru-RU.csv');
const rows = fs.readFileSync(P + '/corpus/strings_zh-CN.csv', 'utf8').replace(/^\uFEFF/, '').split('\n').filter(l => l.trim());
const V = [];
for (const L of rows) { const i = L.indexOf(','); if (i > 0) V.push([L.slice(0, i), L.slice(i + 1)]); }

const out = [];
out.push('===== A. 值形如纯数字串 >=5 位 (疑似"一长串0") =====');
let n = 0;
for (const [k, v] of V) {
  if (!/^\d{5,}$/.test(v)) continue;
  n++;
  out.push(`  key=${k}\n     zh=${v}   de=${de.get(k) || ''}   fr=${fr.get(k) || ''}   ru=${ru.get(k) || ''}`);
}
out.push(`  共 ${n} 条`);

out.push('');
out.push('===== B. key 里含 ¢ 的全部条目 =====');
let m = 0;
for (const [k, v] of V) {
  if (!k.includes('¢')) continue;
  m++;
  out.push(`  key=${k}\n     zh=${v}   de=${de.get(k) || ''}   fr=${fr.get(k) || ''}   ru=${ru.get(k) || ''}`);
}
out.push(`  共 ${m} 条`);

out.push('');
out.push('===== C. 值像"数字+M/万/百万"的条目 =====');
for (const [k, v] of V) {
  if (/^\d+(\.\d+)?[Mm]$/.test(v) || /^\d+万/.test(v)) out.push(`  key=${k}  zh=${v}  de=${de.get(k) || ''}  fr=${fr.get(k) || ''}`);
}

fs.writeFileSync(P + '/corpus/_qa_cost.txt', out.join('\n') + '\n', 'utf8');
console.log('lines', out.length);
