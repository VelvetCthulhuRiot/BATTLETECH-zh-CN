// 把 corpus/mech-desc-zh.tsv (用户逐条精修的机甲详细描述) 灌进 tools/merge-final.mjs 的 CHASSIS-DESC 区块。
//
// 背景: 机甲提示框里那段两三句的简介来自 chassisdef 的 Description.Details;
//   游戏把这段英文规范化后当 key 查 CSV (小写、去空白、'.'->'*'、','->'^'、单引号/破折号删除),
//   所以"描述类 key"就是一长串规范化后的英文 —— 表里的 key 直接照抄这个形态。
//
// 大部分 key 在官方列表里(值是早期机翻, 要覆盖); 极少数(如 Shadow Hawk SHD-2D)官方从未本地化,
// 游戏里一直显示英文 —— 那些要作为额外 key 追加。两种都要, 见 merge-final.mjs 的 CHASSIS-DESC 应用段。
//
// 引号: 表里存"显示形态"(单个 ASCII 双引号), 这里写出 CSV 前转义成两个 ("" = 显示一个 "), 与官方一致。
//
// 用法: node tools/gen-chassis-desc.mjs [--write]
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mf = path.join(root, 'tools', 'merge-final.mjs');
const tsv = path.join(root, 'corpus', 'mech-desc-zh.tsv');

const csvEscape = (s) => s.replace(/"/g, '""');                    // 显示一个 " 写两个
const lit = (x) => String(x).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const rows = [];
for (const line of fs.readFileSync(tsv, 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const c = line.split('\t');
  if (c.length < 2 || c[0] === 'key') continue;
  const k = c[0].trim();
  const v = c[1].trim();
  if (k && v) rows.push([k, csvEscape(v), (c[4] || '').trim()]);
}
if (rows.length < 70) {
  console.error(`!! corpus/mech-desc-zh.tsv 只解析出 ${rows.length} 条, 疑似格式坏了, 拒绝继续`);
  process.exit(1);
}

const lines = [];
lines.push('  // >>> CHASSIS-DESC BEGIN (由 tools/gen-chassis-desc.mjs 生成, 勿手改)');
lines.push('  // 机甲详细描述 (chassisdef 的 Description.Details) 中译文 —— 用户逐条精修,');
lines.push('  // 权威来源 corpus/mech-desc-zh.tsv (原始表格 corpus/mech-descriptions-to-refine.xlsx)。');
lines.push('  // 注意: 这里的值已经是 CSV 形态(引号写成两个); 已存在的 key 会被覆盖, 官方没有的 key 由应用段追加。');
lines.push('  const CHASSIS_DESC = [');
for (const [k, v] of rows) {
  lines.push(`    ['${lit(k)}',\n     '${lit(v)}'],`);
}
lines.push('  ];');
lines.push('  // >>> CHASSIS-DESC END');

console.log(`机甲描述 ${rows.length} 条 (其中官方之外的 key: ${rows.filter((r) => r[2].includes('额外 key')).length} 条)`);
const src = fs.readFileSync(mf, 'utf8');
if (!/\/\/ >>> CHASSIS-DESC BEGIN[\s\S]*?\/\/ >>> CHASSIS-DESC END/.test(src)) {
  console.error('!! 在 merge-final.mjs 里找不到 CHASSIS-DESC 区块标记, 拒绝写入');
  process.exit(1);
}
if (process.argv.includes('--write')) {
  const s = src.replace(/ {2}\/\/ >>> CHASSIS-DESC BEGIN[\s\S]*?\/\/ >>> CHASSIS-DESC END/, lines.join('\n'));
  if (src.length < 10000 || s.length < src.length * 0.8) {
    console.error(`!! 拒绝写入: 源 ${src.length} -> 结果 ${s.length}`);
    process.exit(1);
  }
  const tmp = mf + '.tmp';
  fs.writeFileSync(tmp, s, 'utf8');
  fs.renameSync(tmp, mf);
  console.log(`已写入 ${mf}`);
} else {
  console.log('(未加 --write) 预览:');
  console.log(lines.slice(0, 7).join('\n'));
}
