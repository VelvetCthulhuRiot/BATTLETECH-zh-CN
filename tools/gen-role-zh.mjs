// 把 corpus/stock-role-zh.tsv (用户人工翻译的机甲"常备角色"表) 灌进 tools/merge-final.mjs 的 ROLE-ZH 区块。
//
// 背景: 机甲库提示框的"常备角色: xxx"来自 chassisdef 的 StockRole 字段, 游戏把它规范化后当 key 查 CSV。
//   规范化的形态由实例反推: 小写 + 去空格 + 保留 "&-/" , 逗号写作 ^。
//   表里的 key 直接照抄数据文件算出来的形态, 所以这里不需要再规范化。
//
// 这些 key 大部分不在官方德语列表里 (官方没管), 少数在; 所以 merge-final 里对应的处理是
//   "已有就覆盖值, 没有就追加 key" —— 两种都要, 见 merge-final.mjs 的 ROLE-ZH 应用段。
//
// 用法: node tools/gen-role-zh.mjs [--write]
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 仓库根目录: 从脚本自身位置推导 (脚本位于 <root>/tools/)。
// 这样克隆下来就能直接跑, 也避免把开发机的用户名写进公开仓库。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mf = path.join(root, 'tools', 'merge-final.mjs');
const tsv = path.join(root, 'corpus', 'stock-role-zh.tsv');
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
if (rows.length < 50) {
  console.error(`!! corpus/stock-role-zh.tsv 只解析出 ${rows.length} 条, 疑似格式坏了, 拒绝继续`);
  process.exit(1);
}

const lines = [];
lines.push('  // >>> ROLE-ZH BEGIN (由 tools/gen-role-zh.mjs 生成, 勿手改)');
lines.push('  // 机甲"常备角色"(chassisdef 的 StockRole) 译名 —— 用户人工翻译, 权威来源 corpus/stock-role-zh.tsv');
lines.push('  // 注意: 已存在的 key 会被这里的值覆盖; 不在官方列表里的 key 由应用段追加。');
lines.push('  const ROLE_ZH = [');
for (let i = 0; i < rows.length; i += 3) {
  lines.push('    ' + rows.slice(i, i + 3).map(([k, v]) => `['${lit(k)}', '${lit(v)}']`).join(', ') + ',');
}
lines.push('  ];');
lines.push('  // >>> ROLE-ZH END');

console.log(`角色译名 ${rows.length} 条`);
const src = fs.readFileSync(mf, 'utf8');
if (!/\/\/ >>> ROLE-ZH BEGIN[\s\S]*?\/\/ >>> ROLE-ZH END/.test(src)) {
  console.error('!! 在 merge-final.mjs 里找不到 ROLE-ZH 区块标记, 拒绝写入');
  process.exit(1);
}
if (process.argv.includes('--write')) {
  const s = src.replace(/ {2}\/\/ >>> ROLE-ZH BEGIN[\s\S]*?\/\/ >>> ROLE-ZH END/, lines.join('\n'));
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
  console.log(lines.slice(0, 6).join('\n'));
}
