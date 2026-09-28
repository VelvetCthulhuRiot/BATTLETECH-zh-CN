// 生成机甲名本地化 key, 写进 tools/merge-final.mjs 的两个区块:
//   MECH-KEYS     —— 补进 CSV 的 key (理由见 merge-final.mjs 里的注释: 游戏按"英文字符串规范化"查表)
//   MECH-MODELS   —— 哪些英文名是"机甲型号", 在正文里出现时要加双引号 ("海盗旗")
// 用法: node tools/gen-mech-keys.mjs [--write]
import fs from 'node:fs';
import path from 'node:path';
const root = 'C:\\Users\\lxp_0\\Documents\\BTHanHua';
const GAME = 'D:\\MyDownload\\Things\\Steam\\steamapps\\common\\BATTLETECH';
const SA = path.join(GAME, 'BattleTech_Data', 'StreamingAssets', 'data');
// JS 字符串字面量转义: 译文里可能出现单引号或反斜杠 (实测有 "娜塔莎\" 这种),
// 直接拼进 '...' 会生成语法错误的 merge-final.mjs —— 已经因此坏过一次。
const lit = (x) => String(x).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// glossary 里没有的 10 个基础机甲 + 需要一并覆盖的 DLC 机甲 (数据在 asset bundle 里, 磁盘上取不到)
const EXTRA = {
  'Atlas II': '擎天神 II', 'Awesome Dragon': '可畏龙', 'Battlemaster': '战将',
  'Black Widow': '黑寡妇', 'Grand Dragon': '大龙', 'Kingcrab': '帝王蟹',
  "Occam's Missile": '奥卡姆导弹', 'Rhythm Nation': '节奏国度',
  'Target Dummy': '靶标', 'Test Dummy': '测试靶标',
  // DLC 机甲 (Heavy Metal / Urban Warfare / Flashpoint), 取自社区通行译法
  'Assassin': '刺客', 'Javelin': '标枪', 'Annihilator': '歼灭者', 'Bull Shark': '牛鲨',
  'Flea': '跳蚤', 'Hatchetman': '短斧客', 'Phoenix Hawk': '凤凰鹰', 'Rifleman': '步枪手',
  'Vulcan': '火神', 'Wasp': '黄蜂', 'Nightstar': '夜星', 'Charger': '冲锋者',
  'Valkyrie': '女武神', 'Cyclops': '独眼巨人', 'Raven': '渡鸦', 'Warhammer': '战锤', 'Marauder': '掠夺者', 'Crab': '蟹',
  'Archer': '弓箭手', 'BIG STEEL CLAW': '大钢爪',
};
// 变体名不以机甲名开头时, 前缀要单独处理。实测:
//   "SuburbanMech UM-R90"  -> 小都市战甲 UM-R90   (Name = UrbanMech; 与语料里对 UM-R90 的写法一致)
//   "Fire Javelin JVN-10F" -> 标枪 JVN-10F        (用户要求: 所有 JVN 都叫"标枪", 不要"火焰标枪")
//     —— 所以 'Fire ' 【不】放进表里; 表里没有的前缀会被丢掉 (见下面的组装逻辑)。
const UI_PREFIX = [
  ['Sub', '小'], ['Super ', '超级'], ['Grand ', '大'], ['Royal ', '皇家'],
];

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
// 英文 -> 中文: 以 glossary.tsv 为权威 (第一列英文, 之后是中文候选, 取第一个去掉类别标注的写法)。
// 注意不能从 merge-final 的 GLOSSARY-NAMES 区块取 —— 那里只包含"正文里还有残留"的名字,
// 已经翻译干净的名字(如 Atlas/Locust)不在其中。
const glZh = new Map();
for (const L of fs.readFileSync(path.join(root, 'corpus', 'glossary.tsv'), 'utf8').split('\n')) {
  if (!L.trim()) continue;
  const c = L.split('\t').map((s) => s.trim()).filter(Boolean);
  if (c.length < 2) continue;
  // glossary 会把同一个词的多个备选写在【同一格】里用逗号分隔, 例如
  //   Atlas	擎天神，巨神，宇宙神（机甲）
  //   Banshee	女妖，狺女，报丧女妖（机甲）
  //   Quickdraw	迅击，快枪，快拔（机甲）
  // 取整格会把三个备选一起写进 CSV, 机甲库里就显示成"擎天神，巨神，宇宙神" (实测踩到)。
  // 只取第一个。gen-glossary-names.mjs 对这类有 BAD_CHARS 过滤, 机甲这边之前漏了。
  const z = c[1].replace(/（[^）]*）/g, '').split(/[，,、\/]/)[0].trim();
  if (z && !glZh.has(c[0])) glZh.set(c[0], z);
}

