// 从 corpus/pilot-names.tsv 生成飞行员呼号/姓名 key, 写进 tools/merge-final.mjs 的 PILOT-KEYS 区块。
// 用法: node tools/gen-pilot-keys.mjs [--write]
//
// 与机甲那套同机制: 游戏按"英文字符串规范化"查 CSV, 查不到就显示英文。
// 自动跳过与机甲表冲突的 key (同一个 key 只能有一个译名, 机甲名可见度高得多, 让机甲赢)。
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
// 仓库根目录: 从脚本自身位置推导 (脚本位于 <root>/tools/)。
// 这样克隆下来就能直接跑, 也避免把开发机的用户名写进公开仓库。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// JS 字符串字面量转义: 译文里可能出现单引号或反斜杠 (实测有 "娜塔莎\" 这种),
// 直接拼进 '...' 会生成语法错误的 merge-final.mjs —— 已经因此坏过一次。
const lit = (x) => String(x).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const TSV = path.join(root, 'corpus', 'pilot-names.tsv');
const mf = path.join(root, 'tools', 'merge-final.mjs');
// 原子写入: 先写临时文件再改名。
// 为什么必须: fs.writeFileSync 是"先清空原文件再写", 若进程在写之前/之中被杀
// (例如 PowerShell 用 Select-Object -First N 提前掐断管道 -> node 收到 EPIPE 退出),
// 目标文件会被留下 0 字节 —— 实测把 merge-final.mjs 清空过两次。
function writeAtomic(target, text) {
  const tmp = target + '.writing';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, target);
}
const src = fs.readFileSync(mf, 'utf8');

// 机甲 key 表 (用于冲突检测)
const mb = src.slice(src.indexOf('MECH-KEYS BEGIN'), src.indexOf('MECH-KEYS END'));
const mechKeys = new Set([...mb.matchAll(/\['([^']+)', '([^']+)'\]/g)].map((m) => m[1]));

const rows = [];
const skipped = [];
const seen = new Set();
for (const L of fs.readFileSync(TSV, 'utf8').split('\n')) {
  if (!L.trim() || L.startsWith('#')) continue;
  const c = L.split('\t');
  if (c.length < 3) continue;
  const [sect, key, zh] = c.map((s) => s.trim());
  if (seen.has(key)) continue;               // 同 key 只留一条 (pontoon 既是呼号也是本名)
  seen.add(key);
  if (mechKeys.has(key)) { skipped.push([key, zh, '与机甲名冲突']); continue; }
  if (key.length < 2 || !zh) continue;
  rows.push([key, zh, sect]);
}
const call = rows.filter((r) => r[2] === 'call');
const name = rows.filter((r) => r[2] === 'name');

const L = [];
L.push('    // >>> PILOT-KEYS BEGIN (由 tools/gen-pilot-keys.mjs 从 corpus/pilot-names.tsv 生成, 勿手改)');
L.push(`    // 呼号 ${call.length} 条 + 名/姓 ${name.length} 条 = ${rows.length} 条 (人工翻译)`);
const emit = (arr) => {
  const sorted = arr.slice().sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const out = [];
  for (let i = 0; i < sorted.length; i += 3) {
    out.push('    ' + sorted.slice(i, i + 3).map(([k, v]) => `['${lit(k)}', '${lit(v)}']`).join(', ') + ',');
  }
  return out;
};
L.push(`    // --- 呼号 ---`);
L.push(...emit(call));
L.push(`    // --- 名/姓 ---`);
L.push(...emit(name));
L.push('    // >>> PILOT-KEYS END');

// ---- 正文里也出现的飞行员名: 这些还要加进"专名汉化"表, 否则对白里的 Dekker 仍是英文 ----
// 两类都要收:
//   a) 本次新补 key 的 (用户人工翻译, 见上面的 rows)
//   b) 【已有官方 key】的 —— key 层面早就汉化了, 但专名汉化表里只有 glossary 的多词全名
//      (Dominik Zhao), 没有裸名 (Dominik), 所以正文里一直是英文。这类的中文直接取 CSV 现值。
// 判据: 该英文原名出现在【可见文本】里 (遮掉 [[引用键]]、<标签>、{占位符})。
// 只收真正用得上的, 不必把 300 多条全塞进正文替换表 (Falcon/Hammer/Rook 这类同时是普通名词)。
const SKIP_PROSE = new Map([
  ['paladin', '正文里是公司名 "Paladin Protection", 不是那位飞行员的呼号'],
  ['none', '"NONE" 是数据里的占位值, 不是人名'],
  ['dark', '"Dark" 是啤酒名 Timbiqui Dark 的一部分, 不是黑暗'],
  ['paradox', '【重要】正文里绝大多数是公司名 Paradox Interactive (登录界面/隐私政策); 换掉会写成"使用现有的悖论帐户登录"'],
  ['driver', '正文里是调试串 "HIDDEN Reinforcement Driver" 里的 AI 驱动器, 不是司机'],
]);
const US = '\u001f';
const zhRows = [];
try {
  for (const L2 of fs.readFileSync(path.join(root, '.tmp', 'prename.csv'), 'utf8')
    .replace(/^\uFEFF/, '').split('\n').slice(1)) {
    const i = L2.indexOf(',');
    if (i > 0) zhRows.push([L2.slice(0, i), L2.slice(i + 1).replace(/\r$/, '')]);
  }
} catch { }
const zhMap = new Map(zhRows);
const deMap = new Set();
try {
  for (const L2 of fs.readFileSync(path.join('D:\\MyDownload\\Things\\Steam\\steamapps\\common\\BATTLETECH',
    'BattleTech_Data', 'StreamingAssets', 'data', 'localization', 'strings_de-DE.csv'), 'utf8')
    .replace(/^\uFEFF/, '').split('\n').slice(1)) {
    const i = L2.indexOf(','); if (i > 0) deMap.add(L2.slice(0, i));
  }
} catch { }
const vis = (v) => v
  .replace(/\[\[([\s\S]*?)\]\]/g, (m, inner) => { const i = inner.indexOf(US); return i >= 0 ? inner.slice(i + 1) : ' '; })
  .replace(/<[^>]*>/g, ' ').replace(/\{[^{}]*\}/g, ' ');
