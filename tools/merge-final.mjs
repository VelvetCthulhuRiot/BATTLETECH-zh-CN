// 最终合并: 官方KEY + 多源中文译文 -> 游戏可用 strings_zh-CN.csv
// 关键修正: repo CSV 必须按"行内第一个逗号"解析 (官方格式保证 KEY 内无半角逗号, 且文件含未配对引号)
import fs from 'node:fs';
import path from 'node:path';

const GAME = process.env.BT_GAME || 'D:\\MyDownload\\Things\\Steam\\steamapps\\common\\BATTLETECH';
const LOC = path.join(GAME, 'BattleTech_Data', 'StreamingAssets', 'data', 'localization');
const GH = 'C:\\Users\\lxp_0\\Documents\\BTHanHua\\incoming\\gh';
const PROJ = 'C:\\Users\\lxp_0\\Documents\\BTHanHua';
// --natural: 不做"字形约束"替换(逐字替换/整词修正/界面串重写), 用自然措辞;
//            适用于全字库成功、字体不再缺字的情况
const NATURAL = process.argv.includes('--natural');

// ---- 基础解析: 行内第一个逗号 ----
function lineMap(file) {
  const m = new Map();
  const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
  for (let n = 1; n < lines.length; n++) {   // 跳过表头 "KEY,xx-XX"
    const L = lines[n];
    const i = L.indexOf(',');
    if (i <= 0) continue;
    const k = L.slice(0, i);
    if (!m.has(k)) m.set(k, L.slice(i + 1));
  }
  return m;
}
function jsonMap(file) {
  const m = new Map();
  const o = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const k of Object.keys(o)) {
    const nk = k.replace(/\[\d+\]$/, '');
    const v = o[k];
    if (v && String(v).trim() && !m.has(nk)) m.set(nk, String(v));
  }
  return m;
}

const de = lineMap(path.join(LOC, 'strings_de-DE.csv'));
const keyOrder = [...de.keys()];
const authSet = new Set(keyOrder);
console.log(`官方 KEY: ${keyOrder.length}`);

// ---- 各来源 ----
const paratranz = jsonMap(path.join(GH, 'pre-data__battletech-zh_Hans__battletech__main__BATTLETECH__translation-zh_Hans.json'));
const repoCsv = lineMap(path.join(GH, 'pre-data__localization__strings_zh-CN.csv'));
const mtCache = new Map();
for (const f of ['translatedObj.json', 'translatedObj-bing.json']) {
  try { for (const [k, v] of jsonMap2(path.join(GH, f))) mtCache.set(k, v); } catch { }
}
function jsonMap2(file) { const o = JSON.parse(fs.readFileSync(file, 'utf8')); return Object.entries(o).filter(([, v]) => v && String(v).trim()); }
const gapLLM = new Map();
{
  const dir = path.join(PROJ, 'corpus', 'zh-gap');
  for (const f of fs.readdirSync(dir)) {
    if (!/^out\d+\.jsonl$/.test(f)) continue;
    for (const L of fs.readFileSync(path.join(dir, f), 'utf8').replace(/^\uFEFF/, '').split('\n')) {
      if (!L.trim()) continue;
      const o = JSON.parse(L);
      if (o.zh && String(o.zh).trim()) gapLLM.set(o.key, String(o.zh));
    }
  }
}
const nonEmpty = m => new Map([...m].filter(([, v]) => v && String(v).trim()));
console.log(`来源(非空): paratranz=${nonEmpty(paratranz).size}  gapLLM=${gapLLM.size}  repoCsv(行内解析)=${nonEmpty(repoCsv).size}  mtCache=${mtCache.size}`);

// ---- 占位符规范化: 以官方德语里的写法为准 ----
const canonTok = t => t.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
function tokens(s) {
  const out = [];
  const re = /\{[^}]*\}|\[[^\[\]]*\]/g;
  let m; while ((m = re.exec(s)) !== null) out.push(m[0]);
  return out;
}
function canonicalize(zh, deVal) {
  if (!deVal || !zh) return zh;
  const map = new Map();
  for (const t of tokens(deVal)) { const c = canonTok(t); if (c && !map.has(c)) map.set(c, t); }
  return zh.replace(/\{[^}]*\}|\[[^\[\]]*\]/g, t => {
    const c = canonTok(t);
    return (c && map.has(c)) ? map.get(c) : t;
  });
}

// ---- 合并 ----
const merged = new Map();
const srcOf = new Map();
for (const k of keyOrder) {
  let v = null, src = '';
  if (nonEmpty(paratranz).has(k)) { v = paratranz.get(k); src = 'paratranz'; }
  else if (gapLLM.has(k)) { v = gapLLM.get(k); src = 'gapLLM'; }
  else if (nonEmpty(repoCsv).has(k)) { v = repoCsv.get(k); src = 'repoCsv'; }
  else if (mtCache.has(k)) { v = mtCache.get(k); src = 'mtCache'; }
  if (!v) continue;
  merged.set(k, canonicalize(v, de.get(k)));
  srcOf.set(k, src);
}
const counts = {};
for (const s of srcOf.values()) counts[s] = (counts[s] || 0) + 1;
console.log(`\n合并后: ${merged.size} / ${keyOrder.length} = ${(merged.size / keyOrder.length * 100).toFixed(1)}%`);
console.log('  来源分布: ' + JSON.stringify(counts));

