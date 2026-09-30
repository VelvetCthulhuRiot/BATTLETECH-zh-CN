// 部署字体 mod (DLL + 离线字形图集 + OFL 许可) 到游戏 mods 目录。
// 用法: node tools/deploy-font.mjs
//
// ⚠️ 这里必须把描述文件写成 mod.json (Game Mod), 不能写 systemMod.json。
//    原版 ModLoader 有个 bug: 在游戏内禁用 System Mod 会写错表 ->
//    KeyNotFoundException -> 之后 GetCombinedModStatus() 合并两表撞重复键 ->
//    保存/模组界面/存档校验全挂 (详见 HANDOFF.md §12)。
//    DLL 不是 System Mod 的专利: 官方 Mod Support PDF §2.3.4 说 DLL 对 Game Mod 可选、
//    对 System Mod 才是必需, 所以字体 mod 完全可以做成 Game Mod。
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

// 仓库根目录: 从脚本自身位置推导 (脚本位于 <root>/tools/)。
// 这样克隆下来就能直接跑, 也避免把开发机的用户名写进公开仓库。
const PROJ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ATLAS_SRC = path.join(PROJ, 'corpus', 'font-atlas', 'out');
const FONT_DIR = path.join(PROJ, 'corpus', 'font-atlas', 'font');
const MOD_SRC = path.join(PROJ, 'mod-src');
const DEST = path.join(process.env.USERPROFILE, 'Documents', 'My Games', 'BattleTech', 'mods', 'BTHanHuaFont');

// 字体 mod 的描述文件 (单一口径: 由本脚本生成, 仓库那份由 sync-repo 从这里取)
// Manifest 必须是空数组: Game Mod 默认会"隐式把目录里的文件当资产", 显式给个空 Manifest
// 就不会去动 atlas.a8 / DLL 那些文件 (DLL 自己按 DLL 所在目录读图集)。
// ⚠️ 存档世代开关, 定下来就别再改 (两个方向都会让另一侧的存档读不了) —— 见 HANDOFF.md §12。
const MOD_NAME = 'BTHanHuaFont';
const VERSION = '1.2.3';
const modJson = {
  Name: MOD_NAME,
  Enabled: true,
  Version: VERSION,
  Description: '中文字体注入 - 双向字体切换 + 字形缺失/漏译诊断日志',
  Author: 'VelvetCthulhuRiot',
  Website: 'https://github.com/VelvetCthulhuRiot/BATTLETECH-zh-CN',
  DLL: 'BTHanHuaFont.dll',
  DLLEntryPoint: 'BTHanHua.FontMod.Init',
  Manifest: [],
  IsSaveAffecting: false,
};

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';

// 1) 把编译产物转正
const built = path.join(MOD_SRC, 'BTHanHuaFont.new.dll');
const canonical = path.join(MOD_SRC, 'BTHanHuaFont.dll');
if (fs.existsSync(built)) {
  fs.copyFileSync(built, canonical);
  fs.unlinkSync(built);
  console.log(`DLL 转正: mod-src/BTHanHuaFont.dll  (${mb(fs.statSync(canonical).size)})`);
} else if (!fs.existsSync(canonical)) {
  throw new Error('找不到 mod-src/BTHanHuaFont.dll (先编译)');
}

// 2) 检查图集产物
for (const f of ['atlas.a8', 'atlas.bin']) {
  const p = path.join(ATLAS_SRC, f);
  if (!fs.existsSync(p)) throw new Error(`缺少图集产物 ${p} (先跑 build-atlas.py)`);
}

// 3) 部署
fs.mkdirSync(path.join(DEST, 'atlas'), { recursive: true });
const jobs = [
  [canonical, path.join(DEST, 'BTHanHuaFont.dll')],
  [path.join(ATLAS_SRC, 'atlas.a8'), path.join(DEST, 'atlas', 'atlas.a8')],
  [path.join(ATLAS_SRC, 'atlas.bin'), path.join(DEST, 'atlas', 'atlas.bin')],
  [path.join(FONT_DIR, 'LICENSE-noto-cjk.txt'), path.join(DEST, 'LICENSE-OFL.txt')],
  [path.join(FONT_DIR, 'README-third_party.md'), path.join(DEST, 'LICENSE-third_party.md')],
];
console.log(`\n目标: ${DEST}`);
for (const [s, d] of jobs) {
  fs.copyFileSync(s, d);
  console.log(`  ${path.basename(d).padEnd(24)} ${mb(fs.statSync(d).size).padStart(9)}  sha256 ${sha(d).slice(0, 16)}…`);
}

