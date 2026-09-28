// 部署字体 mod (DLL + 离线字形图集 + OFL 许可) 到游戏 mods 目录。
// 用法: node tools/deploy-font.mjs
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

// 4) 清理上次运行的诊断产物, 保证这次日志干净
for (const f of ['BTHanHuaFont.log', 'BTHanHuaFont.glyphs.txt']) {
  const p = path.join(DEST, f);
  if (fs.existsSync(p)) { fs.unlinkSync(p); console.log(`  已清理旧的 ${f}`); }
}

// 5) 开关状态提示
const flags = ['ATLAS_OFF', 'ATLAS_FORCE', 'FONT_NOSHRINK', 'FULLFONT_ON', 'FULLFONT_OFF'];
const present = flags.filter((f) => fs.existsSync(path.join(DEST, f)));
console.log(`\n开关: ${present.length ? present.join(', ') : '(全部关闭, 走默认路径)'}`);
console.log(`\n图集目录内容:`);
for (const f of fs.readdirSync(path.join(DEST, 'atlas'))) {
  console.log(`  atlas/${f}  ${mb(fs.statSync(path.join(DEST, 'atlas', f)).size)}`);
}
console.log('\n下一步: 启动游戏 -> MODS 确认 BTHanHuaFont 已启用 -> 进游戏看中文');
console.log('然后读日志: mods\\BTHanHuaFont\\BTHanHuaFont.log  (在游戏跑起来之后)');
