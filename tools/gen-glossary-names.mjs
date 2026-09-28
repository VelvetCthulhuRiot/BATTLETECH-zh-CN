// 从 corpus/glossary.tsv 生成"专名汉化"补充表, 写进 tools/merge-final.mjs 的 GLOSSARY-NAMES 区块。
// 用法: node tools/gen-glossary-names.mjs [--write]
//
// 筛选规则 (为什么不是全收):
//   1. 只收"明确是专名"的类别 —— （人名）（地名）（机甲）（生物）（日本人姓）（作品）…
//      不收（组织）（绰号）与无标注: glossary 里这些常给多个备选 (如 AFFS→"恒星联邦军，恒星联邦武装部队"),
//      或含义有歧义 (Canopus→船底 指船底座、Paradox→悖论 是绰号但译文里用的是公司名 Paradox Interactive)。
//   2. 中文必须是单一写法 —— 含 （ ( ， , / 、 的一律跳过 (那是"可选译法"列表, 直接替换会写出病句)。
//   3. 名字必须真的还在可见文本里出现 (引用键与富文本标签不算)。
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
// 仓库根目录: 从脚本自身位置推导 (脚本位于 <root>/tools/)。
// 这样克隆下来就能直接跑, 也避免把开发机的用户名写进公开仓库。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const US = '\u001f';

const OK_CATS = new Set(['人名', '地名', '机甲', '生物', '日本人姓', '中国人名', '作品', '船名', '国家', '星球']);
const BAD_CHARS = /[（(，,\/、]/;

// JS 字符串字面量转义: 译文里可能出现单引号或反斜杠 (实测有 "娜塔莎\" 这种),
// 直接拼进 '...' 会生成语法错误的 merge-final.mjs —— 已经因此坏过一次。
const lit = (x) => String(x).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const zh = [];
for (const L of fs.readFileSync(path.join(root, '.tmp', 'prename.csv'), 'utf8')
  .replace(/^\uFEFF/, '').split('\n').slice(1)) {
  const i = L.indexOf(',');
  if (i > 0) zh.push([L.slice(0, i), L.slice(i + 1).replace(/\r$/, '')]);
}
const vis = (v) => v
  .replace(/\[\[([\s\S]*?)\]\]/g, (m, inner) => { const i = inner.indexOf(US); return i >= 0 ? inner.slice(i + 1) : ' '; })
  .replace(/<[^>]*>/g, ' ').replace(/\{[^{}]*\}/g, ' ');

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
// 只把【手工写死】的名字当作"已在名单里"。
// 必须先把生成器自己的区块剔除: 否则第二次运行时, 上次生成的 155 条会被当成"手工添加"而跳过,
// 于是只输出新增的几条, 写回时把整个区块覆盖掉 —— 专名表越跑越小 (实测踩到过, 丢了 150 条)。
let clean = src;
for (const tag of ['GLOSSARY-NAMES', 'MECH-KEYS', 'MECH-ZH', 'PILOT-PROSE', 'MECH-MODELS']) {
  // 结束标记可能是 <<< 也可能是 >>> (GLOSSARY-NAMES 用的就是 <<<), 两种都要认
  clean = clean.replace(new RegExp(`// >>> ${tag} BEGIN[\\s\\S]*?// [<>]{3} ${tag} END`, 'g'), '');
}
const block = clean.slice(clean.indexOf('const NAMES'), clean.indexOf('].sort((a, b) => b[0].length'));
const manuallyAdded = new Set([...block.matchAll(/\[\s*'([^']+)'\s*,\s*'([^']+)'\s*\]/g)].map((m) => m[1]));

const picked = [], skipped = [];
// 用户人工精修的机甲名表优先: 同一台机甲在 glossary 里的写法可能与最终译名不同
// (glossary: "Cataphract 具装骑兵", 用户定名 "铁甲骑兵")。这张表就是权威, 以它为准,
// 免得专名汉化把英文替换成旧译名、再靠 merge-final 里的改名段回补。
const userMechZh = {};
{
  const p = path.join(root, 'corpus', 'mech-names-zh.tsv');
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      if (!line.trim() || line.startsWith('#')) continue;
      const c = line.split('\t');
      if (c.length >= 2 && c[0].trim() && c[1].trim()) userMechZh[c[0].trim()] = c[1].trim();
    }
  }
}
const normKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
for (const L of fs.readFileSync(path.join(root, 'corpus', 'glossary.tsv'), 'utf8').split('\n')) {
  if (!L.trim()) continue;
  const c = L.split('\t').map((s) => s.trim()).filter(Boolean);
  if (c.length < 2) continue;
  const [en, rawZh] = c;
  if (!/[A-Z]/.test(en) || !/^[A-Za-z][A-Za-z0-9'" .\-]*$/.test(en) || en.length < 4) continue;
  if (manuallyAdded.has(en)) continue;
  const cat = (rawZh.match(/（([^）]*)）/) || [, '无标注'])[1];
  if (!OK_CATS.has(cat)) { skipped.push([en, cat]); continue; }
  let clean = rawZh.replace(/（[^）]*）/g, '').trim();
  if (!clean || BAD_CHARS.test(clean)) {
    // glossary 这一格是"多写法" (机甲名常这样写: 擎天神，巨神，宇宙神)。机甲类的改用用户表;
    // 其它类别没有权威来源, 仍然跳过。
    const u = userMechZh[normKey(en)];
    if (!u || !/机甲/.test(cat)) { skipped.push([en, cat + '(多写法)']); continue; }
    clean = u;
  }
  if (userMechZh[normKey(en)]) clean = userMechZh[normKey(en)];
  const re = new RegExp('(^|[^A-Za-z])' + en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z]|$)');
  const n = zh.filter(([, v]) => re.test(vis(v))).length;
  if (!n) continue;
  picked.push([en, clean, n, cat]);
}
picked.sort((a, b) => a[0] < b[0] ? -1 : 1);

const lines = [];
for (let i = 0; i < picked.length; i += 3) {
  lines.push('    ' + picked.slice(i, i + 3).map(([e, z]) => `['${lit(e)}', '${lit(z)}']`).join(', ') + ',');
}
const body = `    // >>> GLOSSARY-NAMES BEGIN (由 tools/gen-glossary-names.mjs 从 corpus/glossary.tsv 生成, 勿手改)\n`
  + `    // 类别: ${[...new Set(picked.map((p) => p[3]))].join(' / ')}\n`
  + lines.join('\n') + '\n'
  + `    // <<< GLOSSARY-NAMES END`;
const out = src.replace(/ {4}\/\/ >>> GLOSSARY-NAMES BEGIN[\s\S]*?\/\/ <<< GLOSSARY-NAMES END/, body);

console.log(`选中 ${picked.length} 个专名, 覆盖 ${picked.reduce((a, p) => a + p[2], 0)} 条`);
const byCat = {};
for (const [, , n, cat] of picked) byCat[cat] = (byCat[cat] || 0) + 1;
console.log('  类别:', Object.entries(byCat).map(([c, n]) => `${c}×${n}`).join(' '));
console.log('  跳过(非专名类别, 保留英文):', [...new Set(skipped.map(([, c]) => c))].join(', '));
if (process.argv.includes('--write')) {
  if (src.length < 10000 || out.length < src.length * 0.8) {
    console.error(`!! 拒绝写入: 源 ${src.length} 字节 -> 结果 ${out.length} 字节, 疑似异常`);
    process.exit(1);
  }
  writeAtomic(mf, out);
  console.log(`已写入 ${mf}`);
} else {
  console.log('(未加 --write, 仅预览)');
  console.log(lines.slice(0, 4).join('\n'));
}