// ---- 字形替代: 图集外的字会显示成方框 ----
// 映射来源: (a) 固定表(非汉字) (b) 子代理生成的"缺字->替代写法"表 corpus/zh-glyph/out*.jsonl
// --natural 模式: 改用【新离线图集的覆盖表】做基准 (8354 字), 于是"图集外"基本为空集 ——
//   既不再做逐字替换, 又保留了"有图集外残留就报错退出"的安全网。
const ATLAS_FILE = NATURAL
  ? path.join(PROJ, 'corpus', 'font-atlas', 'charset.txt')
  : path.join(PROJ, 'corpus', 'glyph-covered.txt');
const ATLAS = new Set([...fs.readFileSync(ATLAS_FILE, 'utf8').replace(/\s/g, '')]);
console.log(`图集基准: ${path.basename(ATLAS_FILE)} (${ATLAS.size} 字)${NATURAL ? '  [--natural]' : ''}`);

// 与 build-atlas.py / AtlasFont.cs 同口径: 控制符(Cc)/格式符(Cf)/未分配(Cn)/代理(Cs)/
// 私用(Co)/分隔符(Z*) 都不需要字形, 不该被当成"图集外残留"。
// 典型: U+001F 官方逗号替身、U+200B 零宽空格、U+3000 全角空格。
function needsGlyph(ch) {
  return !/[\p{Cc}\p{Cf}\p{Cn}\p{Cs}\p{Co}\p{Zs}\p{Zl}\p{Zp}]/u.test(ch);
}

const glyphMap = new Map([['¢', ''], ['ö', 'o'], ['ä', 'a'], ['ü', 'u'], ['è', 'e'], ['™', 'TM'], ['–', '-'], ['©', '(C)'], ['＃', '#'], ['【', '['], ['】', ']'], ['［', '['], ['］', ']'],
  // 图集外的高频"漏网"字: 子代理改写时容易带进来, 在这里兜底 (值可以是多字)
  ['唉', '啊'], ['哟', '啊'], ['嗬', '哈'], ['梗', '阻'], ['燕', '鸟'], ['翱', '飞'], ['绚', '华'], ['鲯', '鬼头'], ['鳅', '刀'],
  ['丫', '女'], ['悍', '猛'], ['玄', '秘'], ['侥', '幸'], ['钝', '笨'], ['诲', '教'], ['梁', '柱'],
]);
{
  const gdir = path.join(PROJ, 'corpus', 'zh-glyph');
  if (fs.existsSync(gdir)) {
    for (const f of fs.readdirSync(gdir)) {
      if (!/^out\d+\.jsonl$/.test(f)) continue;
      for (const L of fs.readFileSync(path.join(gdir, f), 'utf8').replace(/^\uFEFF/, '').split('\n')) {
        if (!L.trim()) continue;
        try { const o = JSON.parse(L); if (o.char && typeof o.repl === 'string') glyphMap.set(o.char, o.repl); } catch { }
      }
    }
  }
}
let fixGlyph = 0;
if (NATURAL) { console.log('字形替代: 已跳过 (--natural 模式, 由全字库承担字形覆盖)'); }
else
for (const [k, v0] of merged) {
  let v = v0, changed = false;
  for (const [from, to] of glyphMap) { if (v.indexOf(from) >= 0) { v = v.split(from).join(to); changed = true; } }
  if (changed) { merged.set(k, v); fixGlyph++; }
}
console.log(`字形替代: ${fixGlyph} 条 (映射表 ${glyphMap.size} 项)`);

// ---- 整词修正: 逐字替换会造出不成立的词, 这里按"词"纠正 (替代词均已核对在白名单内) ----
const wordFix = new Map([
  ['响谢', '致谢'],            // credits: 鸣不可用 -> 响谢 不成立
  ['固若金唐', '固若金城'],      // Bulwark 成语
  ['水利维亚', '波利维亚'],      // 玻利维亚
  ['户从', '随从'],            // 扈从
  ['时间流失', '时间推移'],      // 流逝
  ['血染盘地', '血染山谷'],      // 盆地
  ['抗泡病药物', '抗病毒药物'],   // 抗疱疹药物
  ['安归拉', '安奎拉'],         // 安圭拉
  ['曲光', '电光'],            // 弧光
]);
let fixWord = 0;
if (NATURAL) { console.log('整词修正: 已跳过 (--natural 模式)'); }
else
for (const [k, v0] of merged) {
  let v = v0, ch = false;
  for (const [from, to] of wordFix) { if (v.indexOf(from) >= 0) { v = v.split(from).join(to); ch = true; } }
  if (ch) { merged.set(k, v); fixWord++; }
}
if (!NATURAL) console.log(`整词修正: ${fixWord} 条`);

// ---- 按 key 定点修正: 短缩写 key 被"德语->中文"机翻当普通单词译错了 ----
// 例: st(缩写 ST) 被当成 St.(Saint) 译成"圣" -> 机甲图标徽标上顶着"圣";
//     alt/esc 是按键名, 德语 alt(老)/ESC 被直译成"老"/"电调"; dmg(德语 SCH.=Schaden) 译出坏值
const keyFix = new Map([
  ['st', 'ST'],        // 官方 de/fr/ru 都保留缩写 (St/ST/Ст)
  ['alt', 'Alt'],
  ['esc', 'Esc'],
  ['dmg', '伤害'],
  // 数字/格式模式类: 它们的 "," 是 .NET 格式符, 不能丢。CSV 里禁半角逗号,
  // 所以花括号内的逗号写成全角，由 mod 在运行期换回半角(见 FontMod.FixFormatSpecifiers)。
  ['{0:0^^*00}m', '{0:0，，.00}M'],
  ['{0}{1:n2}m', '{0}{1:N2}M'],      // 原译把单位 m(million) 误译成"分"
  ['0^^*00m', '0，，.00M'],           // 机甲卡片造价用的是这个裸模式, 运行期换回半角 -> 9.54M
  ['0^^*0m', '0，，.0M'],
  ['xxx*xxm', 'XXX.XX 百万'],
]);
let fixKey = 0;
for (const [k, to] of keyFix) if (merged.has(k)) { merged.set(k, to); fixKey++; }
console.log(`缩写 key 定点修正: ${fixKey} 条`);

