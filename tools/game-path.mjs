// 定位 BATTLETECH 安装目录。
//
// 为什么不写死: Steam 库目录因机器而异 —— 默认在 C:\Program Files (x86)\Steam,
// 但装在别的盘、或者用 SteamLibrary / 自定义库目录都很常见。把作者的路径写死在
// 脚本里, 别人克隆下来就会拿着一个错路径去跑, 然后收到一堆看不懂的 ENOENT。
//
// 查找顺序 (先命中先用):
//   1) 环境变量 BT_GAME        —— 最可靠, 也是唯一推荐的方式
//   2) 常见 Steam 安装位置      —— 覆盖 C 盘默认位置与其它盘的 Steam / SteamLibrary
//   3) 作者开发机上的路径        —— 仅为了不给自己添麻烦; 别人的机器上不会命中
//
// 一个都找不到就打印怎么设置并退出, 而不是让调用方在后面某处崩掉。
//
// 用法:
//   import { GAME, SA } from './game-path.mjs';
//   // GAME = 游戏根目录, SA = ...\BattleTech_Data\StreamingAssets\data
import fs from 'node:fs';
import path from 'node:path';

const CANDIDATES = [
  process.env.BT_GAME,
  'C:/Program Files (x86)/Steam/steamapps/common/BATTLETECH',
  'C:/Program Files/Steam/steamapps/common/BATTLETECH',
  'C:/Steam/steamapps/common/BATTLETECH',
  'C:/SteamLibrary/steamapps/common/BATTLETECH',
  'D:/Steam/steamapps/common/BATTLETECH',
  'D:/SteamLibrary/steamapps/common/BATTLETECH',
  'E:/Steam/steamapps/common/BATTLETECH',
  'E:/SteamLibrary/steamapps/common/BATTLETECH',
  'F:/Steam/steamapps/common/BATTLETECH',
  'F:/SteamLibrary/steamapps/common/BATTLETECH',
  'D:/MyDownload/Things/Steam/steamapps/common/BATTLETECH',   // 作者开发机
].filter(Boolean);

// 判定"这确实是游戏目录": 必须有 BattleTech_Data\StreamingAssets\data
function looksLikeGame(p) {
  try {
    return fs.existsSync(path.join(p, 'BattleTech_Data', 'StreamingAssets', 'data'));
  } catch {
    return false;
  }
}

function die(extra) {
  console.error('!! ' + extra);
  console.error('');
  console.error('   请把 BT_GAME 指向游戏根目录（含 BattleTech_Data 的那一层），例如：');
  console.error('     PowerShell :  $env:BT_GAME = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\BATTLETECH"');
  console.error('     cmd        :  set BT_GAME=C:\\Program Files (x86)\\Steam\\steamapps\\common\\BATTLETECH');
  console.error('');
  console.error('   不确定装在哪？Steam 客户端 → 库 → 右键 BATTLETECH → 管理 → 浏览本地文件。');
  console.error('   （Steam 库不一定在 C 盘，也可能叫 SteamLibrary 或自定义名字。）');
  process.exit(1);
}

// 显式设了 BT_GAME 却无效 -> 直接报错, 绝不悄悄退回自动探测的结果。
// (否则用户以为自己的设置生效了, 实际在用一个完全不同的目录, 极难排查)
if (process.env.BT_GAME && !looksLikeGame(process.env.BT_GAME)) {
  die(`BT_GAME 指向的目录里找不到 BattleTech_Data\\StreamingAssets\\data：\n     ${process.env.BT_GAME}`);
}

const found = CANDIDATES.find(looksLikeGame);

if (!found) {
  die('找不到 BATTLETECH 安装目录（已在常见 Steam 位置搜过，都没命中）。');
}

export const GAME = found.replace(/\\/g, '/');
export const SA = path.join(GAME, 'BattleTech_Data', 'StreamingAssets', 'data');
export const LOC = path.join(SA, 'localization');

// 路径挑错了很难排查, 所以只要不是显式用 BT_GAME 指定的, 就把实际用的路径打出来。
if (!process.env.BT_GAME) {
  console.log(`(未设 BT_GAME, 自动探测到游戏目录: ${GAME})`);
}
