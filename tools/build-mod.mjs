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
  Version: '1.0.0',
  Description: '简体中文汉化 - 通过官方 ModLoader 注入, 不修改游戏原文件 (GitHub: VelvetCthulhuRiot/BATTLETECH-zh-CN)',
  Author: 'VelvetCthulhuRiot',
  Website: 'https://github.com/VelvetCthulhuRiot/BATTLETECH-zh-CN',
  Manifest: [{ Type: 'CSV', Path: 'strings_zh-CN.csv' }],
};
// 备用形式: 有些 ModLoader 版本需要路径带上目录层级, 失败时可一键切换
const modJsonAlt = { ...modJson, Manifest: [{ Type: 'CSV', Path: 'data/localization/strings_zh-CN.csv' }] };

const readme = [
  'BATTLETECH 简体中文汉化 (通过官方 ModLoader 注入, 不修改游戏原文件)',
  '项目主页: https://github.com/VelvetCthulhuRiot/BATTLETECH-zh-CN',
  '',
  '安装:',
  '  1. 把 mods 里的 BTHanHua 和 BTHanHuaFont 两个文件夹放到',
  '     Documents\\My Games\\BattleTech\\mods\\ 下 (游戏目录零改动)',
  '  2. 启动游戏 -> MODS -> 勾选右上角「模组启用」-> 保存 -> 完全重启游戏',
  '  3. 重启后 -> 设置 -> LANGUAGE -> 中文',
  '',
  '  注意: 第一次进 MODS 界面可能提示「检测不到模组」, 这是正常的 ——',
  '  模组功能默认关闭, 且首次运行要建模组索引, 勾选启用后重启即可。',
  '',
  '卸载: 删除这两个文件夹。Steam 校验游戏完整性不受影响。',
  '',
  '内容:',
  '  mod.json          ModLoader 描述文件, Manifest 把 strings_zh-CN.csv 注入版本清单',
  '  strings_zh-CN.csv 中文文本包 (21,505 条, 覆盖率 100%)',
  '  mod.alt.json      备用描述文件 (若 mod 加载失败, 用它替换 mod.json 再试)',
  '',
  '出问题:',
  '  * 文字变方框/不显示 -> 删掉 BTHanHuaFont 文件夹, 文本汉化不受影响',
  '  * 界面还是英文 -> 设置里选「中文」; 下拉框没有「中文」说明 mod.json 没加载成功',
  '  * 某个词读起来怪怪的 (如「眼毛」) -> 字体字表限制, 不是错译, 见 README',
  '',
  '译文语料改编自 cxwithyxy/BATTLETECH_zhcn (MIT, (c) 2022 cx2889)。',
  '字体包 font 是微软雅黑的 SDF 图集, 字体授权提示见项目 THIRDPARTY.md。',
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