// ---- 短缩写 key 精修 (子代理逐条校对: 修的是"缩写被当单词直译"这类真实错译, 与字体约束无关) ----
const keyPolish = new Map();
{
  const d = path.join(PROJ, 'corpus', 'zh-short');
  if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) {
    if (!/^out\d+\.jsonl$/.test(f)) continue;
    for (const L of fs.readFileSync(path.join(d, f), 'utf8').replace(/^\uFEFF/, '').split('\n')) {
      if (!L.trim()) continue;
      try { const o = JSON.parse(L); if (o.key && typeof o.zh === 'string' && o.zh.trim()) keyPolish.set(o.key, o.zh.trim()); } catch { }
    }
  }
}
let fixPolish = 0;
for (const [k, v] of keyPolish) if (merged.has(k) && merged.get(k) !== v) { merged.set(k, v); fixPolish++; }
console.log(`短缩写 key 精修: ${fixPolish} 条 (来源 ${keyPolish.size} 项)`);

// ---- 用词精修 (子代理逐条校对机翻来源的界面串; 值已保证在白名单内) ----
const polishFix = new Map();
{
  const d = path.join(PROJ, 'corpus', 'zh-polish');
  if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) {
    if (!/out\d+\.jsonl$/.test(f)) continue;   // out1.jsonl / b2out1.jsonl / b3out1.jsonl / dlout1.jsonl
    for (const L of fs.readFileSync(path.join(d, f), 'utf8').replace(/^\uFEFF/, '').split('\n')) {
      if (!L.trim()) continue;
      try { const o = JSON.parse(L); if (o.key && typeof o.zh === 'string' && o.zh.trim()) polishFix.set(o.key, o.zh.trim()); } catch { }
    }
  }
}
let fixPl = 0;
for (const [k, v] of polishFix) if (merged.has(k) && merged.get(k) !== v) { merged.set(k, v); fixPl++; }
console.log(`用词精修: ${fixPl} 条 (来源 ${polishFix.size} 项)`);

// ---- 跨分片交叉修正 (各分片代理互相指出的漏改; 恒定覆盖 polishFix, 与文件读取顺序无关) ----
{
  const XREF = [
    ['np*', '小键盘.'],        // de "ZB ." = Ziffernblock; 同族 np0-9/nprtn 已作"小键盘N"
    ['tag+', 'TAG +'],         // out2 误留德语缩写 "ZEA"
  ];
  let n = 0;
  for (const [k, v] of XREF) if (merged.has(k) && merged.get(k) !== v) { merged.set(k, v); n++; }
  console.log(`跨分片交叉修正: ${n} 条`);
}

// ---- 受字形约束影响的短界面串整句重写 (仅在 !NATURAL 时有意义) ----
if (NATURAL) { console.log('界面串重写: 已跳过 (--natural 模式)'); }
else {
  const d = path.join(PROJ, 'corpus', 'zh-rewrite');
  let fixRw = 0;
  if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) {
    if (!/^out\d+\.jsonl$/.test(f)) continue;
    for (const L of fs.readFileSync(path.join(d, f), 'utf8').replace(/^\uFEFF/, '').split('\n')) {
      if (!L.trim()) continue;
      try { const o = JSON.parse(L); if (o.key && typeof o.zh === 'string' && o.zh.trim() && merged.has(o.key)) { merged.set(o.key, o.zh.trim()); fixRw++; } } catch { }
    }
  }
  console.log(`界面串整句重写: ${fixRw} 条`);
}


// ---- 一致性修正 ----
// 官方 de-DE 的 [[...]] 用 U+001F 作 ref/display 分隔符 (实测 1082 处), 缺失/写错会让游戏显示错误标记
const US = '\u001f';
let spanFixed = 0, spanBad = 0;
const spanBadSamples = [];
function fixSpan(span) {
  const inner = span.slice(2, -2);
  // 找引用边界: 内层方括号深度回到 0 的位置 (ref 形如 DM.Xxx[Id] / COMPANY.X.Y[...] / RES_MECH)
  let depth = 0, end = -1;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth <= 0) { end = i + 1; break; } }
  }
  if (end < 0) {
    // 没有内层 [] -> 整段当引用, 无显示文本
    spanFixed++;
    return '[[' + inner.replace(/,/g, '，').replace(/[ \t]+/g, ' ').trim() + ']]';
  }
  const ref = inner.slice(0, end).replace(/\s+/g, '');
  let rest = inner.slice(end).replace(/^[\s\u001f,，]+/, '');
  rest = rest.replace(/[\r\n]+/g, ' ').replace(/,/g, '，').trim();
  spanFixed++;
  return rest ? '[[' + ref + US + rest + ']]' : '[[' + ref + ']]';
}

