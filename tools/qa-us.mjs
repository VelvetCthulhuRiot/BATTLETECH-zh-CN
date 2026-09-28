import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
// 仓库根目录: 从脚本自身位置推导 (脚本位于 <root>/tools/)。
// 这样克隆下来就能直接跑, 也避免把开发机的用户名写进公开仓库。
const P = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const G = 'D:/MyDownload/Things/Steam/steamapps/common/BATTLETECH/BattleTech_Data/StreamingAssets/data/localization';
function load(f) {
  const m = new Map();
  for (const l of fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '').split('\n')) {
    const i = l.indexOf(','); if (i > 0) m.set(l.slice(0, i), l.slice(i + 1));
  }
  return m;
}
const de = load(G + '/strings_de-DE.csv'), fr = load(G + '/strings_fr-FR.csv'), ru = load(G + '/strings_ru-RU.csv');
const ours = load(P + '/corpus/strings_zh-CN.csv');
const US = '\u001f';
const FW = '\uFF0C';
const out = [];

// 官方 U+001F 的用法统计
for (const [n, m] of [['de', de], ['fr', fr], ['ru', ru], ['ours', ours]]) {
  let inside = 0, outside = 0, rowsOut = 0;
  for (const [, v] of m) {
    const spans = [...v.matchAll(/\[\[[\s\S]*?\]\]/g)].map(s => s[0]);
    const mask = v.replace(/\[\[[\s\S]*?\]\]/g, m2 => m2.replace(new RegExp(US, 'g'), ''));
    const o = (mask.match(new RegExp(US, 'g')) || []).length;
    outside += o; if (o) rowsOut++;
    for (const s of spans) inside += (s.match(new RegExp(US, 'g')) || []).length;
  }
  out.push(`${n}: U+001F 在 [[...]] 内 ${inside} 个 | 在标记外 ${outside} 个 (${rowsOut} 行)`);
}

out.push('');
out.push('===== 官方用了 U+001F(逗号替身) 而我们用全角逗号 的条目 =====');
let n = 0;
for (const [k, dv] of de) {
  const dUS = (dv.match(new RegExp(US, 'g')) || []).length;
  if (!dUS) continue;
  const ov = ours.get(k);
  if (ov === undefined) continue;
  // 官方标记内的 U+001F 不算 (那是链接分隔符)
  const dOut = (dv.replace(/\[\[[\s\S]*?\]\]/g, m => m.replace(new RegExp(US, 'g'), '')).match(new RegExp(US, 'g')) || []).length;
  if (!dOut) continue;
  const oUS = (ov.match(new RegExp(US, 'g')) || []).length;
  if (oUS > 0) continue;             // 我们也用了 U+001F -> 没问题
  n++;
  out.push(`  key=${k}`);
  out.push(`     zh=${JSON.stringify(ov)}`);
  out.push(`     de=${JSON.stringify(dv).replace(/\\u001f/g, '<US>')}`);
  out.push(`     fr=${JSON.stringify(fr.get(k) || '').replace(/\\u001f/g, '<US>')}`);
}
out.push(`  共 ${n} 条`);

out.push('');
out.push('===== 我们的值里含全角逗号且看起来像数字串的条目 =====');
let m2 = 0;
for (const [k, v] of ours) {
  if (!v.includes(FW)) continue;
  if (!/\d\uFF0C\d/.test(v)) continue;
  m2++;
  if (m2 <= 40) out.push(`  key=${k}  zh=${JSON.stringify(v)}  de=${JSON.stringify(de.get(k) || '').replace(/\\u001f/g, '<US>')}`);
}
out.push(`  共 ${m2} 条 (含 数字，数字 的)`);

fs.writeFileSync(P + '/corpus/_qa_us.txt', out.join('\n') + '\n', 'utf8');
console.log('lines', out.length);