const norm2 = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// 全部飞行员的 FirstName / LastName / Callsign
const GAME = 'D:\\MyDownload\\Things\\Steam\\steamapps\\common\\BATTLETECH';
const pd = path.join(GAME, 'BattleTech_Data', 'StreamingAssets', 'data', 'pilot');
const allNames = new Set();
if (fs.existsSync(pd)) {
  for (const f of fs.readdirSync(pd).filter((x) => x.endsWith('.json'))) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(pd, f), 'utf8')).Description || {};
      for (const v of [d.Callsign, d.FirstName, d.LastName]) if (v && v.length >= 4) allNames.add(v);
    } catch { }
  }
}
// 本次新补的: 英文原文 -> 中文
const fromTsv = new Map();
for (const r of rows) {
  // rows 里存的是 [key, zh, sect]; 英文原文要从数据文件反查
  fromTsv.set(r[0], r[1]);
}
const enOfKey = new Map();
if (fs.existsSync(pd)) {
  for (const f of fs.readdirSync(pd).filter((x) => x.endsWith('.json'))) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(pd, f), 'utf8')).Description || {};
      for (const v of [d.Callsign, d.FirstName, d.LastName]) if (v && !enOfKey.has(norm2(v))) enOfKey.set(norm2(v), v);
    } catch { }
  }
}
const prose = new Map();
for (const nm of allNames) {
  const key = norm2(nm);
  if (SKIP_PROSE.has(key)) continue;
  // 中文: 本次新补的优先, 否则用 CSV 里的现值 (有官方 key 的情况)
  const z = fromTsv.get(key) || (deMap.has(key) ? zhMap.get(key) : undefined);
  if (!z) continue;
  const re = new RegExp('(^|[^A-Za-z])' + nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z]|$)');
  if (zhRows.some(([, v]) => re.test(vis(v)))) prose.set(nm, z);
}
const proseArr = [...prose].sort((a, b) => (a[0] < b[0] ? -1 : 1));
const P = [];
P.push('// >>> PILOT-PROSE BEGIN (由 tools/gen-pilot-keys.mjs 生成, 勿手改)');
P.push('// 飞行员呼号/名/姓里, 英文原名仍出现在正文中的那些 (专名汉化表要用)');
P.push('const PILOT_PROSE = [');
for (let i = 0; i < proseArr.length; i += 4) {
  P.push('  ' + proseArr.slice(i, i + 4).map(([e, z]) => `['${lit(e)}', '${lit(z)}']`).join(', ') + ',');
}
P.push('];');
P.push('// >>> PILOT-PROSE END');
console.log(`正文里出现的飞行员名: ${proseArr.length} 个 -> ${proseArr.map(([e]) => e).join(', ')}`);
for (const [k, why] of SKIP_PROSE) console.log(`  跳过 ${k}: ${why}`);

console.log(`呼号 ${call.length} 条, 名/姓 ${name.length} 条, 合计 ${rows.length} 条`);
if (skipped.length) {
  console.log(`自动跳过 ${skipped.length} 条:`);
  for (const [k, v, why] of skipped) console.log(`  ${k} -> ${v}  (${why})`);
}
if (process.argv.includes('--write')) {
  // 先确认区块存在。不能拿"替换后内容有没有变"当判据 —— 幂等重跑时内容本来就一样,
  // 那样会误报"未找到区块"并拒绝写入 (踩过)。
  const hasKeys = / {4}\/\/ >>> PILOT-KEYS BEGIN[\s\S]*?\/\/ >>> PILOT-KEYS END/.test(src);
  const hasProse = /\/\/ >>> PILOT-PROSE BEGIN[\s\S]*?\/\/ >>> PILOT-PROSE END/.test(src);
  if (!hasKeys || !hasProse) {
    console.error(`!! 区块缺失: PILOT-KEYS=${hasKeys} PILOT-PROSE=${hasProse}, 没有写入`);
    process.exit(1);
  }
  const out = src.replace(/ {4}\/\/ >>> PILOT-KEYS BEGIN[\s\S]*?\/\/ >>> PILOT-KEYS END/, L.join('\n'));
  const out2 = out.replace(/\/\/ >>> PILOT-PROSE BEGIN[\s\S]*?\/\/ >>> PILOT-PROSE END/, P.join('\n'));
  if (src.length < 10000 || out2.length < src.length * 0.8) {
    console.error(`!! 拒绝写入: 源 ${src.length} 字节 -> 结果 ${out2.length} 字节, 疑似异常`);
    process.exit(1);
  }
  writeAtomic(mf, out2);
  console.log(`已写入 ${mf}`);
} else {
  console.log('(未加 --write) 预览:');
  console.log(L.slice(0, 6).join('\n'));
  console.log(P.slice(0, 4).join('\n'));
}