let fixDrop = 0, fixCoin = 0, fixThousand = 0, fixComma = 0, fixQuote = 0, fixCRLF = 0;
for (const [k, v0] of merged) {
  let v = v0;
  if (/dropship/i.test(k) && v.includes('运输舰')) { v = v.split('运输舰').join('空投艇'); fixDrop++; }
  if (v.includes('C钞') || v.includes('C 钞')) { v = v.split('C钞').join('星币').split('C 钞').join('星币'); fixCoin++; }
  const m = /(\d+)\^000/.exec(k);
  if (m) { const bare = m[1] + '000', grp = m[1] + '，000'; if (v.includes(bare) && !v.includes(grp)) { v = v.split(bare).join(grp); fixThousand++; } }

  // A) 用深度扫描摘出 [[...]] 标记 (支持嵌套), 单独修, 免得被逗号转换破坏
  const stash = [];
  {
    let res = '', i = 0;
    while (i < v.length) {
      if (v[i] === '[' && v[i + 1] === '[') {
        let d = 0, j = i, closed = false;
        while (j < v.length) {
          if (v[j] === '[') d++;
          else if (v[j] === ']') { d--; if (d === 0) { closed = true; break; } }
          j++;
        }
        if (closed) {
          const span = v.slice(i, j + 1);
          // 外层 span 里还有内层 [[ -> 嵌套标记本身合法, 只保护它不被逗号转换破坏, 不改写
          stash.push(span.slice(2, -2).includes('[[') ? span : fixSpan(span));
          res += '\u0002' + (stash.length - 1) + '\u0002';
          i = j + 1;
          continue;
        }
        // 未闭合的 [[ -> 结构残缺, 原样保留并报出来
        spanBad++;
        if (spanBadSamples.length < 12) spanBadSamples.push(v.slice(Math.max(0, i - 20), i + 60));
      }
      res += v[i]; i++;
    }
    v = res;
  }
  // B) 标记以外的半角逗号 / 官方逗号替身 U+001F -> 全角逗号 (中文排版更好; U+001F 在游戏里只渲染成空格)
  if (v.indexOf(',') >= 0 || v.indexOf(US) >= 0) { v = v.split(',').join('，').split(US).join('，'); fixComma++; }
  // C) 还原标记
  v = v.replace(/\u0002(\d+)\u0002/g, (all, i) => stash[+i]);
  // D) 换行与控制字符清洗 (但 U+001F 要保留! 它是官方分隔符)
  v = v.replace(/\r?\n/g, '\\n').replace(/\r/g, '\\n');
  // D2) 字面转义序列 \r\n / \r -> \n (官方 de-DE: 字面 \n 3425 行, \r\n 仅 4 行; 我们曾从 repoCsv 带进 277 行 \r\n)
  if (v.indexOf('\\r') >= 0) { v = v.replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n'); fixCRLF++; }
  v = v.replace(/\\u001f/g, US);                                   // 子代理写的字面转义 -> 真分隔符
  v = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001E]/g, ' ');  // 不含 U+001F
  // E) 按官方 de-DE 约定转义半角双引号: 一个逻辑引号在文件里写 2 个。
  //    子代理有的交回"逻辑层"单引号, 有的交回"已转义"的 2 连, 还有的被多次转义成 4/6/8 连。
  //    官方 de/fr/ru 的引号连续段最长只有 2, 所以: 先把 >=3 连收敛成 2 连, 再把孤立单引号转义成 2 连。
  //    两种来源都收敛到同一个正确结果, 也不会像原来那样每重建一次就翻一倍。
  if (v.indexOf('"') >= 0) {
    v = v.replace(/"{3,}/g, '""').replace(/(?<!")"(?!")/g, '""');
    fixQuote++;
  }
  merged.set(k, v);
}
console.log(`一致性修正: DropShip→空投艇 ${fixDrop}, C钞→星币 ${fixCoin}, 千位分隔 ${fixThousand}, 半角逗号→全角 ${fixComma}, 引号转义 ${fixQuote}, \\r\\n→\\n ${fixCRLF}`);