// 4) 描述文件: 写 mod.json, 并把旧的 systemMod.json 删掉
//    (两个描述文件同时存在 = 同一个 Name 出现在"游戏 mod"和"系统 mod"两张表里 ->
//     GetCombinedModStatus() 合并时 Dictionary.Add 撞键 -> 就是那个原版 bug 的后果)
fs.writeFileSync(path.join(DEST, 'mod.json'), JSON.stringify(modJson, null, 4) + '\n', 'utf8');
console.log(`\n描述文件: mod.json (Game Mod)  ${modJson.DLL} / Manifest 空 / IsSaveAffecting=false`);
const legacy = path.join(DEST, 'systemMod.json');
if (fs.existsSync(legacy)) {
  fs.unlinkSync(legacy);
  console.log('  已删除旧的 systemMod.json (不删会导致两个描述文件同时被加载 -> 撞重复键)');
}

// 5) 迁移体检: 从 System Mod 改成 Game Mod 之后, 旧的 system_mod_status.json 里
//    还留着 BTHanHuaFont 这条 -> 会和新的游戏 mod 表撞键, 必须让游戏重建缓存。
{
  const cache = path.join(process.env.USERPROFILE, 'Documents', 'My Games', 'BattleTech', 'mods', 'HBS', 'Cache');
  const sysStatus = path.join(cache, 'system_mod_status.json');
  let stale = false;
  try { stale = fs.existsSync(sysStatus) && fs.readFileSync(sysStatus, 'utf8').includes(MOD_NAME); } catch { }
  if (stale) {
    console.log('\n!! 迁移提醒: HBS\\Cache\\system_mod_status.json 里还有旧的 BTHanHuaFont 记录。');
    console.log('   它会让游戏把同一个名字同时算进"系统 mod"和"游戏 mod"两张表 -> 撞重复键 -> 模组界面/保存全挂。');
    console.log('   请关掉游戏后删掉这几个文件 (游戏会自己重建), 保留 MetadataDatabase.db:');
    for (const f of ['mod_status.json', 'system_mod_status.json', 'merge_cache.json', 'type_cache.json']) {
      console.log('     ' + path.join(cache, f));
    }
    console.log('     ' + path.join(process.env.USERPROFILE, 'Documents', 'My Games', 'BattleTech', 'mods', 'load_order.json'));
  }
}

// 6) 清理上次运行的诊断产物, 保证这次日志干净
for (const f of ['BTHanHuaFont.log', 'BTHanHuaFont.glyphs.txt']) {
  const p = path.join(DEST, f);
  if (fs.existsSync(p)) { fs.unlinkSync(p); console.log(`  已清理旧的 ${f}`); }
}

// 7) 开关状态提示
const flags = ['ATLAS_OFF', 'ATLAS_FORCE', 'FONT_NOSHRINK', 'FULLFONT_ON', 'FULLFONT_OFF'];
const present = flags.filter((f) => fs.existsSync(path.join(DEST, f)));
console.log(`\n开关: ${present.length ? present.join(', ') : '(全部关闭, 走默认路径)'}`);
console.log(`\n图集目录内容:`);
for (const f of fs.readdirSync(path.join(DEST, 'atlas'))) {
  console.log(`  atlas/${f}  ${mb(fs.statSync(path.join(DEST, 'atlas', f)).size)}`);
}
console.log('\n下一步: 启动游戏 -> MODS 确认 BTHanHuaFont 已启用 -> 进游戏看中文');
console.log('然后读日志: mods\\BTHanHuaFont\\BTHanHuaFont.log  (在游戏跑起来之后)');
console.log('注意: 两个 mod 现在都是 Game Mod, 在游戏内取消勾选不会再破坏模组状态;');
console.log('      但仍然不要勾选"禁用"后存档 —— 要关就直接把文件夹移出 mods\\。');
