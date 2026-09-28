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
const rows = fs.readFileSync(P + '/corpus/strings_zh-CN.csv', 'utf8').replace(/^\uFEFF/, '').split('\n').filter(l => l.trim());
const V = [];
for (const L of rows) { const i = L.indexOf(','); if (i > 0) V.push([L.slice(0, i), L.slice(i + 1)]); }
const out = [];

out.push('===== A. 部位名: 值里含 躯/臂/腿/头 的条目 (看命名规律) =====');
for (const [k, v] of V) {
  if (!/^(头部?|左|右|中|中央|.*躯.*|.*臂.*|.*腿.*)$/.test(v)) continue;
  if (v.length > 6) continue;
  if (!/[\u4e00-\u9fff]/.test(v)) continue;
  out.push(`  key=${k}   zh=${v}   de=${de.get(k) || '(无)'}   fr=${fr.get(k) || '(无)'}   ru=${ru.get(k) || '(无)'}`);
}

out.push('');
out.push('===== B. key 形如 h/ct/lt/rt/la/ra/ll/rl/head/torso 的条目 =====');
for (const [k, v] of V) {
  if (/^(h|ct|lt|rt|la|ra|ll|rl|hd|head|centertorso|lefttorso|righttorso|leftarm|rightarm|leftleg|rightleg|torso|location.*)$/i.test(k))
    out.push(`  key=${k}   zh=${v}   de=${de.get(k) || ''}   fr=${fr.get(k) || ''}   ru=${ru.get(k) || ''}`);
}

out.push('');
out.push('===== C. 带分组分隔符的全角逗号格式串 (，在数字模式里) =====');
for (const [k, v] of V) if (/，，|，##|##，|0，0|\{0:[^}]*，/.test(v)) out.push(`  key=${k}\n     zh=${v}\n     de=${de.get(k) || ''}\n     fr=${fr.get(k) || ''}`);

out.push('');
out.push('===== D. key 含 m/million 且值形如数字模式的 =====');
for (const [k, v] of V) if (/^[\d#*，.]+[Mm]?$/.test(v) && /[\d#]/.test(v) && v.length <= 12) out.push(`  key=${k}  zh=${v}  de=${de.get(k) || ''}  fr=${fr.get(k) || ''}`);

out.push('');
out.push('===== E. key 含 cbill/money/fund/cost/currency 的条目 =====');
for (const [k, v] of V) if (/cbill|money|fund|cost|currency|price|x_value|res_value/i.test(k) && v.length <= 30) out.push(`  key=${k}  zh=${v}  de=${de.get(k) || ''}`);

fs.writeFileSync(P + '/corpus/_qa_labels.txt', out.join('\n') + '\n', 'utf8');
console.log('lines', out.length);