// ---- 术语统一: 各分片代理各自统一过一遍, 口径不一; 此处按 glossary.tsv 收敛到唯一写法 ----
{
  // 专有名词/术语: 无论上下文都只有一个正确写法 -> 无条件替换
  const FLAT = [
    ['戴维恩', '达维恩'], ['斯坦纳', '施泰纳'], ['史坦纳', '施泰纳'],
    ['大流士', '达吕斯'], ['达里乌斯', '达吕斯'],
    ['苏米尔', '纯丽'], ['须美', '纯丽'],
    ['麻理子', '马里科'], ['真理子', '马里科'],
    ['森瑞拉', '琴特雷拉'], ['森雷拉', '琴特雷拉'], ['琴特蕾拉', '琴特雷拉'],
    ['翡翠晨光', '翡翠曙光'], ['翡翠黎明', '翡翠曙光'],   // glossary: Emerald Dawn=翡翠曙光
                                                          // (旧版因"曙"不在字形图集内才写成"黎明"; 新图集已含"曙", 改回 glossary 写法)
    ['跳跃船', '远航舰'], ['跳船', '远航舰'],              // glossary/语料主流写法: JumpShip=远航舰 (45 条), 这几条是漏网的
    ['洛城科技', '失落技术'], ['洛斯科技', '失落技术'], ['乐斯泰科技', '失落技术'],
    ['机甲湾', '机甲库'],
    ['疏散区', '撤离区'],
    ['炮塔', '炮台'],           // glossary: Turret=炮台
    ['传感器', '感应器'],        // glossary: Sensor Lock=感应器锁定
    ['小冲突', '遭遇战'],        // glossary: Skirmish=遭遇战
    ['守护山口', '山口守护'], ['山口修明', '山口守护'], ['山口修武', '山口守护'],
    ['运输舰', '空投艇'], ['登陆舰', '空投艇'], ['空降船', '空投艇'],   // glossary: DropShip=空投艇
    ['辽氏', '廖氏'], ['辽国', '廖氏'],
    ['东事会', '理事会'],            // glossary: Directorate=理事会
    ['科罗莫迪尔', '科罗摩迪尔'],      // glossary: Coromodir=科罗摩迪尔
    ['钢铁野兽', '钢铁猛兽'],        // glossary: Steel Beast=钢铁猛兽
    ['天琴联邦', '天琴共和国'],
    ['卡佩兰斯', '御夫星人'],
  ];
  // 同一个词有正当的其它含义 -> 只在 key 能确认语境时才替换
  const KEYED = [
    [/lance/i, [['长枪', '小队'], ['兰斯', '小队']]],                       // glossary: lance=小队
    [/capellan/i, [['卡佩拉', '御夫星'], ['卡佩兰', '御夫星'], ['御夫座', '御夫星']]], // glossary: Capellan=御夫星
    [/contract/i, [['订单', '合约']]],
    [/salvage/i, [['废料', '战利品']]],
    [/xo|executive/i, [['执行官', '副舰长'], ['副驾驶', '副舰长']]],         // glossary: XO=副舰长
  ];
  const hits = new Map();
  for (const [k, v0] of merged) {
    let v = v0;
    const bump = (from, to) => {
      if (!v.includes(from)) return;
      const n = v.split(from).length - 1;
      v = v.split(from).join(to);
      const key = `${from}→${to}`;
      hits.set(key, (hits.get(key) || 0) + n);
    };
    for (const [from, to] of FLAT) bump(from, to);
    for (const [re, list] of KEYED) if (re.test(k)) for (const [from, to] of list) bump(from, to);
    if (v !== v0) merged.set(k, v);
  }
  const total = [...hits.values()].reduce((a, b) => a + b, 0);
  console.log(`术语统一: ${total} 处`);
  if (total) console.log('   ' + [...hits.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join(', '));
}
console.log(`[[...]] 标记: 修正分隔符 ${spanFixed} 个, 结构不认识 ${spanBad} 个`);
for (const s of spanBadSamples) console.log('   结构不认识: ' + s);

// ---- 被译坏的占位符: 变量名/字段名被当成普通单词翻译, 运行时取不到值 (玩家会直接看到花括号) ----
// 放在"可疑错位检测"之前, 这样占位符缺失报告才反映真实剩余量。
{
  const BADPH = [
    ['{TGT_MW。呼号}', '{TGT_MW.Callsign}'],                       // 句点被写成全角 + Callsign 被译成"呼号"
    ['{TGT_MW.呼号}', '{TGT_MW.Callsign}'],
    ['{TGT_SYSTEM。OwnerDef.ShortName}', '{TGT_SYSTEM.OwnerDef.ShortName}'],
    ['DM.BaseDescriptionDefs [', 'DM.BaseDescriptionDefs['],          // 引用键里被插了空格 (与官方 de-DE 逐字对齐)
  ];
  let n = 0;
  for (const [k, v0] of merged) {
    let v = v0, ch = false;
    for (const [from, to] of BADPH) if (v.includes(from)) { v = v.split(from).join(to); ch = true; }
    if (ch) { merged.set(k, v); n++; }
  }
  console.log(`损坏占位符修复: ${n} 条`);
}

// ---- 可疑错位检测: 只看真正的变量占位符 {...} (德语里的 [Rauschen] 之类是音效标注, 不算) ----
function varToks(s) { const out = []; const re = /\{[^}]*\}/g; let m; while ((m = re.exec(s)) !== null) out.push(m[0]); return out; }
const suspect = [];
for (const [k, v] of merged) {
  const d = de.get(k); if (!d) continue;
  const dTok = new Set(varToks(d).map(canonTok).filter(Boolean));
  const vTok = new Set(varToks(v).map(canonTok).filter(Boolean));
  const missing = [...dTok].filter(t => !vTok.has(t));
  if (missing.length) suspect.push([k, missing.slice(0, 3).join(','), srcOf.get(k)]);
}
console.log(`\n可疑条目 (德语变量占位符 {...} 在中文里缺失): ${suspect.length}`);
const byS = {};
for (const [, , s] of suspect) byS[s] = (byS[s] || 0) + 1;
console.log('  按来源: ' + JSON.stringify(byS));
for (const [k, m, s] of suspect.slice(0, 12)) console.log(`    [${s}] ${k.slice(0, 55)}  缺 ${m}`);