// 读基础游戏的 mechdef
const pairs = new Map();
const mechDir = path.join(SA, 'mech');
for (const f of fs.readdirSync(mechDir)) {
  if (!f.endsWith('.json')) continue;
  try {
    const d = JSON.parse(fs.readFileSync(path.join(mechDir, f), 'utf8')).Description || {};
    if (!d.Name) continue;
    if (!pairs.has(d.Name)) pairs.set(d.Name, new Set());
    if (d.UIName) pairs.get(d.Name).add(d.UIName);
  } catch { }
}
// DLC 机甲的 mechdef 不在磁盘上, 而是在 flashpoint/heavymetal/urbanwarfare 这几个 asset bundle 里。
// 用 corpus/font-atlas/extract-dlc-mechs.py (UnityPy) 抽出来存成 JSON, 这里读进来。
const dlcJson = path.join(root, 'corpus', 'font-atlas', 'dlc-mechs.json');
if (fs.existsSync(dlcJson)) {
  const dlc = JSON.parse(fs.readFileSync(dlcJson, 'utf8'));
  for (const v of Object.values(dlc)) {
    if (!v.Name) continue;
    if (!pairs.has(v.Name)) pairs.set(v.Name, new Set());
    if (v.UIName) pairs.get(v.Name).add(v.UIName);
  }
  console.log(`DLC 机甲 mechdef: 读入 ${Object.keys(dlc).length} 个`);
} else {
  console.log('(没有 dlc-mechs.json, DLC 机甲名会缺 —— 跑 corpus/font-atlas/extract-dlc-mechs.py 生成)');
}
// 机甲肖像精灵的文件名 = 机甲的规范化名, 是最完整的机甲方清单 (含所有 DLC 机甲)。
// 用它兜底, 保证不会漏掉某台机甲的 Name key。
const spDir = path.join(GAME, 'BattleTech_Data', 'StreamingAssets', 'sprites', 'MechPortraits');
const spriteKeys = [];
if (fs.existsSync(spDir)) {
  for (const f of fs.readdirSync(spDir)) {
    const m = /^uixTxrIcon_(.+)\.dds$/.exec(f);
    if (m) spriteKeys.push(m[1]);
  }
}
for (const n of Object.keys(EXTRA)) if (!pairs.has(n)) pairs.set(n, new Set());

// 用户人工精修的译名表 (corpus/mech-names-zh.tsv) —— 【优先于】glossary 与 EXTRA。
// 用户要求"不一定逐字翻译, 要符合中文审美", 所以这张表才是权威: 改译名只改这一处。
const userZh = {};
{
  const p = path.join(root, 'corpus', 'mech-names-zh.tsv');
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      if (!line.trim() || line.startsWith('#')) continue;
      const c = line.split('\t');
      if (c.length >= 2 && c[0].trim() && c[1].trim()) userZh[c[0].trim()] = c[1].trim();
    }
    console.log(`用户译名表: 读入 ${Object.keys(userZh).length} 条 (corpus/mech-names-zh.tsv)`);
  } else {
    console.log('(没有 corpus/mech-names-zh.tsv, 回落到 glossary/EXTRA)');
  }
}

