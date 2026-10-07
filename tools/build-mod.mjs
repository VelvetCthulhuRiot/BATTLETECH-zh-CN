// 构建实机验证用的 mod 骨架
// 用法: node build-mod.mjs          -> 带 ASCII 探针 (验证注入链路)
//       node build-mod.mjs --clean  -> 去除探针, 输出正式汉化
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 仓库根目录: 从脚本自身位置推导 (脚本位于 <root>/tools/)。
// 这样克隆下来就能直接跑, 也避免把开发机的用户名写进公开仓库。
const PROJ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
// 版本号: 发新版时改这里 (会写进 mod.json 与 说明.txt, 并随 sync-repo 同步到仓库)
const VERSION = '1.2.6';
const modJson = {
  Name: MOD_NAME,
  Enabled: true,
  Version: VERSION,
  Description: '简体中文汉化 - 通过官方 ModLoader 注入, 不修改游戏原文件 (GitHub: VelvetCthulhuRiot/BATTLETECH-zh-CN)',
  Author: 'VelvetCthulhuRiot',
  Website: 'https://github.com/VelvetCthulhuRiot/BATTLETECH-zh-CN',
  Manifest: [{ Type: 'CSV', Path: 'strings_zh-CN.csv' }],
  // ⚠️ 存档世代开关, 定下来就别再改 —— 两个方向都会让"另一侧"的存档读不了:
  //    false = 装了汉化之后新存的档不再依赖汉化 (卸载后照样能读) —— 这是想要的;
  //            但用旧版 (mod.json 里没有这行、即默认 true) 玩过的档记着旧汉化的必需项,
  //            装本版会显示"未安装/激活所需的模组" -> 把那行删掉即可读回。
  //    机制(反编译 GameInstanceSave.AreNecessaryModsInstalled): 存档里记 RequiredModIDs,
  //    读档时拿当前 ModLoader.GetSaveAffectingModDefs() 去对; 两边必须对得上。详见 HANDOFF §12。
  IsSaveAffecting: false,
};
// 备用形式: 有些 ModLoader 版本需要路径带上目录层级, 失败时可一键切换
const modJsonAlt = { ...modJson, Manifest: [{ Type: 'CSV', Path: 'data/localization/strings_zh-CN.csv' }] };

const readme = [
  'BATTLETECH 简体中文汉化 (通过官方 ModLoader 注入, 不修改游戏原文件)',
  '项目主页: https://github.com/VelvetCthulhuRiot/BATTLETECH-zh-CN',
  `版本: v${VERSION} (对应游戏 1.9.1 / build 686R)`,
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
  '从旧版本升级 (v1.2.1 及更早 -> 本版):',
  '  旧版的 BTHanHuaFont 用的是 systemMod.json。如果那个文件还在, 请删掉它 ——',
  '  同一个文件夹里同时有 systemMod.json 和 mod.json 会让游戏把同一个模组名',
  '  算进两张表, 触发原版 ModLoader 的缺陷 (模组界面列表空白 / 保存卡住 / 校验异常)。',
  '  同时删掉这几个缓存文件让游戏重建 (MetadataDatabase.db 要保留):',
  '     mods\\HBS\\Cache\\mod_status.json',
  '     mods\\HBS\\Cache\\system_mod_status.json',
  '     mods\\HBS\\Cache\\merge_cache.json',
  '     mods\\HBS\\Cache\\type_cache.json',
  '     mods\\load_order.json',
  '',
  '开关 / 卸载汉化 (都安全):',
  '  * 想临时关掉汉化: 在 MODS 界面取消勾选这两个模组 -> 保存 -> 完全重启游戏。',
  '    重启后界面回到英文 (字形图集也不再注入), 不会损坏模组状态, 也不会锁住存档。',
  '  * 想彻底卸载: 退出游戏后删掉 BTHanHua 与 BTHanHuaFont 两个文件夹即可。',
  '  * v1.2.2 起装的档不依赖汉化 —— 把关掉的模组移走, 那些存档照样能读。',
  '',
  '  (历史遗留, v1.2.1 及更早: 那时字体模组是"系统模组", 而游戏自带 ModLoader 有个缺陷,',
  '   在游戏里禁用系统模组会写坏模组状态, 症状是保存卡住 / 模组界面空白 / 存档校验异常。',
  '   v1.2.2 已把字体模组改成普通游戏模组, 这个问题不存在了。若你从旧版升级并遇到过,',
  '   关掉游戏后删掉 HBS\\Cache 下的 mod_status.json / system_mod_status.json /',
  '   merge_cache.json / type_cache.json 以及 mods\\load_order.json 即可(保留 MetadataDatabase.db)。',
  '   另外, 用 v1.2.1 及更早版本玩过的档记着"需要汉化", 装本版会显示「未安装/激活所需的模组」;',
  '   想读回来就把两个 mod.json 里的 "IsSaveAffecting": false 那一行删掉再重启 ——',
  '   该判定每次读档现算, 可逆、不会弄坏档。)',
  '',
  '卸载: 删除这两个文件夹。Steam 校验游戏完整性不受影响。',
  '',
  '内容:',
  '  mod.json          ModLoader 描述文件, Manifest 把 strings_zh-CN.csv 注入版本清单',
  '  strings_zh-CN.csv 中文文本包 (21,875 条, 覆盖率 100%)',
  '  mod.alt.json      备用描述文件 (若 mod 加载失败, 用它替换 mod.json 再试)',
  '',
  '出问题:',
  '  * 文字变方框/不显示 -> 删掉 BTHanHuaFont 文件夹, 文本汉化不受影响 (原因见它自己的日志)',
  '  * 界面还是英文 -> 设置里选「中文」; 下拉框没有「中文」说明 mod.json 没加载成功,',
  '    可以把 mod.alt.json 复制成 mod.json 再试',
  '  * 发现错译 / 读不通 -> 欢迎到项目主页提 issue, 附上界面和原文',
  '',
  '译文语料改编自 cxwithyxy/BATTLETECH_zhcn (MIT, (c) 2022 cx2889)。',
  '字形来自 Noto Sans SC (SIL OFL 1.1, 可自由再分发), 全文见 BTHanHuaFont\\LICENSE-OFL.txt。',
  '第三方归属详见项目 THIRDPARTY.md。',
].join('\n');   // LF: 与 .gitattributes 的 eol=lf 一致, 仓库里那份与 zip 里那份就完全相同

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