// ---- 专名汉化: 各分片对"拉丁原名 vs 音译"判断不一 (同一文件里 Argo 260 处拉丁 / Sumire 132 处), 按 glossary 收敛 ----
// 只在 {...} 占位符与 <...> 富文本标签之外替换, 并用词边界, 所以 faction_Davion / LoreArgo / ArgoUpgrade 这类不会被误伤。
{
  const NAMES = [
    // 多词专名要先于单词专名处理 (按长度倒序即可)
    ['Kell Hounds', '凯尔猎犬'], ['Sumire Meyer', '纯丽·梅耶尔'], ['Darius Oliveira', '达吕斯·奥利维拉'],
    ['Kamea Arano', '卡梅娅·阿拉诺'], ['Yang Virtanen', '杨·维尔塔宁'], ['Arano Restoration', '阿拉诺光复运动'],
    ['Baumann Group', '鲍曼犯罪集团'], ['Victoria Espinosa', '维多利亚·埃斯皮诺萨'],
    ['Argo', '阿尔戈号'], ['Sumire', '纯丽'], ['Farah', '法拉赫'], ['Murad', '穆拉德'],
    ['Kamea', '卡梅娅'], ['Yang', '杨'], ['Dobrev', '多布雷夫号'], ['Darius', '达吕斯'],
    ['Espinosa', '埃斯皮诺萨'], ['Karosas', '卡罗萨斯'], ['Madeira', '马德拉'], ['Arano', '阿拉诺'],
    ['Centrella', '琴特雷拉'], ['Kurita', '栗田'], ['Davion', '达维恩'], ['Liao', '廖'],
    ['Steiner', '施泰纳'], ['Marik', '马里克'], ['Solaris', '索拉里斯'], ['Cunningham', '坎宁安'],
    ['Baumann', '鲍曼'], ['Coromodir', '科罗摩迪尔'], ['Panzyr', '潘济尔'], ['Weldry', '韦尔德里'],
    ['Itrom', '伊特罗姆'], ['Ostergaard', '奥斯特加德'], ['Carlyle', '卡莱尔'], ['Kell', '凯尔'],
    ['Victoria', '维多利亚'], ['Santiago', '圣地亚哥'], ['Smithon', '史密森'], ['Tyrlon', '蒂拉隆'],
    ['Virtanen', '维尔塔宁'], ['Erin', '埃林'], ['Leopard', '豹级'],
  ].sort((a, b) => b[0].length - a[0].length);
  const usable = NAMES.filter(([, zh]) => ![...zh].some(c => c.codePointAt(0) >= 128 && !ATLAS.has(c)));
  const dropped = NAMES.filter(([en]) => !usable.some(([e]) => e === en)).map(([en, zh]) => `${en}→${zh}`);
  if (dropped.length) console.log(`  (术语表译名含图集外汉字, 已跳过: ${dropped.join(', ')})`);
  const hits = new Map();
  let rows = 0;
  for (const [k, v0] of merged) {
    const stash = [];
    // 占位符 {...} 与富文本标签 <...> 原样抽出, 绝不替换其中的内容
    let v = v0.replace(/\{[\s\S]*?\}|<[^>]*>/g, m => { stash.push(m); return '\u0003' + (stash.length - 1) + '\u0003'; });
    let ch = false;
    for (const [en, zh] of usable) {
      const re = new RegExp('\\b' + en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
      const c = (v.match(re) || []).length;
      if (c) { v = v.replace(re, zh); hits.set(`${en}→${zh}`, (hits.get(`${en}→${zh}`) || 0) + c); ch = true; }
    }
    if (ch) { merged.set(k, v.replace(/\u0003(\d+)\u0003/g, (a, i) => stash[+i])); rows++; }
  }
  const total = [...hits.values()].reduce((a, b) => a + b, 0);
  console.log(`专名汉化: ${rows} 行 / ${total} 处`);
  if (total) console.log('   ' + [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, n]) => `${k}×${n}`).join(', '));
}

// ---- 性别变体占位符里的英文/德文分支值: 中文没有动词变位, 这些分支在中文里要么相同要么该删除 ----
// 子代理被要求"占位符逐字照抄 de", 于是把 Er/Sie、are/is、nods 这类词原样搬进来了, 玩家会直接看到外文。
{
  const GENDER = [
    // 主语代词: 保留 ?| 结构, 只把显示值换成中文
    ['{TGT_MW.Gender?NonBinary:Man|Male:Er|Female:Sie}',
      '{TGT_MW.Gender?NonBinary:此人|Male:他|Female:她}'],
    ['{TGT_MW.Gender?Male:ist er wie ein Bruder|Female:ist sie wie eine Schwester}',
      '{TGT_MW.Gender?Male:他就像兄弟一样|Female:她就像姐妹一样}'],
    ['{TGT_MW.Gender?NonBinary:nod|Default:nods}',
      '{TGT_MW.Gender?NonBinary:点了点|Default:点了点}'],
    // 动词变位 (are/is, re/s): 中文没有形态变化, 整段删掉才通顺
    ['{TGT_MW.Gender?NonBinary:are|Default:is}', ''],
    ['{SCN_MW.Gender?NonBinary:re|Default:s}', ''],
  ];
  let n = 0;
  for (const [k, v0] of merged) {
    let v = v0, ch = false;
    for (const [from, to] of GENDER) if (v.includes(from)) { v = v.split(from).join(to); ch = true; }
    if (ch) { merged.set(k, v); n++; }
  }
  console.log(`性别变体分支中文化: ${n} 条`);
}