const zh = (n) => userZh[norm(n)] || glZh.get(n) || EXTRA[n] || null;
const nameRows = [], uiRows = [], models = [], noZh = [];
for (const n of [...pairs.keys()].sort()) {
  const z = zh(n);
  if (!z) { noZh.push(n); continue; }
  nameRows.push([norm(n), z]);
  models.push(n);
  for (const ui of [...pairs.get(n)].sort()) {
    // 常见情形: "Blackjack BJ-1" = 机甲名 + 变体代号
    // 特殊情形: "Fire Javelin JVN-10F" / "SuburbanMech UM-R90" —— 变体名不是以机甲名开头,
    //   注意游戏数据里大小写不统一 ("SuburbanMech" 的小写 u), 所以匹配必须忽略大小写。
    const at = ui.toLowerCase().indexOf(n.toLowerCase());
    let zhUi, zhBase;
    if (at === 0) {
      zhUi = z + ui.slice(n.length);                        // -> 海盗旗 BJ-1
      zhBase = z;
    } else if (at > 0) {
      const pre = ui.slice(0, at);                          // "Fire " / "Sub"
      // 前缀处理: 表里有的才翻 ("SubUrbanMech" -> 小 + 都市战甲)。
      // 表里【没有】的一律【丢掉】, 绝不能把英文原样留下 ——
      // 实测 "Fire Javelin JVN-10F" 曾被译成"火焰标枪"(用户要求全 JVN 都叫"标枪"),
      // 而如果只是把 'Fire ' 从表里删掉, 会得到 "Fire 标枪 JVN-10F" 这种半英半中的结果。
      let zhPre = '';
      for (const [en, zh2] of UI_PREFIX) {
        if (pre.toLowerCase().startsWith(en.toLowerCase())) { zhPre = zh2 + pre.slice(en.length); break; }
      }
      zhUi = zhPre + z + ui.slice(at + n.length);           // -> 小都市战甲 UM-R90 / 标枪 JVN-10F
      zhBase = zhPre + z;
    } else {
      zhUi = z;                                             // 兜底: 只用机甲名
      zhBase = z;
    }
    uiRows.push([norm(ui), zhUi]);
    // 机甲库提示框里显示的是【去掉尾部代号的名字】("Fire Javelin（JVN-10F）"),
    // 那也是一个独立 key, 不加就会显示英文。只有尾部那个 token 含数字才当作代号。
    const toks = ui.split(' ');
    if (toks.length >= 2 && /[0-9]/.test(toks[toks.length - 1])) {
      const baseKey = norm(toks.slice(0, -1).join(' '));
      if (baseKey !== norm(n)) uiRows.push([baseKey, zhBase]);
    }
  }
}
// ---- 机甲"常备角色" (chassisdef 的 StockRole) ----
// 机甲库提示框里的"常备角色: Juggernaut"就是它。同样是把数据里的英文字符串规范化后当 key 查 CSV,
// 所以缺 key 的角色会显示英文 (实测: 歼灭者的 StockRole 就叫 "Juggernaut", 而 CSV 里只有
// "Juggernaut & Close Assault" 等组合, 没有单独的 juggernaut)。
// key 规范化由实例反推: 小写 + 去空格 + 保留 "&-", 逗号写作 ^ (CSV 的 key 里 ^ 代表逗号)
// 角色的中文译名改由 corpus/stock-role-zh.tsv (用户人工翻译) + tools/gen-role-zh.mjs 接管,
// 这里不再产出角色 key —— 否则会和用户表里的值打架 (例如 juggernaut 曾在这写"重锤机", 用户定为"重装")。
const ROLE_EXTRA = {};
const roleKey = (s) => String(s).toLowerCase().replace(/, /g, '^').replace(/,/g, '^').replace(/ /g, '');
const roleRows = [], roleNoZh = [];
for (const f of ['stock-roles-base.json', 'stock-roles.json']) {
  const p = path.join(root, 'corpus', 'font-atlas', f);
  if (!fs.existsSync(p)) continue;
  for (const v of Object.values(JSON.parse(fs.readFileSync(p, 'utf8')))) {
    if (!v.StockRole) continue;
    const k = roleKey(v.StockRole);
    const z = ROLE_EXTRA[k];
    if (z) roleRows.push([k, z]);
    else roleNoZh.push(v.StockRole);
  }
}
console.log(`角色 key: 需要补 ${roleRows.length} 个${roleRows.length ? ' (' + roleRows.map(([k]) => k).join(', ') + ')' : ''}`);
if (roleNoZh.length) console.log(`  (其余 ${new Set(roleNoZh).size} 种角色的 key 已存在, 无需补)`);
// 只出现在肖像清单里、mechdef 枚举不到的机甲 (变体被单独当成一张肖像图, 例如 Catapult K2)
const SPRITE_ONLY = {
  catapultk2: '弩炮 K2',
};
const covered = new Set(nameRows.map(([k]) => k));
const spriteExtra = [];
for (const k of spriteKeys.sort()) {
  if (covered.has(k)) continue;
  const z = SPRITE_ONLY[k];
  if (z) { nameRows.push([k, z]); covered.add(k); spriteExtra.push(k); }
  else noZh.push('(肖像清单里的 ' + k + ')');
}
if (spriteExtra.length) console.log(`肖像清单补充: ${spriteExtra.join(', ')}`);
nameRows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
uiRows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
const seen = new Set();
const keys = [...nameRows, ...uiRows, ...roleRows].filter(([k]) => !seen.has(k) && seen.add(k));

