// 把 corpus/manufacturers-zh.tsv (用户人工翻译的"制造商"表) 灌进 tools/merge-final.mjs 的 MFR-ZH 区块。
//
// 背景: 机甲库/商店的武器与设备条目上有一行小字是制造商名, 来自数据文件里
//   Description.Manufacturer 的英文字符串 —— 游戏把它规范化后当 key 查 CSV, 缺 key 就显示英文
//   (截图里的 GM / HELLION / SPERRY BROWNING / KRUPP / HOLLY 就是这个原因)。
//   规范化的形态与小写去空格一致; 表里的 key 直接照抄据此算出的形态, 所以这里不再重新规范化。
//
// 这些 key 一部分在官方列表里(值是早期机翻, 要覆盖), 一部分不在(要追加) —— 两种都要,
// 见 merge-final.mjs 的 MFR-ZH 应用段。
//
// 用法: node tools/gen-manufacturer-keys.mjs [--write]
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 仓库根目录: 从脚本自身位置推导 (脚本位于 <root>/tools/)。
// 这样克隆下来就能直接跑, 也避免把开发机的用户名写进公开仓库。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mf = path.join(root, 'tools', 'merge-final.mjs');
const tsv = path.join(root, 'corpus', 'manufacturers-zh.tsv');
const lit = (x) => String(x).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const rows = [];
for (const line of fs.readFileSync(tsv, 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const c = line.split('\t');
  if (c.length < 2 || c[0] === 'key') continue;
  const k = c[0].trim();
  const v = c[1].trim();
  if (k && v) rows.push([k, v]);
}
if (rows.length < 40) {
  console.error(`!! corpus/manufacturers-zh.tsv 只解析出 ${rows.length} 条, 疑似格式坏了, 拒绝继续`);
  process.exit(1);
}

const lines = [];
lines.push('  // >>> MFR-ZH BEGIN (由 tools/gen-manufacturer-keys.mjs 生成, 勿手改)');
lines.push('  // 机甲部件"制造商"(数据文件 Description.Manufacturer) 译名 —— 用户人工翻译,');
lines.push('  // 权威来源 corpus/manufacturers-zh.tsv (三种策略的原稿留档在 corpus/manufacturers-src/)。');
lines.push('  // 注意: 已存在的 key 会被这里的值覆盖; 不在官方列表里的 key 由应用段追加。');
lines.push('  // 未列入的纯缩写厂商 (RCA / SCI / VMI) 按用户要求保留英文, 不给 key。');
lines.push('  const MFR_ZH = [');
for (let i = 0; i < rows.length; i += 3) {
  lines.push('    ' + rows.slice(i, i + 3).map(([k, v]) => `['${lit(k)}', '${lit(v)}']`).join(', ') + ',');
}
lines.push('  ];');
lines.push('  // >>> MFR-ZH END');

console.log(`制造商译名 ${rows.length} 条`);
const src = fs.readFileSync(mf, 'utf8');
if (!/\/\/ >>> MFR-ZH BEGIN[\s\S]*?\/\/ >>> MFR-ZH END/.test(src)) {
  console.error('!! 在 merge-final.mjs 里找不到 MFR-ZH 区块标记, 拒绝写入');
  process.exit(1);
}
if (process.argv.includes('--write')) {
  const s = src.replace(/ {2}\/\/ >>> MFR-ZH BEGIN[\s\S]*?\/\/ >>> MFR-ZH END/, lines.join('\n'));
  if (src.length < 10000 || s.length < src.length * 0.8) {
    console.error(`!! 拒绝写入: 源 ${src.length} -> 结果 ${s.length}`);
    process.exit(1);
  }
  const tmp = mf + '.tmp';
  fs.writeFileSync(tmp, s, 'utf8');
  fs.renameSync(tmp, mf);          // 原子替换
  console.log(`已写入 ${mf}`);
} else {
  console.log('(未加 --write) 预览:');
  console.log(lines.slice(0, 7).join('\n'));
}