// ---- 最终字形安全网: 上面的"用词精修/整句重写/术语统一"会引入新的汉字, 而图集只有 2615 个字形 ----
// 在这里再跑一次替换表兜底, 然后硬性扫描: 只要还剩图集外的字符就报出来并以非 0 退出, 绝不静默发出方块字。
{
  // 逐字兜底会造出不成立的词, 这里先按"词"修正这几处 (替代词均已核对在白名单内)
  const STRAY = [
    ['作梗', '阻挠'], ['鲯鳅', '鬼头刀'], ['翱行', '飞行'], ['绚丽的', '华丽的'], ['盾燕', '盾鸟'],
    ['傻丫头', '傻姑娘'], ['强悍', '强健'], ['凶悍', '凶猛'], ['玄机', '内情'], ['侥幸', '运气'],
    ['迟钝', '笨'], ['教诲', '教导'], ['跳梁小丑', '小丑'],
  ];
  let sw = 0;
  if (NATURAL) {
    // 逐字兜底不跑了, 这些"为兜底造出的怪词"做的词级修正也就没必要了
    console.log('   (词级兜底: 已跳过 --natural)');
  } else {
    for (const [k, v0] of merged) {
      let v = v0, ch = false;
      for (const [from, to] of STRAY) if (v.includes(from)) { v = v.split(from).join(to); ch = true; }
      if (ch) { merged.set(k, v); sw++; }
    }
  }
  if (sw) console.log(`   (词级兜底替换 ${sw} 条)`);
  let net = 0;
  if (NATURAL) {
    console.log('   (逐字兜底: 已跳过 --natural, 由新图集承担)');
  } else {
    for (const [k, v0] of merged) {
      let v = v0, changed = false;
      for (const [from, to] of glyphMap) if (v.indexOf(from) >= 0) { v = v.split(from).join(to); changed = true; }
      if (changed) { merged.set(k, v); net++; }
    }
  }
  const stray = new Map(), rows = [];
  for (const [k, v] of merged) {
    const bad = new Set();
    for (const ch of v) { const cp = ch.codePointAt(0); if (cp < 128 || cp === 0x1f || ATLAS.has(ch) || !needsGlyph(ch)) continue; bad.add(ch); }
    if (bad.size) { rows.push(k); for (const c of bad) stray.set(c, (stray.get(c) || 0) + 1); }
  }
  console.log(`字形安全网: 兜底替换 ${net} 条; 图集外残留 ${rows.length} 行 / ${stray.size} 种字符`);
  if (rows.length) {
    console.log('   !! 图集外字符: ' + [...stray.entries()].map(([c, n]) => `${c}(${n})`).join(' ') + ' — 需补进 zh-glyph 映射表');
    console.log('   !! 涉及 key: ' + rows.slice(0, 10).join(', '));
    fs.writeFileSync(path.join(PROJ, 'corpus', 'glyph-stray.jsonl'),
      rows.map(k => JSON.stringify({ key: k, zh: merged.get(k), bad: [...new Set([...merged.get(k)].filter(c => c.codePointAt(0) >= 128 && c.codePointAt(0) !== 0x1f && !ATLAS.has(c)))] })).join('\n') + '\n', 'utf8');
    process.exitCode = 1;
  }
}

// ---- 定点覆盖: 按 key 精确落到最终值上 (不受任何子代理产物影响) ----
// 依据均来自官方 de/fr/ru 的写法, 见 tools/qa-*.mjs 的分析。
{
  const US = '\u001f';
  const EXACT = new Map([
    // 机甲命中部位标签: 官方 de=K(Kopf) fr=T(Tête) ru=Г(голова), 同族 ct/lt/rt/la/ra/ll/rl 已是中文, 只有 h 漏了
    ['h', '头部'],
    // 数字格式模式: 官方三语都把逗号写成 U+001F(游戏载入时会还原成真逗号),
    // .NET 的 "0,,.00M" 表示"除以 10^6" => 2160000 显示成 2.16M。
    // 我们原先写全角逗号, .NET 只当成普通字符, 于是输出 "2160000，，.00M" 这种一长串数字。
    ['0^^*00m', `0${US}${US}.00M`],
    ['0^^*0m', `0${US}${US}.0M`],
    // 子代理把这两条"xx.xx 百万"直接展开成了 8 位整数 (55990000 / 99990000), 与同族 99*99m("99.99 百万") 不一致
    ['¢55*99m', '55.99 百万'],
    ['¢99*99m', '99.99 百万'],
    // 官方德语是 999.999 (带千位分隔), 我们漏了分隔符
    ['gamesshown:999^999', '显示的游戏：<color=#D7D7D7FF>999，999</color>'],
    // 同样是 .NET 数字格式: 官方 de "00<US>000 M" (逗号=千位分隔), 我们写成了小数点 "00.000 米" (会被当成小数)
    ['00*000m', `00${US}000 米`],
    // 官方 de "60 SEK." / fr "60 S": 这是时长格式的样例串, 不该带中文句号
    ['60sec', '60秒'],
    // 子代理把这一行的链接修坏了 (多了个 "["、显示文本与括号错位、多了 2 个分隔符), 按官方 de 的结构重建
    ['[yourviewscreengoesdarkas[[dm*basedescriptiondefs[lorerepkurita]^shugoyamaguchiterminatestheconnection*]',
      `[屏幕变黑，因为[[DM.BaseDescriptionDefs[LoreRepKurita]${US}山口守护]]断开了连接。]`],
  ]);
  let n = 0;
  for (const [k, v] of EXACT) if (merged.has(k) && merged.get(k) !== v) { merged.set(k, v); n++; }
  console.log(`定点覆盖: ${n} / ${EXACT.size} 条`);
}