const keyLines = [];
keyLines.push('    // >>> MECH-KEYS BEGIN (由 tools/gen-mech-keys.mjs 生成, 勿手改)');
keyLines.push(`    // 共 ${keys.length} 条: ${nameRows.length} 个机甲名 + ${uiRows.length} 个变体全名 + ${roleRows.length} 个常备角色`);
for (let i = 0; i < keys.length; i += 3) {
  keyLines.push('    ' + keys.slice(i, i + 3).map(([k, v]) => `['${lit(k)}', '${lit(v)}']`).join(', ') + ',');
}
keyLines.push('    // >>> MECH-KEYS END');

const modelLines = [];
modelLines.push('// >>> MECH-MODELS BEGIN (由 tools/gen-mech-keys.mjs 生成, 勿手改)');
modelLines.push('// 这些是"机甲型号名"; 出现在正文里时按中文习惯加双引号');
modelLines.push('const MECH_MODELS = new Set([');
for (let i = 0; i < models.length; i += 4) {
  modelLines.push('  ' + models.slice(i, i + 4).map((m) => `'${lit(m)}'`).join(', ') + ',');
}
modelLines.push(']);');
modelLines.push('// >>> MECH-MODELS END');
modelLines.push('');
// 正文用的 英文 -> 中文 表。必须由生成器给出, 不能只靠 glossary:
// 例如 Assassin 在 glossary 里没有条目, 只走专名汉化就会漏掉 ("ASN-101 是罕见的 Assassin 改型")。
modelLines.push('// >>> MECH-ZH BEGIN (由 tools/gen-mech-keys.mjs 生成, 勿手改)');
modelLines.push('const MECH_ZH = [');
for (let i = 0; i < nameRows.length; i += 3) {
  const chunk = nameRows.slice(i, i + 3);
  modelLines.push('  ' + chunk.map(([k, v]) => {
    // 用原始英文名而不是规范化 key: 表里要的是可替换的英文串
    const en = [...pairs.keys()].find((x) => norm(x) === k) || k;
    return `['${lit(en)}', '${lit(v)}']`;
  }).join(', ') + ',');
}
modelLines.push('];');
modelLines.push('// >>> MECH-ZH END');

console.log(`机甲名 ${nameRows.length} 个, 变体全名 ${uiRows.length} 个, 合计 key ${keys.length} 条`);
console.log(`未找到中文译名的: ${noZh.length ? noZh.join(', ') : '(无)'}`);
if (process.argv.includes('--write')) {
  let s = src;
  s = s.replace(/ {4}\/\/ >>> MECH-KEYS BEGIN[\s\S]*?\/\/ >>> MECH-KEYS END/, keyLines.join('\n'));
  s = s.replace(/\/\/ >>> MECH-MODELS BEGIN[\s\S]*?\/\/ >>> MECH-ZH END/, modelLines.join('\n'));
  // 保险: 源文件读空或写回后异常变短时拒绝写入。
  // (曾经因为某次读到空文件又把空内容写回去, 把 merge-final.mjs 整个清成 0 字节)
  if (src.length < 10000 || s.length < src.length * 0.8) {
    console.error(`!! 拒绝写入: 源 ${src.length} 字节 -> 结果 ${s.length} 字节, 疑似异常`);
    process.exit(1);
  }
  writeAtomic(mf, s);
  console.log(`已写入 ${mf}`);
} else {
  console.log('(未加 --write) 预览:');
  console.log(keyLines.slice(0, 5).join('\n'));
  console.log(modelLines.slice(0, 4).join('\n'));
}
