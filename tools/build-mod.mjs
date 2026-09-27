// 构建实机验证用的 mod 骨架
// 用法: node build-mod.mjs          -> 带 ASCII 探针 (验证注入链路)
//       node build-mod.mjs --clean  -> 去除探针, 输出正式汉化
import fs from 'node:fs';
import path from 'node:path';

const PROJ = 'C:\\Users\\lxp_0\\Documents\\BTHanHua';
const SRC = path.join(PROJ, 'corpus', 'strings_zh-CN.csv');
const CLEAN = process.argv.includes('--clean');

// 首屏探针: 用纯 ASCII 值, 与字体无关, 只要出现就证明 CSV 注入成功
const PROBES = {
  'campaign': 'ZHCN1-CAMPAIGN',
  'skirmish': 'ZHCN2-SKIRMISH',
  'multiplayer': 'ZHCN3-MULTIPLAYER',
  'settings': 'ZHCN4-SETTINGS',
  'credits': 'ZHCN5-CREDITS',
  'exit': 'ZHCN6-EXIT',
  'load': 'ZHCN7-LOAD',
  'continue': 'ZHCN8-CONTINUE',
  'options': 'ZHCN9-OPTIONS',
  'newgame': 'ZHCN10-NEWGAME',
};

// 载入源 CSV
const raw = fs.readFileSync(SRC, 'utf8').replace(/\n$/, '');
const lines = raw.split('\n');
const header = lines[0];
const rows = new Map();
for (const L of lines.slice(1)) { const i = L.indexOf(','); if (i > 0) rows.set(L.slice(0, i), L.slice(i + 1)); }
console.log(`源 CSV: ${header}  ${rows.size} 条`);

let probed = 0, added = 0;
if (!CLEAN) {
  for (const [k, v] of Object.entries(PROBES)) {
    if (rows.has(k)) probed++; else added++;
    rows.set(k, v);
  }
  console.log(`探针: 覆盖已有 key ${probed} 条, 新增 key ${added} 条`);
}

const outLines = [header];
for (const [k, v] of rows) outLines.push(k + ',' + v);
const csvText = outLines.join('\n') + '\n';
// 自检: 值里不能有 ASCII 逗号
for (const L of outLines.slice(1)) { const i = L.indexOf(','); if (L.slice(i + 1).includes(',')) throw new Error('值里有逗号: ' + L.slice(0, 80)); }

const MOD_NAME = 'BTHanHua';
const modJson = {
  Name: MOD_NAME,
  Enabled: true,
  Version: '0.2.0',
  Description: '个人自用简体中文汉化 - 通过官方 ModLoader 注入, 不修改游戏原文件',
  Author: 'personal',
  Website: 'https://github.com/cxwithyxy/BATTLETECH_zhcn',
  Manifest: [{ Type: 'CSV', Path: 'strings_zh-CN.csv' }],
};
// 备用形式: 有些 ModLoader 版本需要路径带上目录层级, 失败时可一键切换
const modJsonAlt = { ...modJson, Manifest: [{ Type: 'CSV', Path: 'data/localization/strings_zh-CN.csv' }] };

const readme = [
  'BATTLETECH 个人自用汉化 (通过官方 ModLoader 注入, 不修改游戏原文件)',
  '',
  '安装: 本文件夹整体放在 Documents\\My Games\\BattleTech\\mods\\ 下即可, 游戏目录零改动。',
  '卸载: 删除本文件夹。Steam 校验游戏完整性不受影响 (它只校验 depot 清单内文件, 不删未知文件)。',
  '',
  '内容:',
  '  mod.json          ModLoader 描述文件, Manifest 把 strings_zh-CN.csv 注入版本清单',
  '  strings_zh-CN.csv 中文文本包 (由社区译文合并而成)',
  '  mod.alt.json      备用描述文件 (若 mod 加载失败, 用它替换 mod.json 再试)',
  '',
  '文本来源: cxwithyxy/BATTLETECH_zhcn (Paratranz 人工译文 + 社区旧汉化 + 德语机翻兜底)',
].join('\r\n');

// 游戏实测确认使用 "My Games" (带空格) 这个路径 (见 modloader 日志 "Using default Mods path")
const targets = [
  process.env.USERPROFILE + '\\Documents\\My Games\\BattleTech\\mods\\' + MOD_NAME,
];
const outCsvName = CLEAN ? 'strings_zh-CN.csv' : 'strings_zh-CN.csv';
for (const dir of targets) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, outCsvName), csvText, 'utf8');
  fs.writeFileSync(path.join(dir, 'mod.json'), JSON.stringify(modJson, null, 4) + '\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'mod.alt.json'), JSON.stringify(modJsonAlt, null, 4) + '\n', 'utf8');
  fs.writeFileSync(path.join(dir, '说明.txt'), readme, 'utf8');
  console.log(`已写入 ${dir}  (${(fs.statSync(path.join(dir, outCsvName)).size / 1048576).toFixed(2)} MB, ${rows.size} 条)`);
}
console.log(`\n模式: ${CLEAN ? '正式(无探针)' : '验证(带 ASCII 探针)'}`);