// ---- 人工裁决: 定点覆盖个别条目 ----
// 换成自然措辞后, 有少数条目旧版(界面串重写)更好 (例如旧版把 Greenland 译成"格林兰",
// 自然版却留了英文); 也有几处两边都不对、需要人工新写。
// 结论统一放 corpus/font-atlas/overrides.jsonl (由 tools/make-overrides.mjs 生成),
// 便于复查与回滚 —— 不要直接在 CSV 上手工改。
{
  const ovPath = path.join(PROJ, 'corpus', 'font-atlas', 'overrides.jsonl');
  if (fs.existsSync(ovPath)) {
    let n = 0, same = 0, miss = 0;
    for (const L of fs.readFileSync(ovPath, 'utf8').split('\n')) {
      if (!L.trim()) continue;
      const o = JSON.parse(L);
      if (!merged.has(o.key)) { miss++; continue; }
      if (merged.get(o.key) === o.value) { same++; continue; }
      merged.set(o.key, o.value); n++;
    }
    console.log(`人工裁决: 覆盖 ${n} 条, 已一致 ${same} 条${miss ? `, !! ${miss} 条 key 不存在` : ''}`);
  } else {
    console.log('人工裁决: 无 overrides.jsonl, 跳过');
  }
}

// ---- 星币符号 ¢ 修复 ----
// 官方有 75 个 key 的值里带 ¢ (C-Bill 货币符号), 而旧图集没有 ¢ 字形, 被逐字替换删掉了 ——
// 于是"现金奖励： 1，000，000"少了货币符号。新图集包含 ¢, 这里按官方位置补回来。
{
  const keyInfo = new Map();
  try {
    for (const L of fs.readFileSync(path.join(PROJ, 'corpus', 'keys.jsonl'), 'utf8').split('\n')) {
      if (!L.trim()) continue;
      const o = JSON.parse(L);
      keyInfo.set(o.key, o);
    }
  } catch { }
  let fixed = 0, localized = 0; const failed = [];
  for (const [k, o] of keyInfo) {
    const off = (o.de || '') + '|' + (o.en || '') + '|' + (o.fr || '') + '|' + (o.ru || '');
    if (!off.includes('¢')) continue;
    const v = merged.get(k);
    if (v === undefined || v.includes('¢')) continue;
    // 已经用"星币/C钱"这种词本地化过的就不要再塞符号了 (官方法语有时也是这个写法)
    if (/星币|C钱|C-/.test(v)) { localized++; continue; }
    let done = false;
    const m = /¢([0-9^*]+)/.exec(k);          // key 里的 ¢ 后面就是金额模式 (^=逗号, *=小数点)
    const cands = [];
    if (m) {
      const raw = m[1];
      cands.push(raw.replace(/\^/g, '，').replace(/\*/g, '.'));
      cands.push(raw.replace(/\^/g, '，').replace(/\*/g, '，'));
      cands.push(raw.replace(/\^/g, '.').replace(/\*/g, '.'));
      cands.push(raw);
    }
    for (const c of cands) {
      const i = v.indexOf(c);
      if (i >= 0) { merged.set(k, v.slice(0, i) + '¢' + v.slice(i)); done = true; break; }
    }
    if (!done) {
      // 退路: 找第一个不在 <...> 标签里的数字 (避免插进 <color=#DE6729> 这种颜色值)
      const masked = v.replace(/<[^>]*>/g, (t) => '\u0000'.repeat(t.length));
      const dm = /[0-9]/.exec(masked);
      if (dm) { merged.set(k, v.slice(0, dm.index) + '¢' + v.slice(dm.index)); done = true; }
    }
    if (done) fixed++; else failed.push(k);
  }
  console.log(`星币符号 ¢ 修复: 补 ${fixed} 条, 已本地化为"星币"略过 ${localized} 条`
    + (failed.length ? `  !! 失败 ${failed.length}: ${failed.join(', ')}` : ''));
}

// ---- 写出 ----
const out = ['KEY,zh-CN'];
let emptyOfficial = 0;
for (const k of keyOrder) {
  const v = merged.get(k);
  if (v) out.push(k + ',' + v);
  // 官方 de/fr/ru 本身就是空值 (如内部串 deptooltip) -> 保持空值, 与官方三语完全一致
  else if ((de.get(k) || '') === '') { out.push(k + ','); emptyOfficial++; }
}
const outPath = path.join(PROJ, 'corpus', 'strings_zh-CN.csv');
fs.writeFileSync(outPath, out.join('\n') + '\n', 'utf8');
let bad = 0;
for (const L of out.slice(1)) { const i = L.indexOf(','); if (i > 0 && L.slice(i + 1).includes(',')) bad++; }
console.log(`\n已写出 ${outPath}  行数=${out.length}  大小=${(fs.statSync(outPath).size / 1048576).toFixed(2)}MB`);
console.log(`自检: 值含半角逗号行数=${bad} (必须0)`);
const gaps = keyOrder.filter(k => !merged.has(k) && (de.get(k) || '') !== '');
console.log(`仍未翻译: ${gaps.length}${emptyOfficial ? ` (另有 ${emptyOfficial} 条官方本身即为空值, 已照官方写出空值)` : ''}`);
fs.writeFileSync(path.join(PROJ, 'corpus', 'gap2.jsonl'),
  gaps.map(k => JSON.stringify({ key: k, de: de.get(k) || '' })).join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(PROJ, 'corpus', 'src-map.tsv'),
  [...merged.keys()].map(k => `${k}\t${srcOf.get(k) || '?'}`).join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(PROJ, 'corpus', 'suspect.jsonl'),
  suspect.map(([k, m, s]) => JSON.stringify({ key: k, missing: m, src: s, zh: merged.get(k), de: de.get(k) || '' })).join('\n') + '\n', 'utf8');
