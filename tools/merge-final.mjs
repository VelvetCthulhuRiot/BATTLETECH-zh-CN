// 最终合并: 官方KEY + 多源中文译文 -> 游戏可用 strings_zh-CN.csv
// 关键修正: repo CSV 必须按"行内第一个逗号"解析 (官方格式保证 KEY 内无半角逗号, 且文件含未配对引号)
import fs from 'node:fs';
import { GAME, SA, LOC } from './game-path.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';


// 仓库根目录: 从脚本自身位置推导 (脚本位于 <root>/tools/)。
// 这样克隆下来就能直接跑, 也避免把开发机的用户名写进公开仓库。
const PROJ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GH = path.join(PROJ, 'incoming', 'gh');
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

// ---- 富文本标签规范化: 等号两侧被加了空格 ----
// TMP 解析不了 "<color = #85DBF6FF>", 于是界面上原样显示这串标签文字
// (用户反馈: 教程选项里就冒出来过; 同一菜单其它选项写的是无空格的 "<color=#85DBF6FF>", 显示正常)。
// 官方 de/fr/ru 全是无空格写法, 这里统一收口。
// 注意: 只动"等号两侧的空格"。官方伪本地化串 strings_dev-WWW.csv 里本来就有
// "<color #F79B26FF>"(压根没有等号)和 "<link="X">"(值带引号)这类写法, 那是【源串】格式,
// 不在这里动 —— 见 EULA/隐私政策那两条。
{
  let n = 0;
  for (const [k, v0] of merged) {
    if (!/<\s*\/?\s*[A-Za-z][A-Za-z0-9-]*\s*=/.test(v0)) continue;
    const v = v0.replace(/<(\s*\/?\s*[A-Za-z][A-Za-z0-9-]*)\s*=\s*/g, '<$1=');
    if (v !== v0) { merged.set(k, v); n++; }
  }
  console.log(`富文本标签规范化(去掉等号两侧空格): ${n} 条`);
}

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
    // ---- 用户反馈 (第十轮: 设备名与描述对不上 / 肌动器术语) ----
    // myomer 的旧译是音译"麦约摩尔"(6 处), 而用户精修的渡鸦 RVN-3X 简介里用的是"肌动器" ->
    // 统一成"肌动器"(用户口径)。两个"原型三倍…"的短 key 走人工裁决改成"三重"。
    ['麦约摩尔', '肌动器'],
    // ---- 用户反馈 (第二轮: 深玩后逐条截图) ----
    // ⚠️ 这里只能放"不依赖后面几个阶段"的短语: 本段跑在"专名汉化"(Markham->马卡姆)之前,
    //    含英文专名或半角句号的整句改不动, 那几条走 make-overrides.mjs 的人工裁决(最后才跑)。
    ['肉搏', '近战'],           // 战斗界面右下武器栏那行 "Melee"; 用户要求改叫"近战"(裸 key melee 见人工裁决 -> "近战攻击")
    ['加里拉克', '加瑞拉克'],     // glossary: Garrilac=加瑞拉克; 另有 3 处把 Garrilac 写成了"加里拉克"
    ['军阀梅森', '领主指挥官梅森'],  // 同源坏值: 同一句里 Lord Commander 也被当成"军阀"(warlord); 官方 de 直接保留 "Lord Commander"
    ['梅森加瑞拉克', '梅森·加瑞拉克'],  // 上一条改完后的残留: 名字中间少了间隔号 (glossary: Mason Garrilac=梅森·加瑞拉克)
    ['一只 ibex', '一只北山羊'],  // 埃斯皮诺萨家族纹章: en="an ibex on a field of thorns"; 官方 de=Steinbock / fr=bouquetin 都是北山羊
    ['我的Marauders', '我的掠夺者'],  // 未译的 Marauders (glossary: Marauder=掠夺者)
    // ---- 用户反馈 (第三轮: 机甲库那一屏的术语) ----
    // Mech Bay 统一叫"机甲库"(左侧导航/阿尔戈号升级卡早就是这个写法), 早期从官方德语
    // "Mech-Hangar/Wartungsgerüst" 转手过来的译文留下了"机库"和"机甲机库"两种写法。
    // 只在 key 带 mechbay 时才换 —— 故事里的 hangar(瓦罗的机库/沃洛机库)是真 hangar, 不能动。
    ['机甲勇士', '机甲战士'],    // 全库只有 2 处, 且其中一句里前后就用了"机甲战士"和"机甲勇士"两个词
  ];
  // 同一个词有正当的其它含义 -> 只在 key 能确认语境时才替换
  const KEYED = [
    [/lance/i, [['长枪', '小队'], ['兰斯', '小队']]],                       // glossary: lance=小队
    [/capellan/i, [['卡佩拉', '御夫星'], ['卡佩兰', '御夫星'], ['御夫座', '御夫星']]], // glossary: Capellan=御夫星
    [/contract/i, [['订单', '合约']]],
    [/salvage/i, [['废料', '战利品']]],
    [/xo|executive/i, [['执行官', '副舰长'], ['副驾驶', '副舰长']]],         // glossary: XO=副舰长
    // 同一份 LoreBloodChit 的引用显示文本有三种写法(血幅/血票/血牌), 统一到术语本身 key=bloodchit 的"血幅"
    [/bloodchit/i, [['血票', '血幅'], ['血牌', '血幅']]],
    // Mech Bay -> 机甲库 (长写法先换, 否则"机甲机库"会被拆成"机甲机甲库")
    [/mechbay/i, [['机甲机库', '机甲库'], ['机库', '机甲库']]],
  ];
  // 用户反馈: 战斗里那条蓝条(Resolve)旧译"决心"太笼统, 改叫"战斗决心" —— 和公司层面的
  // Morale"士气"区分开(两个属性在游戏里是两回事, 都叫一个词玩家会混)。
  // 但 key 带 resolve 不等于就是这套机制, 下面这三条里的 resolve 是叙事上的 determination, 必须留在"决心":
  //   "the Directorate's atrocities have steeled our resolve"(坚定了我们的决心)、
  //   "the symbol of my house, and of our unshakable resolve"(不可动摇的决心)、
  //   "Yang looks anxious but resolved"(杨看上去不安，但已经下了决心)
  const RESOLVE_NARRATIVE = [
    'thingsaregoingwellenough', 'yes^iwill', 'whenyouarriveatthemorningbriefing',
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
    if (/resolve/i.test(k) && !RESOLVE_NARRATIVE.some(p => k.startsWith(p))) {
      // 一次替换搞定两种写法: "决心点数"要整体吃掉, 否则会写出"15点战斗决心点数"。
      // 用 replace(回调) 单遍扫描, 中途不会把刚插入的"战斗决心"再替换一次(踩过 bump 的地雷)。
      const n = v.split('决心').length - 1;
      if (n) {
        v = v.replace(/决心点数|决心/g, '战斗决心');
        hits.set('决心→战斗决心', (hits.get('决心→战斗决心') || 0) + n);
      }
    }
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

// ---- 导出"专名汉化之前"的基线快照 ----
// 为什么需要: tools/gen-glossary-names.mjs 与 tools/gen-pilot-keys.mjs 都要判断
// "这个名字的英文原名是否还出现在正文里"。若它们扫的是最终 CSV, 名字一旦被替换掉,
// 下次生成就会把它从名单里删掉 —— 名单每跑一次缩水一次, 最后又变回英文
// (实测就是这样漏掉了 Dominik)。快照必须在这里导出 (NAMES 阶段之前),
// 生成器只读快照, 于是可重复、幂等。
try {
  const base = ['KEY,zh-CN'];
  for (const k of keyOrder) {
    const v = merged.get(k);
    if (v) base.push(k + ',' + v);
  }
  fs.writeFileSync(path.join(PROJ, '.tmp', 'prename.csv'), base.join('\n') + '\n', 'utf8');
  console.log(`基线快照: .tmp/prename.csv (${base.length - 1} 条, 供专名表生成器使用)`);
} catch (e) { console.log('基线快照导出失败: ' + e.message); }

// >>> MECH-MODELS BEGIN (由 tools/gen-mech-keys.mjs 生成, 勿手改)
// 这些是"机甲型号名"; 出现在正文里时按中文习惯加双引号
const MECH_MODELS = new Set([
  'Annihilator', 'Archer', 'Assassin', 'Atlas',
  'Atlas II', 'Awesome', 'Awesome Dragon', 'BIG STEEL CLAW',
  'Banshee', 'Battlemaster', 'Black Knight', 'Black Widow',
  'Blackjack', 'Bull Shark', 'Cataphract', 'Catapult',
  'Centurion', 'Charger', 'Cicada', 'Commando',
  'Crab', 'Cyclops', 'Dragon', 'Enforcer',
  'Firestarter', 'Flea', 'Grand Dragon', 'Grasshopper',
  'Griffin', 'Hatchetman', 'Highlander', 'Hunchback',
  'JagerMech', 'Javelin', 'Jenner', 'King Crab',
  'Kingcrab', 'Kintaro', 'Koschei', 'Locust',
  'Marauder', 'Nightstar', 'Occam\'s Missile', 'Orion',
  'Panther', 'Phoenix Hawk', 'Quickdraw', 'Raven',
  'Rhythm Nation', 'Rifleman', 'Shadow Hawk', 'Spider',
  'Stalker', 'Target Dummy', 'Test Dummy', 'Thunderbolt',
  'Trebuchet', 'UrbanMech', 'Valkyrie', 'Victor',
  'Vindicator', 'Vulcan', 'Warhammer', 'Wasp',
  'Wolverine', 'Zeus',
]);
// >>> MECH-MODELS END

// >>> MECH-ZH BEGIN (由 tools/gen-mech-keys.mjs 生成, 勿手改)
const MECH_ZH = [
  ['Annihilator', '歼灭者'], ['Archer', '弓箭手'], ['Assassin', '刺客'],
  ['Atlas', '宇宙神'], ['Atlas II', '宇宙神 II'], ['Awesome', '可畏'],
  ['Awesome Dragon', '威龙'], ['Banshee', '女妖'], ['Battlemaster', '战将'],
  ['BIG STEEL CLAW', '巨钢爪'], ['Blackjack', '海盗旗'], ['Black Knight', '黑骑士'],
  ['Black Widow', '黑寡妇'], ['Bull Shark', '牛鲨'], ['Cataphract', '重甲铁骑'],
  ['Catapult', '弩炮'], ['catapultk2', '弩炮 K2'], ['Centurion', '百夫长'],
  ['Charger', '冲锋者'], ['Cicada', '蝉'], ['Commando', '突击者'],
  ['Crab', '蟹'], ['Cyclops', '独眼巨人'], ['Dragon', '龙'],
  ['Enforcer', '执法官'], ['Firestarter', '纵火犯'], ['Flea', '跳蚤'],
  ['Grand Dragon', '巨龙'], ['Grasshopper', '蚱蜢'], ['Griffin', '狮鹫'],
  ['Hatchetman', '斧王'], ['Highlander', '高地勇士'], ['Hunchback', '驼背'],
  ['JagerMech', '机甲猎手'], ['Javelin', '标枪'], ['Jenner', '詹纳'],
  ['King Crab', '帝王蟹'], ['King Crab', '帝王蟹'], ['Kintaro', '金太郎'],
  ['Koschei', '科西切'], ['Locust', '蝗虫'], ['Marauder', '掠夺者'],
  ['Nightstar', '暗夜之星'], ['Occam\'s Missile', '奥卡姆导弹'], ['Orion', '猎户座'],
  ['Panther', '黑豹'], ['Phoenix Hawk', '凤凰'], ['Quickdraw', '闪击'],
  ['Raven', '渡鸦'], ['Rhythm Nation', '节奏国度'], ['Rifleman', '步枪手'],
  ['Shadow Hawk', '影鹰'], ['Spider', '蜘蛛'], ['Stalker', '潜行者'],
  ['Target Dummy', '靶标'], ['Test Dummy', '测试靶标'], ['Thunderbolt', '雷电'],
  ['Trebuchet', '投石机'], ['UrbanMech', '都市战甲'], ['Valkyrie', '女武神'],
  ['Victor', '胜利者'], ['Vindicator', '捍卫者'], ['Vulcan', '火神'],
  ['Warhammer', '战锤'], ['Wasp', '黄蜂'], ['Wolverine', '狼獾'],
  ['Zeus', '宙斯'],
];
// >>> MECH-ZH END

// >>> PILOT-PROSE BEGIN (由 tools/gen-pilot-keys.mjs 生成, 勿手改)
// 飞行员呼号/名/姓里, 英文原名仍出现在正文中的那些 (专名汉化表要用)
const PILOT_PROSE = [
  ['Aleksandr', '亚历山大'], ['Arano', '阿拉诺'], ['Archangel', '大天使'], ['Behemoth', '巨兽'],
  ['Cheval', '舍瓦尔'], ['Conqueror', '征服者'], ['Dekker', '德克尔'], ['Diana', '黛安娜'],
  ['Dominik', '多米尼克'], ['Dragon 66', '龙66'], ['Ellis', '埃利斯'], ['Espinosa', '埃斯皮诺萨'],
  ['Glitch', '故障'], ['Kamea', '卡梅娅'], ['Kerensky', ' 克伦斯基'], ['Lunari', '卢纳里'],
  ['Marisol', '玛丽索尔'], ['Medusa', '美杜莎'], ['Michael', '迈克尔'], ['Morgan Kell', '摩根·凯尔'],
  ['Natasha', '娜塔莎\\'], ['Natasha Kerensky', '娜塔莎·克伦斯基'], ['Ombra', '影'], ['Orchid', '奥奇德'],
  ['Peregrine', '游隼'], ['Phantom', '幽灵'], ['Raju', '拉朱'], ['Simonsen', '西蒙森'],
  ['Squire', '扈从'], ['Sven', '斯文'], ['T-Bone', 'T骨'], ['Test9', '""测试9号""'],
  ['Thresher', '长尾鲨'], ['Toraldsen', '托拉尔森'], ['Ulysses', '尤利西斯'], ['Unknown', '不明'],
  ['Valravn', '灵鸦'], ['Vanguard', '前卫'], ['Victoria', '维多利亚'], ['Viscacha', '兔鼠'],
  ['Whistler', '口哨'], ['Zhao', '赵'],
];
// >>> PILOT-PROSE END

// ---- 专名汉化: 各分片对"拉丁原名 vs 音译"判断不一 (同一文件里 Argo 260 处拉丁 / Sumire 132 处), 按 glossary 收敛 ----
// 只在 {...} 占位符与 <...> 富文本标签之外替换, 并用词边界, 所以 faction_Davion / LoreArgo / ArgoUpgrade 这类不会被误伤。
{
  const NAMES = [
    // 机甲型号名与飞行员名先行: 这两张表由生成器给出 (含 glossary 里没有的 Assassin/Javelin/
    // Cyclops 以及用户人工翻译的呼号/姓名), 只收"英文原名确实出现在正文里"的那些。
    ...MECH_ZH,
    ...PILOT_PROSE,
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
    // 双词优先: "Phantom Mech" 是 BattleTech 里的传说现象, 只译 Phantom 会留下半英半中的
    // "幽灵 Mech"。列表按长度倒序排, 所以这条会先于 ['Phantom', '幽灵'] 命中。
    ['Phantom Mech', '幽灵机甲'],
    // ---- 以下来自 glossary 专名覆盖普查 ----
    // 起因: 玩家反馈"战斗对白里的 Mastiff 没翻译"。普查发现可见文本里仍有 251 个专名 / 745 条留英文
    // (glossary 里已给出中文译名的名字, 在译文里仍以拉丁形式出现)。成因是字形受限时期
    // "缺字就保留拉丁原名"的写法留在了语料里 —— --natural 只跳过替换阶段, 改不动语料本身。
    // 这里只收"直接替换不会造出病句"的; 需要调语序的见下面的 TITLES 阶段;
    // 需要按语境判断的 (Commander 呼语、Narc、Paradox 公司名) 不在此列。
    ['Shugo Yamaguchi', '山口守护'], ['Black Caldera', '黑色火山口'],
    ['Mastiff', '獒犬'], ['Raven', '渡鸦'], ['Lees', '利斯'], ['Hironaka', '广中'],
    ['Cheval', '舍瓦尔'], ['Maskirovka', '欺敌局'], ['BattleMech', '战斗机甲'],
    ['DropShip', '空投艇'], ['Axylus', '阿克西卢斯'], ['Tempest', '暴雨'],
    ['Damestroir', '达姆斯托瓦尔'], ['Iberia', '伊贝里亚'], ['Stieglitz', '施蒂格利茨'],
    ['Bradford', '布拉德福德'], ['Yamaguchi', '山口'], ['Chu-i', '中尉'],
    ['DEST', '天龙精英突击队'], ['SLDF', '星际联盟防卫军'],
    // >>> GLOSSARY-NAMES BEGIN (由 tools/gen-glossary-names.mjs 从 corpus/glossary.tsv 生成, 勿手改)
    // 类别: 地名 / 人名 / 机甲 / 生物 / 船名 / 作品 / 日本人姓
    ['Adrar', '阿德拉尔'], ['Ahlat', '阿赫拉特'], ['Airavata', '埃拉瓦塔'],
    ['Alban', '阿尔班'], ['Aleksandr Kerensky', '亚历山大·克伦斯基'], ['Alexander', '亚历山大'],
    ['Alexandra Cunningham', '亚历山德里娅·坎宁安'], ['Allard', '阿拉德'], ['Allison', '艾利森'],
    ['Alloway', '阿洛韦'], ['Ana Maria', '安娜·玛丽亚'], ['Angus', '安格斯'],
    ['Appian', '阿庇安'], ['Artru', '阿特鲁'], ['Atlas', '宇宙神'],
    ['Atreus', '阿特柔斯'], ['Ayasha', '阿亚沙'], ['Balawat', '巴拉瓦特'],
    ['Bellerophon', '柏勒洛丰'], ['Binton', '宾顿'], ['Bisset', '比塞特'],
    ['Black Reaper', '黑色收割者'], ['Blackjack', '海盗旗'], ['Bogdan', '博格丹'],
    ['Brock Armstrong', '布罗克·阿姆斯特朗'], ['Brockway', '布罗克维'], ['Calamar Gigante', '卡拉马尔·吉甘特'],
    ['Calderon', '卡尔德龙'], ['Capella', '卡佩拉'], ['Cataphract', '重甲铁骑'],
    ['Catherine', '凯瑟琳'], ['Cavalor', '卡瓦罗尔'], ['Cavanaugh', '卡瓦诺'],
    ['Centurion', '百夫长'], ['Claybrooke', '克雷布鲁克'], ['Corbu', '科尔布'],
    ['Crab', '蟹'], ['Crenshaw', '克伦肖'], ['Crowley', '克劳利'],
    ['Cyclops', '独眼巨人'], ['Decimis', '德希米斯'], ['Delfinas', '德尔菲娜丝号'],
    ['Dhawan', '达万'], ['Diana Lunari', '黛安娜·卢纳里'], ['Dianthe', '戴安泽'],
    ['Dobrescu', '多布雷斯库'], ['Dominik Zhao', '多米尼克·赵'], ['Dragon', '龙'],
    ['Electra', '厄勒克特拉'], ['Elena Marisol-Chaplin', '埃琳娜·玛丽索尔-查普林'], ['Ellen', '埃伦'],
    ['Ellis', '埃利斯'], ['Fagerholm', '法格霍姆'], ['Firestarter', '纵火犯'],
    ['Fjaldr', '菲亚德尔'], ['Flintoft', '弗林托夫特'], ['Fringers', '外缘人'],
    ['Galedon', '盖尔登'], ['Garrilac', '加瑞拉克'], ['Gaucin', '高辛'],
    ['Gauthier', '高蒂尔'], ['George', '乔治'], ['Graf', '格拉夫'],
    ['Griffin', '狮鹫'], ['Hachiman', '八幡'], ['Hadley', '哈德利'],
    ['Hanse Davion', '汉瑟·达维恩'], ['Hassid Ricol', '哈希德·里科尔'], ['Hatchetman', '斧王'],
    ['Helen', '海伦'], ['Hellespont', '赫勒斯滂'], ['Herotitus', '希罗提多'],
    ['Horsham', '霍舍姆'], ['Hunchback', '驼背'], ['Independence', '独立'],
    ['Jesper', '杰斯珀'], ['Justin Allard', '贾斯汀·阿拉德'], ['Khulan', '呼兰'],
    ['Kittery', '基特里'], ['Koschei', '科西切'], ['Langford', '兰福德'],
    ['Luthien', '卢希恩'], ['Lyreton', '利勒顿'], ['Lyris', '利瑞斯'],
    ['Magorian', '马戈里安'], ['Mantharaka', '曼萨拉卡'], ['Mariko', '马里科'],
    ['Marina', '玛丽娜'], ['Marina Liao', '玛丽娜·廖'], ['Marisol-Chaplin', '玛丽索尔-查普林'],
    ['Markham', '马卡姆'], ['Matis', '马蒂斯'], ['Megan', '梅甘'],
    ['Men Lojowen', '米因洛若维因'], ['Mencius Horvat', '门修斯·霍瓦特'], ['Mendham', '门德姆'],
    ['Miguel', '米盖尔'], ['Minor Major', '未成年少校'], ['Mitchel', '米切尔'],
    ['Morgan Kell', '摩根·凯尔'], ['Murdoch', '默多克'], ['Nakano', '中野'],
    ['Natasha Kerensky', '娜塔莎·克伦斯基'], ['New Avalon', '新阿瓦隆'], ['New Vallis', '新瓦利斯'],
    ['New Vulci', '新武尔奇'], ['Newgrange', '新格兰奇号'], ['Norkus', '诺尔库斯'],
    ['Notker', '诺特克尔'], ['Oliveira', '奥利维拉'], ['Orchid Zhao', '奥尔基德·赵'],
    ['Parata', '帕拉塔'], ['Parzival', '帕尔齐伐尔'], ['Patrick Kell', '帕特里克·凯尔'],
    ['Paula Trevaline', '葆拉·特雷瓦琳'], ['Phil Burdock', '菲尔·伯多克'], ['Pilpala', '皮尔帕拉'],
    ['Pyrrhus', '皮洛士'], ['Rasalhague', '罗萨利格'], ['Reynauld', '雷诺奥'],
    ['Rhee', '李'], ['Ricol', '里科尔'], ['Rodigo', '罗迪戈'],
    ['Rough Riders', '狂野骑士'], ['Royden', '罗伊登'], ['Sarna', '萨尔纳'],
    ['Shaul Khala', '绍尔哈拉'], ['Shaunavon', '肖纳文'], ['Shivraj', '希夫拉杰'],
    ['Sian', '希安'], ['Simonsen', '西蒙森'], ['Singh', '辛格'],
    ['Spider', '蜘蛛'], ['St. Loris', '圣洛里斯'], ['Stalker', '潜行者'],
    ['Stefan Amaris', '斯特凡·阿马里斯'], ['Stratford', '斯特拉特福'], ['Stratford Narwhal', '斯特拉特福独角鲸'],
    ['Suiko', '翠子'], ['Tamati', '塔马蒂'], ['Tarragona', '塔拉戈纳'],
    ['Taurus', '陶鲁斯'], ['Tetsuhara', '哲原'], ['Tharkad', '沙卡德'],
    ['Thunderbolt', '雷电'], ['Tianyu', '天宇'], ['Tigerfalcon', '虎隼'],
    ['Tortuga', '托尔图加'], ['Tsubaki', '椿'], ['Tubbs', '塔布斯'],
    ['Under Cover', '卧底娇娃'], ['UrbanMech', '都市战甲'], ['Verthandi', '薇儿丹蒂'],
    ['Vindicator', '捍卫者'], ['Viribium', '维里比姆'], ['Volkov', '沃尔科夫'],
    ['Wallo', '瓦罗'], ['Yance', '扬塞'], ['Yuetu', '月兔'],
    ['Yuris', '尤里斯'], ['Zapata', '萨帕塔'],
    // <<< GLOSSARY-NAMES END
  ].sort((a, b) => b[0].length - a[0].length);
  // 去重: 机甲表/飞行员表/glossary 表可能重名, 同名保留先出现的那个,
  // 否则同一个名字会被替换两次(第二次找不到), 且命中计数翻倍。
  {
    const seen = new Set();
    for (let i = NAMES.length - 1; i >= 0; i--) {
      if (seen.has(NAMES[i][0])) NAMES.splice(i, 1); else seen.add(NAMES[i][0]);
    }
  }
  const usable = NAMES.filter(([, zh]) => ![...zh].some(c => c.codePointAt(0) >= 128 && !ATLAS.has(c)));
  const dropped = NAMES.filter(([en]) => !usable.some(([e]) => e === en)).map(([en, zh]) => `${en}→${zh}`);
  if (dropped.length) console.log(`  (术语表译名含图集外汉字, 已跳过: ${dropped.join(', ')})`);
  const hits = new Map();
  let rows = 0;
  for (const [k, v0] of merged) {
    const stash = [];
    // 占位符 {...} 与富文本标签 <...> 原样抽出, 绝不替换其中的内容
    // 占位符 {...}、富文本标签 <...>、字面转义 \n、以及 [[引用键<U+001F> 一律原样抽出。
    // 转义要抽出来的原因: 值是 "…暗示。\n\nMastiff 教我…", 那串 \n 是【两个字符】
    // (反斜杠 + n), 而 n 是单词字符, 于是 \bMastiff\b 的词边界不成立 -> 紧跟在 \n 后的
    // 专名永远替换不到。实测就是这样漏掉了 Mastiff。
    // 引用键要抽出来的原因: 词边界挡不住所有情况。faction_Davion 因为 "_" 是单词字符而安全,
    // 但 DM.WeaponDefs[Weapon_LRM_LRM15_2-Zeus] 里的 "-" 是非单词字符, \bZeus\b 照样命中,
    // 引用键被换成 Weapon_LRM_LRM15_2-""宙斯"" —— 游戏就查不到那件武器了。实测踩到过。
    // (分隔符之后是"显示文本", 那部分要保留并翻译, 所以只吃掉 [[ 到 U+001F。)
    let v = v0.replace(/\{[\s\S]*?\}|<[^>]*>|\\[a-zA-Z]|\[\[[^\u001f]*\u001f/g, m => { stash.push(m); return '\u0003' + (stash.length - 1) + '\u0003'; });
    let ch = false;
    // 机甲型号名要按中文习惯加双引号 ("海盗旗"); CSV 里的字面双引号写作两个连续引号。
    // 三种情况都要处理, 顺序不能换:
    //   a) 语料里存在"中文引号名 + 紧跟英文原名"的冗余写法 (""雷电""Thunderbolt 12,
    //      UM-R90""小城市机甲""将传统的""城市机甲""UrbanMech R60) —— 直接替换会写出
    //      ""雷电""""雷电"" 这种 4 连引号, 撞上"引号连续段<=2"的硬检查。这种冗余应该去掉英文那份。
    //   b) 已经带引号的 ""Blackjack"" -> ""海盗旗""  (否则会变成 4 连)
    //   c) 裸名 Blackjack -> ""海盗旗""
    const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const [en, zh] of usable) {
      if (!MECH_MODELS.has(en)) continue;
      const e = escRe(en), z = escRe(zh);
      const rules = [
        [new RegExp('""' + z + '""\\s*' + e + '\\b', 'g'), '""' + zh + '""'],
        [new RegExp('\\b' + e + '\\s*""' + z + '""', 'g'), '""' + zh + '""'],
        [new RegExp('""' + e + '""', 'g'), '""' + zh + '""'],
      ];
      for (const [re, to] of rules) {
        const c = (v.match(re) || []).length;
        if (!c) continue;
        v = v.replace(re, to);
        hits.set(`${en}→${to}`, (hits.get(`${en}→${to}`) || 0) + c);
        ch = true;
      }
    }
    for (const [en, zh] of usable) {
      const re = new RegExp('\\b' + escRe(en) + '\\b', 'g');
      const c = (v.match(re) || []).length;
      if (!c) continue;
      const to = MECH_MODELS.has(en) ? '""' + zh + '""' : zh;
      v = v.replace(re, to);
      hits.set(`${en}→${to}`, (hits.get(`${en}→${to}`) || 0) + c);
      ch = true;
    }
    if (ch) { merged.set(k, v.replace(/\u0003(\d+)\u0003/g, (a, i) => stash[+i])); rows++; }
  }
  const total = [...hits.values()].reduce((a, b) => a + b, 0);
  console.log(`专名汉化: ${rows} 行 / ${total} 处`);
  if (total) console.log('   ' + [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, n]) => `${k}×${n}`).join(', '));
}

// ---- 头衔前置的专名: 英文写 "Lady Cunningham" / "House Karosas" / "Commodore Ostergaard",
//      中文要反过来 ("坎宁安女士" / "卡罗萨斯家族" / "奥斯特加德准将")。
//      纯替换做不到这个语序, 所以单独一步, 用捕获组把名字提到前面。
//      放在专名汉化之后, 于是 "House Karosas" 先变成 "House 卡罗萨斯" 再变成 "卡罗萨斯家族"。
//      引用键 (LoreHouseKarosas / LoreRepDavion) 因 \b 词边界不会被误伤。
{
  const TITLES = [
    [/\bLady\s+([^\s\]|]+)/g, '$1女士'],
    [/\bHouse\s+([^\s\]|]+)/g, '$1家族'],
    [/\bCommodore\s+([^\s\]|]+)/g, '$1准将'],
  ];
  let n = 0;
  for (const [k, v0] of merged) {
    let v = v0, ch = false;
    for (const [re, to] of TITLES) {
      // 同专名汉化: 先把字面转义 \n 抽出来, 否则紧跟其后的 Lady/House/Commodore 因词边界不成立而漏掉
      const stash = [];
      v = v.replace(/\{[^}]*\}|<[^>]*>|\\[a-zA-Z]|\[\[[^\u001f]*\u001f/g, m => { stash.push(m); return '\u0003' + (stash.length - 1) + '\u0003'; });
      const before = v;
      v = v.replace(re, to);
      if (v !== before) ch = true;
      v = v.replace(/\u0003(\d+)\u0003/g, (a, i) => stash[+i]);
    }
    if (ch) { merged.set(k, v); n++; }
  }
  console.log(`头衔语序调整 (Lady / House / Commodore): ${n} 条`);
}

// ---- 汉字之间的多余空格 ----
// 语料习惯用空格把拉丁词/数字与中文隔开 (如 "在 索拉里斯 上"), 这对拉丁词是对的、要保留;
// 但专名汉化把拉丁词换成汉字后, 空格就留在了两个汉字之间:
//     "目光在您和 达吕斯 之间来回移动" / "獒犬 教我"
// 中文排版里这是错的。实测这类共 631 处, 全部来自这个成因。
// 只处理"单个半角空格夹在两个汉字之间"这一种形态, 不碰 "汉字 空格 数字/拉丁" 的写法。
{
  const re = /([\u4e00-\u9fff]) ([\u4e00-\u9fff])/g;
  let n = 0, removed = 0;
  for (const [k, v0] of merged) {
    const stash = [];
    let v = v0.replace(/\{[^}]*\}|<[^>]*>|\\[a-zA-Z]/g, m => { stash.push(m); return '\u0003' + (stash.length - 1) + '\u0003'; });
    const before = v;
    let prev;
    do { prev = v; v = v.replace(re, '$1$2'); } while (v !== prev);
    if (v !== before) {
      removed += (before.length - v.length);
      merged.set(k, v.replace(/\u0003(\d+)\u0003/g, (a, i) => stash[+i]));
      n++;
    }
  }
  console.log(`汉字间多余空格清理: ${n} 条 / ${removed} 处`);
}

// ---- Brawler: 只改"呼号", 不动"机甲角色标签" ----
// 曾经在这里把 主战机/缠斗手 全局改成"斗士", 用户否决了 —— 那个词同时是两种东西:
//   * 飞行员呼号: brawler (pilot_d7_brawler) / elitebrawler ("Elite Brawler", pilot_d10_brawler)
//     -> 用户裁决译"斗士", 走 overrides.jsonl (brawler / elitebrawler 两条)
//   * 机甲角色标签: heavybrawler / lightbrawler / brawler&closeassault 等, 以及三处正文里
//     描述机甲定位的"主战机" -> 保持语料原样, 不做统一。
// 所以这里不再有任何替换逻辑, 只留这段说明, 免得以后又有人手滑全局替换。
{
  const roleKeys = ['heavybrawler', 'lightbrawler', 'brawler&closeassault', 'brawler&generalassault',
    'brawler&rangedassault', 'brawler&skirmisher', 'brawler&electronicwarfare', 'firesupport&brawler',
    'heavyskirmisher&brawler', 'skirmisher&brawler', 'sniper&lightbrawler', 'heavybrawler&sniper',
    'heavybrawler&closeassault'];
  const hit = roleKeys.filter((k) => merged.has(k));
  console.log(`Brawler: 呼号走人工裁决; 角色标签 ${hit.length} 个保持语料原样 (按用户要求不做统一)`);
}

// ---- 机甲名在正文里的异体统一 + 跟随译名变更 ----
// 两件事合在一起做:
//  1) glossary 里同一个机甲给了多个中文备选 (Atlas: 擎天神，巨神，宇宙神), 语料不同轮次各挑了不同的,
//     正文里就混用 —— 玩家会以为"报丧女妖"和"女妖"是两台不同的机甲。这里统一到当前译名。
//  2) 用户人工精修了机甲名 (corpus/mech-names-zh.tsv), 有些名字换了 (具装骑兵->重甲铁骑 等),
//     机甲短简介与其它正文里还写着旧名, 必须一起改, 否则同一台机甲两个叫法。
//     ⚠️ 用户这次把 atlas 定为"宇宙神", 与上一轮相反 —— 所以下面的方向是 擎天神 -> 宇宙神。
// 注意 "黑杰克" 有两种含义: 机甲 Blackjack(海盗旗) 与 黑杰克战斗学校(the School of Conflict),
// 所以只改紧跟型号代号的那一处, 学校名必须保留。
{
  const ALIAS = [
    ['擎天神', '宇宙神'],           // Atlas     上一轮统一成了擎天神, 用户这次定为宇宙神
    ['报丧女妖', '女妖'],           // Banshee
    ['猎歼机甲', '机甲猎手'],        // JagerMech
    ['快枪', '闪击'],               // Quickdraw  (旧名"迅击"也一并换掉)
    ['迅击', '闪击'],               // Quickdraw
    ['黑杰克BJ', '""海盗旗"" BJ'],    // 祖传机甲那一处; "黑杰克战斗学校" 不动
    // ---- 用户精修译名带来的改名 ----
    // Cataphract 被改过两次: 具装骑兵 -> 铁甲骑兵 -> 重甲铁骑。语料里只有"具装骑兵"这一种旧写法
    // (上一版的"铁甲骑兵"只存在于本文件里, 已随本次改名一起清掉), 所以一条规则就够。
    ['具装骑兵', '重甲铁骑'],        // Cataphract
    ['突击队员', '突击者'],          // Commando
    ['执法者', '执法官'],            // Enforcer
    ['纵火者', '纵火犯'],            // Firestarter
    ['蚂蚱', '蚱蜢'],               // Grasshopper
    ['短斧客', '斧王'],             // Hatchetman
    ['高地人', '高地勇士'],          // Highlander
    ['凤凰鹰', '凤凰'],             // Phoenix Hawk
    ['城市机甲', '都市战甲'],        // UrbanMech
    ['复仇者', '捍卫者'],            // Vindicator
    ['可畏龙', '威龙'],             // Awesome Dragon
    ['大龙', '巨龙'],               // Grand Dragon
    ['大钢爪', '巨钢爪'],            // BIG STEEL CLAW
    ['夜星', '暗夜之星'],            // Nightstar
  ];
  const cnt = new Map();
  for (const [k, v0] of merged) {
    let v = v0;
    for (const [from, to] of ALIAS) {
      if (v.indexOf(from) < 0) continue;
      const n = v.split(from).length - 1;
      v = v.split(from).join(to);
      cnt.set(from + '→' + to, (cnt.get(from + '→' + to) || 0) + n);
    }
    if (v !== v0) merged.set(k, v);
  }
  const total = [...cnt.values()].reduce((a, b) => a + b, 0);
  console.log(`机甲名统一/改名: ${total} 处  ` + [...cnt.entries()].map(([k, n]) => `${k}×${n}`).join(', '));
}

// ---- 中文机甲名加引号 ----
// 上一轮只给【英文】机甲名加了引号 (Blackjack -> ""海盗旗""); 语料里本来就用中文写的地方没加,
// 于是同一份文本里 ""海盗旗"" 与 海盗旗 混着出现 (用户反馈)。
//
// 但不能无脑全加: 大多数机甲名同时也是普通词 —— 蝗虫/蜘蛛/雷电/狼獾/黑豹/掠夺者/复仇者/弩炮…
// 实测 "如果我没弄错的话, 是一只狼獾"(动物) 、"一种使用纯机械手段抛射弹丸的弹道设备…弩炮"(本义)
// 都在语料里, 加引号会把句子写坏。所以只在两种明确情形下加:
//   (a) 名字紧挨着型号代号:  具装骑兵CTF-1X / 独眼巨人10-Q型 / 弩炮 C4
//   (b) 名字在下面这张"逐条看过上下文、确认不会与普通词混淆"的名单里
// 已经是 ""名字"" 的不动 (否则会写岀 4 连引号, 撞硬检查)。
{
  // MECH_ZH = [[英文名, 中文名], ...], 由 gen-mech-keys.mjs 维护 (见上面 MECH-ZH 区块)
  const ALL_MECH_NAMES = [...new Set(MECH_ZH.map(([, z]) => z))].filter((z) => z && z.length >= 2);
  // 逐条看过上下文后才敢放的: 这些中文名在本语料里只当机甲名用, 不会与普通词混淆
  // (名单里的名字必须是【当前】译名 —— 上面的改名段已先跑过, 这里要对得上)
  const SAFE_QUOTE = ['海盗旗', '重甲铁骑', '机甲猎手', '斧王', '金太郎', '克拉肯海妖', '帝王蟹',
    '宇宙神', '高地勇士', '詹纳', '黑骑士', '独眼巨人', '狮鹫', '闪击', '驼背', '影鹰',
    '可畏', '战锤', '宙斯', '投石机', '胜利者', '猎户座', '百夫长', '蚱蜢'];
  // 这些同时也是普通词 (蝗虫/蜘蛛/雷电/狼獾/黑豹/掠夺者/捍卫者/弩炮/部件…), 只在
  // 【紧跟型号代号】时加引号 —— 那种位置一定是机甲名 (重甲铁骑CTF-1X / 弩炮 C4 / 女妖3E)
  const QUOTE_IF_CODE = ['女妖', '纵火犯', '执法官',
    '捍卫者', '掠夺者', '潜行者', '突击者', '都市战甲', '弩炮', '蝗虫',
    '蜘蛛', '雷电', '狼獾', '黑豹', '渡鸦'];
  // 型号代号: 可选的 1-4 个大写字母 + 数字开头 (BJ-1 / CTF-1X / C4 / 10-Q / 3E)
  const codeAfter = (v, pos) => /^(?:[A-Z]{1,4}[- ]?)?[0-9][0-9A-Za-z-]*/.test(v.slice(pos, pos + 10));

  let nSafe = 0, nCode = 0, nCurly = 0;
  for (const [k, v0] of merged) {
    let v = v0;
    // 统一的加引号动作: 只处理"前面不是引号"的出现, 避免写出 4 连引号
    const quoteAll = (s, nm) => {
      let idx = 0, out = '';
      while (true) {
        const at = s.indexOf(nm, idx);
        if (at < 0) { out += s.slice(idx); break; }
        if (s.slice(Math.max(0, at - 2), at) === '""') { out += s.slice(idx, at + nm.length); idx = at + nm.length; continue; }
        out += s.slice(idx, at) + '""' + nm + '""';
        idx = at + nm.length;
        nSafe++;
      }
      return out;
    };
    const quoteOnlyCode = (s, nm) => {
      let idx = 0, out = '';
      while (true) {
        const at = s.indexOf(nm, idx);
        if (at < 0) { out += s.slice(idx); break; }
        const already = s.slice(Math.max(0, at - 2), at) === '""';
        const isCode = codeAfter(s, at + nm.length);
        if (already || !isCode) { out += s.slice(idx, at + nm.length); idx = at + nm.length; continue; }
        out += s.slice(idx, at) + '""' + nm + '""';
        idx = at + nm.length;
        nCode++;
      }
      return out;
    };
    // 语料里还有人用中文弯引号 “可畏” 这种写法 (游戏用的是两个 ASCII 引号 "".."", 会渲染成“”),
    // 同一种东西两种写法看着不统一。凡是“机甲名”这样的整块, 一律换成 ""机甲名""。
    // 必须先做这一步: 否则后面对"裸露"的名字补引号时会补成 “""可畏""” (弯引号里再套一层)。
    for (const nm of ALL_MECH_NAMES) {
      const curly = '“' + nm + '”';
      if (v.indexOf(curly) < 0) continue;
      const c = v.split(curly).length - 1;
      v = v.split(curly).join('""' + nm + '""');
      nCurly += c;
    }
    for (const nm of SAFE_QUOTE) v = quoteAll(v, nm);
    for (const nm of QUOTE_IF_CODE) v = quoteOnlyCode(v, nm);
    if (v !== v0) merged.set(k, v);
  }
  console.log(`中文机甲名加引号: 名单命中 ${nSafe} 处, 仅紧邻型号代号 ${nCode} 处, 弯引号 “名” 转 ""名"" ${nCurly} 处`);
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

// ---- 中文标点统一: 半角句号 -> 全角句号 ----
// 语料里两套混用: 半角 "." 6,997 条 vs 全角 "。" 3,341 条。
// 成因是官方 de/fr 本身用 "." (6,914 条里官方也以 "." 结尾), 早期译文照搬了源语言习惯,
// 后来部分精修轮次改用 "。", 于是不一致。
//
// 规则刻意保守, 只动"确实是句末标点"的那些:
//   * 只处理长度 > 8 的条目 —— 短标签挤在窄 UI 里(如 "{0}已死亡." "+ 10 伤害."),
//     多一个全角字符可能挤爆排版, 且官方 de 在那些位置也是 "."
//   * {...} 格式串与 <...> 富文本标签整体挖空 —— {0:0.00} 里的小数点绝不能改 (实测 2,098 条含此类)
//   * "..." 省略号跳过 (352 条)
//   * 句点前一个"可见字符"必须是宽字符 —— 于是 "2.16M" / "999.999.999" / "AC/20." 都不会被碰
//   * 句点后不能紧跟数字 —— 兜住 "字.5" 这类
//   * 句点若是整串最后一个字符, 也一律算句末 (小数不会以句点结尾, {0:0.00} 以 } 结尾)
{
  const isWide = (ch) => ch !== undefined && ch.codePointAt(0) >= 0x2000;
  const prevVisible = (a, i) => { for (let j = i - 1; j >= 0; j--) if (a[j] !== '\u0000') return a[j]; return undefined; };
  let nChanged = 0;
  for (const [k, v0] of merged) {
    if (v0.length <= 8) continue;
    if (v0.indexOf('.') < 0) continue;
    const orig = [...v0];                  // 原始字符数组 (只改这里面真正要改的位置)
    const mask = orig.slice();             // 仅用于分析: 挖空 {...} 与 <...>, 避免误判
    let depth = 0;
    for (let i = 0; i < mask.length; i++) {
      const c = mask[i];
      if (c === '{') { depth++; mask[i] = '\u0000'; continue; }
      if (c === '}') { if (depth > 0) depth--; mask[i] = '\u0000'; continue; }
      if (depth > 0) mask[i] = '\u0000';
    }
    const masked = mask.join('').replace(/<[^>]*>/g, (t) => '\u0000'.repeat(t.length));
    const hits = [];
    for (let i = 0; i < masked.length; i++) {
      if (masked[i] !== '.') continue;
      if (masked[i - 1] === '.' || masked[i + 1] === '.') continue;     // 省略号 / 双点
      const nx = masked[i + 1];
      if (nx !== undefined && /[0-9]/.test(nx)) continue;                // 后面不能是数字 (兜住 "字.5")
      if (!isWide(prevVisible(masked, i)) && i !== masked.length - 1) continue;
      hits.push(i);
    }
    if (!hits.length) continue;
    for (const i of hits) orig[i] = '。';   // !!! 写回 orig, 不是 mask —— 否则会把占位符抹掉
    merged.set(k, orig.join(''));
    nChanged++;
  }
  console.log(`中文标点统一 (半角句号 -> 全角): 修改 ${nChanged} 条`);
}

// ---- 机甲名 / 飞行员名补本地化 key ----
// 背景: 机甲库里的机甲名一直是英文 (CYCLOPS / ANNIHILATOR ...), 因为名字硬编码在
//   BattleTech_Data/StreamingAssets/data/mech/mechdef_*.json 的 Description.Name / UIName 里,
//   官方德语 CSV 里也没有这些 key, 所以一直被当成"游戏不支持"。
//
// 但武器名走的是另一条路, 证明可以汉化:
//   数据文件 Weapon_Autocannon_AC20_0-STOCK.json 的 Name 是 "AC/20"
//   我们 CSV:      ac20 -> AC20自动炮
//   官方德语 CSV:  ac20 -> AK/20        <- 官方也这么做
// 也就是说游戏的本地化查找 = "把英文字符串规范化后当 key" (全小写 + 去掉所有非字母数字):
//   "AC/20" -> ac20     "SRM-4" -> srm4     "Medium Laser" -> mediumlaser
// 机甲库实测: 补上 key 后机甲名确实变中文了 —— 这条路走通了。
// (选中机甲时详情面板最上面那行大写名字仍是英文, 来源不同, 暂不处理。)
//
// 飞行员同理: 官方列表里有 183 个呼号的 key (archangel/arbiter/finn ...), 但 49 个没有,
//   包括主角导师 Raju "Mastiff" Montgomery —— 所以战斗对白的说话人 ID 一直显示英文 Mastiff。
//   姓名分量也是同一机制。译名由用户人工翻译, 源表见 corpus/pilot-names.tsv。
//
// 这些 key 都不在官方列表里, 所以必须同时推进 keyOrder —— 写出阶段是按 keyOrder 走的。
{
  const MECH_KEYS = [
    // >>> MECH-KEYS BEGIN (由 tools/gen-mech-keys.mjs 生成, 勿手改)
    // 共 183 条: 67 个机甲名 + 123 个变体全名 + 0 个常备角色
    ['annihilator', '歼灭者'], ['archer', '弓箭手'], ['assassin', '刺客'],
    ['atlas', '宇宙神'], ['atlasii', '宇宙神 II'], ['awesome', '可畏'],
    ['awesomedragon', '威龙'], ['banshee', '女妖'], ['battlemaster', '战将'],
    ['bigsteelclaw', '巨钢爪'], ['blackjack', '海盗旗'], ['blackknight', '黑骑士'],
    ['blackwidow', '黑寡妇'], ['bullshark', '牛鲨'], ['cataphract', '重甲铁骑'],
    ['catapult', '弩炮'], ['catapultk2', '弩炮 K2'], ['centurion', '百夫长'],
    ['charger', '冲锋者'], ['cicada', '蝉'], ['commando', '突击者'],
    ['crab', '蟹'], ['cyclops', '独眼巨人'], ['dragon', '龙'],
    ['enforcer', '执法官'], ['firestarter', '纵火犯'], ['flea', '跳蚤'],
    ['granddragon', '巨龙'], ['grasshopper', '蚱蜢'], ['griffin', '狮鹫'],
    ['hatchetman', '斧王'], ['highlander', '高地勇士'], ['hunchback', '驼背'],
    ['jagermech', '机甲猎手'], ['javelin', '标枪'], ['jenner', '詹纳'],
    ['kingcrab', '帝王蟹'], ['kintaro', '金太郎'], ['koschei', '科西切'],
    ['locust', '蝗虫'], ['marauder', '掠夺者'], ['nightstar', '暗夜之星'],
    ['occamsmissile', '奥卡姆导弹'], ['orion', '猎户座'], ['panther', '黑豹'],
    ['phoenixhawk', '凤凰'], ['quickdraw', '闪击'], ['raven', '渡鸦'],
    ['rhythmnation', '节奏国度'], ['rifleman', '步枪手'], ['shadowhawk', '影鹰'],
    ['spider', '蜘蛛'], ['stalker', '潜行者'], ['targetdummy', '靶标'],
    ['testdummy', '测试靶标'], ['thunderbolt', '雷电'], ['trebuchet', '投石机'],
    ['urbanmech', '都市战甲'], ['valkyrie', '女武神'], ['victor', '胜利者'],
    ['vindicator', '捍卫者'], ['vulcan', '火神'], ['warhammer', '战锤'],
    ['wasp', '黄蜂'], ['wolverine', '狼獾'], ['zeus', '宙斯'],
    ['annihilatoranh1a', '歼灭者 ANH-1A'], ['annihilatoranhjh', '歼灭者 ANH-JH'], ['archerarc2r', '弓箭手 ARC-2R'],
    ['archerarc2s', '弓箭手 ARC-2S'], ['archerarcls', '弓箭手 ARC-LS'], ['archerarcxo', '弓箭手 ARC-XO'],
    ['assassinasn101', '刺客 ASN-101'], ['assassinasn21', '刺客 ASN-21'], ['atlasas7d', '宇宙神 AS7-D'],
    ['atlasas7gg', '宇宙神 AS7-GG'], ['atlasiias7dht', '宇宙神 II AS7-D-HT'], ['awesomeaws8q', '可畏 AWS-8Q'],
    ['awesomeaws8t', '可畏 AWS-8T'], ['bansheebnc3e', '女妖 BNC-3E'], ['bansheebnc3m', '女妖 BNC-3M'],
    ['bansheebnc3s', '女妖 BNC-3S'], ['battlemasterblr1g', '战将 BLR-1G'], ['battlemasterblr1s', '战将 BLR-1S'],
    ['blackjackbj1', '海盗旗 BJ-1'], ['blackjackbj1db', '海盗旗 BJ-1DB'], ['blackknightbl6bknt', '黑骑士 BL-6B-KNT'],
    ['blackknightbl6knt', '黑骑士 BL-6-KNT'], ['bullsharkbskm3', '牛鲨 BSK-M3'], ['bullsharkbskmaz', '牛鲨 BSK-MAZ'],
    ['cataphractctf0x', '重甲铁骑 CTF-0X'], ['cataphractctf1x', '重甲铁骑 CTF-1X'], ['catapultcpltc1', '弩炮 CPLT-C1'],
    ['catapultcpltc4', '弩炮 CPLT-C4'], ['catapultcpltk2', '弩炮 CPLT-K2'], ['centurioncn9a', '百夫长 CN9-A'],
    ['centurioncn9al', '百夫长 CN9-AL'], ['cicadacda2a', '蝉 CDA-2A'], ['cicadacda3c', '蝉 CDA-3C'],
    ['commandocom1b', '突击者 COM-1B'], ['commandocom2d', '突击者 COM-2D'], ['crabcrb20', '蟹 CRB-20'],
    ['crabcrb27b', '蟹 CRB-27b'], ['cyclopscp10hq', '独眼巨人 CP-10-HQ'], ['cyclopscp10q', '独眼巨人 CP-10-Q'],
    ['cyclopscp10z', '独眼巨人 CP-10-Z'], ['dragondrg1n', '龙 DRG-1N'], ['enforcerenf4r', '执法官 ENF-4R'],
    ['firejavelin', '标枪'], ['firejavelinjvn10f', '标枪 JVN-10F'], ['firestarterfs9h', '纵火犯 FS9-H'],
    ['fleafle15', '跳蚤 FLE-15'], ['fleafle4', '跳蚤 FLE-4'], ['granddragondrg1g', '巨龙 DRG-1G'],
    ['grasshopperghr5h', '蚱蜢 GHR-5H'], ['griffingrf1n', '狮鹫 GRF-1N'], ['griffingrf1s', '狮鹫 GRF-1S'],
    ['griffingrf2n', '狮鹫 GRF-2N'], ['hatchetmanhct3f', '斧王 HCT-3F'], ['hatchetmanhct3x', '斧王 HCT-3X'],
    ['highlanderhgn732b', '高地勇士 HGN-732b'], ['highlanderhgn733', '高地勇士 HGN-733'], ['highlanderhgn733p', '高地勇士 HGN-733P'],
    ['hunchbackhbk4g', '驼背 HBK-4G'], ['hunchbackhbk4p', '驼背 HBK-4P'], ['jagermechjm6a', '机甲猎手 JM6-A'],
    ['jagermechjm6s', '机甲猎手 JM6-S'], ['javelinjvn10n', '标枪 JVN-10N'], ['jennerjr7d', '詹纳 JR7-D'],
    ['kingcrabkgc0000', '帝王蟹 KGC-0000'], ['kingcrabkgcv0000', '帝王蟹'], ['kintarokto18', '金太郎 KTO-18'],
    ['locustlct1e', '蝗虫 LCT-1E'], ['locustlct1m', '蝗虫 LCT-1M'], ['locustlct1s', '蝗虫 LCT-1S'],
    ['locustlct1v', '蝗虫 LCT-1V'], ['maraudermad2r', '掠夺者 MAD-2R'], ['maraudermad3d', '掠夺者 MAD-3D'],
    ['maraudermad3r', '掠夺者 MAD-3R'], ['maraudermadbh', '掠夺者 MAD-BH'], ['maraudermadcm', '掠夺者 MAD-CM'],
    ['orionon1k', '猎户座 ON1-K'], ['orionon1v', '猎户座 ON1-V'], ['pantherpnt9r', '黑豹 PNT-9R'],
    ['phoenixhawkpxh1', '凤凰 PXH-1'], ['phoenixhawkpxh1b', '凤凰 PXH-1B'], ['phoenixhawkpxh1k', '凤凰 PXH-1K'],
    ['quickdrawqkd4g', '闪击 QKD-4G'], ['quickdrawqkd5a', '闪击 QKD-5A'], ['ravenrvn1x', '渡鸦 RVN-1X'],
    ['ravenrvn3x', '渡鸦 RVN-3X'], ['riflemanrfl3c', '步枪手 RFL-3C'], ['riflemanrfl3n', '步枪手 RFL-3N'],
    ['riflemanrfl4d', '步枪手 RFL-4D'], ['riflemanrflrip', '步枪手 RFL-RIP'], ['shadowhawkshd2d', '影鹰 SHD-2D'],
    ['shadowhawkshd2h', '影鹰 SHD-2H'], ['spidersdr5k', '蜘蛛 SDR-5K'], ['spidersdr5v', '蜘蛛 SDR-5V'],
    ['stalkerstk3f', '潜行者 STK-3F'], ['suburbanmech', '小都市战甲'], ['suburbanmechumr90', '小都市战甲 UM-R90'],
    ['thunderbolttdr5s', '雷电 TDR-5S'], ['thunderbolttdr5se', '雷电 TDR-5SE'], ['thunderbolttdr5ss', '雷电 TDR-5SS'],
    ['trebuchettbt5n', '投石机 TBT-5N'], ['trebuchettbt7k', '投石机 TBT-7K'], ['urbanmechumr60', '都市战甲 UM-R60'],
    ['urbanmechumr60l', '都市战甲 UM-R60L'], ['victorvtr9b', '胜利者 VTR-9B'], ['victorvtr9s', '胜利者 VTR-9S'],
    ['vindicatorvnd1aa', '捍卫者 VND-1AA'], ['vindicatorvnd1r', '捍卫者 VND-1R'], ['vulcanvl2t', '火神 VL-2T'],
    ['vulcanvl5t', '火神 VL-5T'], ['warhammerwhm6d', '战锤 WHM-6D'], ['warhammerwhm6r', '战锤 WHM-6R'],
    ['warhammerwhm7a', '战锤 WHM-7A'], ['wolverinewvr6k', '狼獾 WVR-6K'], ['wolverinewvr6r', '狼獾 WVR-6R'],
    ['zeuszeu5t', '宙斯 ZEU-5T'], ['zeuszeu6s', '宙斯 ZEU-6S'], ['zeuszeu6t', '宙斯 ZEU-6T'],
    // >>> MECH-KEYS END
  ];
  const PILOT_KEYS = [
    // >>> PILOT-KEYS BEGIN (由 tools/gen-pilot-keys.mjs 从 corpus/pilot-names.tsv 生成, 勿手改)
    // 呼号 35 条 + 名/姓 153 条 = 188 条 (人工翻译)
    // --- 呼号 ---
    ['apex', '巅峰'], ['arclight', '弧光'], ['behemoth', '巨兽'],
    ['buckshot', '霰弹'], ['coach', '教练'], ['corsair', '海盗'],
    ['deadeye', '神射手'], ['dekker', '德克尔'], ['falcon', '猎鹰'],
    ['flatline', '平线'], ['gargoyle', '石像鬼'], ['glitch', '故障'],
    ['hammer', '铁锤'], ['jester', '小丑'], ['kraken', '海怪'],
    ['mastiff', '獒犬'], ['medusa', '美杜莎'], ['mockingbird', '仿声鸟'],
    ['omega', '欧米茄'], ['ozone', '臭氧'], ['paladin', '圣骑士'],
    ['paradise', '天堂'], ['pontoon', '浮桥'], ['rook', '车'],
    ['shoe', '鞋'], ['showboat', '炫耀'], ['strider', '神行者'],
    ['sumo', '相扑'], ['tbone', 'T骨'], ['thresher', '长尾鲨'],
    ['trigger', '扳机'], ['whisper', '低语'], ['whistler', '口哨'],
    ['wildfire', '野火'], ['witness', '见证者'],
    // --- 名/姓 ---
    ['aadya', '阿迪娅'], ['aaron', '亚伦'], ['abe', '阿贝'],
    ['adalwulf', '阿达尔武尔夫'], ['adam', '亚当'], ['aguilera', '阿吉莱拉'],
    ['ahn', '安'], ['aidan', '艾丹'], ['akashi', '明石'],
    ['ala', '阿拉'], ['alarcon', '阿拉尔孔'], ['aleksandr', '亚历山大'],
    ['alioth', '阿利奥斯'], ['alistair', '阿利斯泰尔'], ['aliyev', '阿利耶夫'],
    ['amanda', '阿曼达'], ['amir', '阿米尔'], ['andaelas', '安代拉斯'],
    ['anja', '安雅'], ['astraeus', '阿斯特赖俄斯'], ['auri', '奥里'],
    ['benitez', '贝尼特斯'], ['bennett', '贝内特'], ['bixby', '比克斯比'],
    ['bjrn', '比约恩'], ['bloodstone', '血石'], ['bodenstedt', '博登施泰特'],
    ['bono', '博诺'], ['bozeman', '博兹曼'], ['bray', '布雷'],
    ['brett', '布雷特'], ['bronski', '布朗斯基'], ['carine', '卡琳'],
    ['castro', '卡斯特罗'], ['chang', '张'], ['chernovskaya', '切尔诺夫斯卡娅'],
    ['chik', '奇克'], ['christoph', '克里斯托夫'], ['chung', '钟'],
    ['colin', '科林'], ['cornichon', '科尔尼雄'], ['daksis', '达克西斯'],
    ['damestoir', '达梅斯图尔'], ['dannen', '丹嫩'], ['dardai', '达尔代'],
    ['delvillar', '德尔维拉尔'], ['diana', '黛安娜'], ['doochin', '杜钦'],
    ['doukas', '杜卡斯'], ['dubrovski', '杜布罗夫斯基'], ['duncan', '邓肯'],
    ['durand', '杜兰德'], ['edward', '爱德华'], ['einar', '埃纳尔'],
    ['eric', '埃里克'], ['erin', '艾琳'], ['farida', '法里达'],
    ['fuentes', '富恩特斯'], ['garrat', '加勒特'], ['gerhard', '格哈德'],
    ['godfrey', '戈弗雷'], ['hadden', '哈登'], ['halder', '哈尔德'],
    ['hayes', '海斯'], ['heinrici', '海因里希'], ['holmgren', '霍尔姆格伦'],
    ['hummel', '胡梅尔'], ['huxley', '赫胥黎'], ['james', '詹姆斯'],
    ['jason', '杰森'], ['jeffrey', '杰弗里'], ['jeremiah', '杰里迈亚'],
    ['jessica', '杰西卡'], ['john', '约翰'], ['johnson', '约翰逊'],
    ['josh', '乔什'], ['joshua', '约书亚'], ['juliana', '朱莉安娜'],
    ['karina', '卡琳娜'], ['kenrik', '肯里克'], ['kowalski', '科瓦尔斯基'],
    ['krauss', '克劳斯'], ['kyone', '京音'], ['lamb', '兰姆'],
    ['lantalia', '兰塔利亚'], ['lars', '拉尔斯'], ['liadar', '利亚达尔'],
    ['llana', '拉娜'], ['lorenzo', '洛伦佐'], ['lunari', '卢纳里'],
    ['maclaren', '麦克拉伦'], ['marcus', '马库斯'], ['marisol', '玛丽索尔'],
    ['marsin', '马辛'], ['matthew', '马修'], ['mckinney', '麦金尼'],
    ['mcrae', '麦克雷'], ['mehra', '梅赫拉'], ['metke', '梅特克'],
    ['michael', '迈克尔'], ['miranda', '米兰达'], ['mizrahi', '米兹拉希'],
    ['mohammed', '穆罕默德'], ['morrow', '莫罗'], ['navarro', '纳瓦罗'],
    ['nick', '尼克'], ['nicolette', '妮可莱特'], ['octavio', '奥克塔维奥'],
    ['orchid', '奥奇德'], ['osis', '奥西斯'], ['page', '佩奇'],
    ['paige', '佩吉'], ['peter', '彼得'], ['phaelon', '费隆'],
    ['popovi', '波波维奇'], ['raldoron', '拉尔多隆'], ['rand', '兰德'],
    ['reggie', '雷吉'], ['reichenbach', '赖兴巴赫'], ['risenki', '里森基'],
    ['ryia', '里亚'], ['samson', '萨姆森'], ['sandy', '桑迪'],
    ['scott', '斯科特'], ['shiseoyen', '希塞奥-延'], ['simonsen', '西蒙森'],
    ['slipais', '斯利帕伊斯'], ['soren', '索伦'], ['sosa', '索萨'],
    ['stevenson', '史蒂文森'], ['sven', '斯文'], ['talon', '利爪'],
    ['tane', '塔内'], ['teo', '特奥'], ['thesteelbeast', '钢铁巨兽'],
    ['thomas', '托马斯'], ['tilson', '蒂尔森'], ['todd', '托德'],
    ['tony', '托尼'], ['toraldsen', '托拉尔森'], ['upton', '厄普顿'],
    ['veisi', '韦西'], ['vincent', '文森特'], ['viona', '维奥娜'],
    ['vonkaas', '冯·卡斯'], ['voyls', '沃伊尔斯'], ['whitney', '惠特尼'],
    ['winzar', '温扎'], ['woods', '伍兹'], ['zachary', '扎卡里'],
    ['zebak', '泽巴克'], ['zhou', '周'], ['zin', '津'],
    // >>> PILOT-KEYS END
  ];
  const added = [];
  for (const [k, v] of [...MECH_KEYS, ...PILOT_KEYS]) {
    if (merged.has(k) || keyOrder.indexOf(k) >= 0) continue;
    merged.set(k, v);
    keyOrder.push(k);          // 追加在末尾, 官方 key 的相对顺序不受影响
    added.push(k);
  }
  console.log(`机甲/呼号名 key: 补入 ${added.length} 条`);
}

// ---- 机甲"常备角色"译名 (用户人工翻译, corpus/stock-role-zh.tsv) ----
// 与机甲名同一个机制: 数据文件里的英文字符串规范化后当 key 查 CSV, 缺 key 就显示英文。
// 与机甲名的区别: 这些角色 key 有一部分【已经在官方列表里】(值是前几轮的机翻),
// 所以这里既要覆盖已有的值, 也要追加缺失的 key (例如 juggernaut / direct-firesupport / scout/hunter-killer)。
{
  // >>> ROLE-ZH BEGIN (由 tools/gen-role-zh.mjs 生成, 勿手改)
  // 机甲"常备角色"(chassisdef 的 StockRole) 译名 —— 用户人工翻译, 权威来源 corpus/stock-role-zh.tsv
  // 注意: 已存在的 key 会被这里的值覆盖; 不在官方列表里的 key 由应用段追加。
  const ROLE_ZH = [
    ['brawler', '格斗'], ['brawler&closeassault', '格斗与近距突击'], ['brawler&electronicwarfare', '格斗与电子战'],
    ['brawler&generalassault', '格斗与通用突击'], ['brawler&rangedassault', '格斗与远程突击'], ['brawler&skirmisher', '格斗与游击'],
    ['cavalry&firesupport', '骑兵与火力支援'], ['cavalry&scout', '骑兵与侦察'], ['command&firesupport', '指挥与火力支援'],
    ['direct-firesupport', '直瞄火力支援'], ['extremelyfastscout', '极速侦察'], ['extremelymaneuverablescout', '高机动侦察'],
    ['faststrikercavalry', '快速突击骑兵'], ['firesupport', '火力支援'], ['firesupport&brawler', '火力支援与格斗'],
    ['firesupport&rangedassault', '火力支援与远程突击'], ['firesupport&skirmisher', '火力支援与游击'], ['heavybrawler', '重型格斗'],
    ['heavybrawler&closeassault', '重型格斗与近距突击'], ['heavybrawler&sniper', '重型格斗与狙击'], ['heavycavalry', '重型骑兵'],
    ['heavycavalry&closeassault', '重型骑兵与近距突击'], ['heavydefender', '重型防御'], ['heavyfiresupport', '重型火力支援'],
    ['heavyfiresupport&defender', '重型火力支援与防御'], ['heavyskirmisher', '重型游击'], ['heavyskirmisher&brawler', '重型游击与格斗'],
    ['heavyskirmisher&cavalry', '重型游击与骑兵'], ['heavysniper&defender', '重型狙击与防御'], ['heavystriker&disabler', '重型突击与致瘫'],
    ['juggernaut', '重装'], ['juggernaut&closeassault', '重装与近距突击'], ['juggernaut&heavycavalry', '重装与重型骑兵'],
    ['juggernaut&rangedassault', '重装与远程突击'], ['juggernaut^sniper^&heavycavalry', '重装、狙击与重型骑兵'], ['lightfiresupport', '轻型火力支援'],
    ['lightsniper&scout', '轻型狙击与侦察'], ['lightstriker&scout', '轻型突击与侦察'], ['missileboat', '导弹平台'],
    ['rangedassault', '远程突击'], ['recon&electronicwarfare', '侦察与电子战'], ['scout&disabler', '侦察与致瘫'],
    ['scout&harasser', '侦察与袭扰'], ['scout&sniper', '侦察与狙击'], ['scout/hunter-killer', '侦察 / 猎杀'],
    ['skirmisher', '游击'], ['skirmisher&brawler', '游击与格斗'], ['skirmisher&cavalry', '游击与骑兵'],
    ['skirmisher&sniper', '游击与狙击'], ['sniper', '狙击'], ['sniper&direct-firesupport', '狙击与直瞄火力支援'],
    ['sniper&firesupport', '狙击与火力支援'], ['sniper&lightbrawler', '狙击与轻型格斗'], ['striker', '突击'],
    ['striker&skirmisher', '突击与游击'], ['strikercavalry', '突击骑兵'],
  ];
  // >>> ROLE-ZH END
  let set = 0, add = 0;
  for (const [k, v] of ROLE_ZH) {
    const had = merged.has(k) || keyOrder.indexOf(k) >= 0;
    if (had) {
      if (merged.get(k) !== v) { merged.set(k, v); set++; }
    } else {
      merged.set(k, v);
      keyOrder.push(k);        // 追加在末尾, 官方 key 的相对顺序不受影响
      add++;
    }
  }
  console.log(`常备角色译名: 覆盖 ${set} 条, 新增 key ${add} 条 (共 ${ROLE_ZH.length} 条)`);
}

// ---- 机甲部件"制造商"译名 (用户人工翻译, corpus/manufacturers-zh.tsv) ----
// 同一个机制: 数据文件 Description.Manufacturer 的英文字符串规范化后当 key 查 CSV, 缺 key 显示英文。
// 与常备角色一样, 一部分 key 已在官方列表里(早期机翻, 要覆盖), 一部分要新追加。
{
  // >>> MFR-ZH BEGIN (由 tools/gen-manufacturer-keys.mjs 生成, 勿手改)
  // 机甲部件"制造商"(数据文件 Description.Manufacturer) 译名 —— 用户人工翻译,
  // 权威来源 corpus/manufacturers-zh.tsv (三种策略的原稿留档在 corpus/manufacturers-src/)。
  // 注意: 已存在的 key 会被这里的值覆盖; 不在官方列表里的 key 由应用段追加。
  // 未列入的纯缩写厂商 (RCA / SCI / VMI) 按用户要求保留英文, 不给 key。
  const MFR_ZH = [
    ['blankenburg25', '布兰肯堡 25'], ['blazefire', '烈焰军工'], ['brigadier', '准将防务'],
    ['brightbloom', '耀光科技'], ['ceresarms', '谷神星军械'], ['ceresmetals', '谷神金属'],
    ['coventry', '考文垂'], ['defiance', '挑战者工业'], ['delta', '德尔塔'],
    ['diverseoptics', '万象光学'], ['donal', '多纳尔'], ['exostar', '异星工业'],
    ['federated', '联邦工业'], ['firmir', '弗米尔'], ['friedhof', '弗里德霍夫'],
    ['generic', '通用组件'], ['gm', '通用机械'], ['hartford', '哈特福德'],
    ['hellion', '狱火工业'], ['hermes', '赫尔墨斯'], ['holly', '霍利'],
    ['hotshot', '王牌军工'], ['imperator', '帝王工业'], ['intek', '因泰克'],
    ['irian', '伊瑞恩'], ['jackson', '杰克逊'], ['kaliyama', '迦梨·夜摩'],
    ['kallon', '卡隆'], ['konginterstellar', '金刚星际'], ['krupp', '克虏伯'],
    ['longfire', '远火军工'], ['magna', '玛格纳'], ['magna400p', '玛格纳 400P'],
    ['magnavi', '玛格纳 VI'], ['majestymm', '威严金属制造'], ['martell', '马特尔'],
    ['maxellmetals', '麦克赛尔金属'], ['mydron', '迈德隆'], ['olympus', '奥林匹斯'],
    ['pitban', '皮特班'], ['rakeriv', '雷克 IV'], ['rawlings', '罗林斯'],
    ['robinsonstandardbattleworks', '罗宾逊标准战斗工业'], ['skylight', '曙光科技'], ['sperrybrowning', '斯佩里·勃朗宁'],
    ['starcorps', '星团工业'], ['telos', '泰洛斯'], ['tharhes', '塔尔赫斯'],
    ['thunderbolt12', '霹雳 12'], ['tiegart', '蒂加特'], ['valiant', '英勇工业'],
    ['western', '西部工业'], ['zeus', '宙斯'], ['starcorp', '星团工业'],
    ['stormvanger', '斯托姆万格'], ['fusigon', '弗西贡'], ['garret', '加雷特'],
    ['herakleion', '赫拉克利翁'], ['hovertec', '霍弗泰克'], ['livingstonceramics', '利文斯顿陶瓷'],
    ['shengliarms', '胜利军械'],
  ];
  // >>> MFR-ZH END
  let set = 0, add = 0;
  for (const [k, v] of MFR_ZH) {
    const had = merged.has(k) || keyOrder.indexOf(k) >= 0;
    if (had) {
      if (merged.get(k) !== v) { merged.set(k, v); set++; }
    } else {
      merged.set(k, v);
      keyOrder.push(k);        // 追加在末尾, 官方 key 的相对顺序不受影响
      add++;
    }
  }
  console.log(`制造商译名: 覆盖 ${set} 条, 新增 key ${add} 条 (共 ${MFR_ZH.length} 条)`);
}

// ---- 机甲详细描述 (用户逐条精修, corpus/mech-desc-zh.tsv) ----
// 同一个机制: chassisdef 的 Description.Details 规范化后当 key 查 CSV, 缺 key 就显示英文。
// 绝大多数 key 在官方列表里(早期机翻, 要覆盖); 个别官方从未本地化的(如 Shadow Hawk SHD-2D)要追加。
{
  // >>> CHASSIS-DESC BEGIN (由 tools/gen-chassis-desc.mjs 生成, 勿手改)
  // 机甲详细描述 (chassisdef 的 Description.Details) 中译文 —— 用户逐条精修,
  // 权威来源 corpus/mech-desc-zh.tsv (原始表格 corpus/mech-descriptions-to-refine.xlsx)。
  // 注意: 这里的值已经是 CSV 形态(引号写成两个); 已存在的 key 会被覆盖, 官方没有的 key 由应用段追加。
  const CHASSIS_DESC = [
    ['knownastheatlasii^thed-htmodelcarriesmoreenergyweaponryandusuallyalighter^moreflexibleautocannon*itstillhasunbelievableprotectionandthesamecrushingmeleeabilityasotheratlasmodels*',
     '被称作""宇宙神II""的D-HT型携带了更多的能量武器，以及一门通常更为轻便、灵活的自动炮。它依然有着难以置信的防护，并且和其它型号的""宇宙神""一样具有毁灭性的近战能力。'],
    ['theatlasdisthekingofthebattlefield^capableofbringingadizzyingarrayofweaponstobearontargetsatanyrange*itisalsonoteworthyfornormallymountingthemaximumamountofarmorpossible*fewopponentscansurviveevenbriefcontactwiththismonster*',
     '""宇宙神""D是战场之王，它令人眼花缭乱的武器组能压迫任意距离的目标。值得注意的是，通常情况下它都装备着最大限度的装甲。几乎没有对手能在和这个怪物的接触中幸存下来，哪怕只是短暂的一刻。'],
    ['amechthattrulylivesuptoitsname!theawesome8qmountsafrighteningtrioofppcsthatcandestroy^knockdown^ordebilitateanytargetinnotime*itsungainly^butitcanshrugoffhugeamountsofincomingfire*',
     '一种名副其实的机甲！""可畏""8Q安装了可怕的三联粒子炮组合，能在瞬间摧毁、打倒或者削弱任何目标。它虽然笨拙，但是能轻松扛下大量的来袭炮火。'],
    ['theawesome8tisasuperbfiresupportmech^thoughitsheavyarmorisabitwastedinthatrole*itcanstillputupagoodfightatmediumranges^anditcancrushsmallerunitsoutrightwithmeleeattacks*',
     '""可畏""8T是一种极佳的火力支援机甲，不过它身上厚重过头的装甲显得有点浪费。它擅长在中距离作战，也能用近战攻击彻底碾碎比它更小的单位。'],
    ['thebanshee3ewasoriginallydesignedforclosecombat^withbetterspeedthanmostotherassaultmechs*whileithasheavyarmorandpowerfulmeleeattackcapability^itsfirepowerisseverelylackinganditcanstillbeflankedbylighterunits*',
     '""女妖""3E起初被设计用于近战，速度比其它绝大多数的突击型机甲都快。尽管它有着厚重的装甲以及强大的近战攻击能力，但它严重缺乏火力，也容易被轻型单位袭击侧面。'],
    ['thebanshee3mmountsrespectableweaponrywithbetter-than-averagespeedandarmor*thiscomesatthecostofverypoorheatmanagement*itsgoodathuntinglighterunits^especiallyifitcanclosetomeleerange*',
     '""女妖""3M装备了相当好的武器，有着好于平均的速度和装甲，代价则是十分差劲的热量管理。它长于猎杀轻型单位，特别是进入到近战距离的时候。'],
    ['thebanshee3ssacrificesitstrademarkspeedforalargeexpansioninfirepower*the3sfillstheroleofawellarmoredsniper^sportingtwoppcsandanac10whilestillbeingcapableofinflictingheavymeleedamage*',
     '""女妖""3S牺牲了自己招牌的速度，换来火力上的极大扩展。3S型作为一个防护良好的狙击手角色，装备了两门粒子炮和一门AC/10自动炮，同时依然可以造成不俗的近战伤害。'],
    ['versatileandpowerful^thebattlemaster1gisoneofthebestknownbattlemechsinexistence*normallymountingavariedarrayofenergyweapons^thebattlemastercanengageenemiesatanyrangeandpacksapowerfulpunch*',
     '""战神""1G既强大，用途又广，是现存最著名的机甲之一。""战将""通常装有各种各样的能量武器组，能在任何距离上与敌人交战并打出强有力的攻击。'],
    ['theblr-1gbisanenhancedbattlemastervariantthatwasdevelopedforthesldfsroyaldivisions*thismodelboastssuperbweaponry^armor^andheatmanagementsystems*extremelyrareandexpensive^butworththeprice*',
     'BLR-1GB是一种增强型""战神""变型机，是为星际联盟防卫军的皇家军团开发的。这种型号拥有出色的武器、装甲和热量管理系统。虽然极其稀有、昂贵，但它值这个价。'],
    ['theblr-1sshiftsthebattlemastersfocustomissile-basedfiresupport^extendingitsrangeandattackflexibilitywhileatthesametimeincreasingheatefficiency*itswell-armored^butlacksinraw^close-infirepower*',
     'BLR-1S型将""战神""的重点转移到了导弹式火力支援上，扩大了射程和攻击的灵活性，同时提高了热效率。它的装甲良好，但缺乏原装的近距火力。'],
    ['blackjack1saresolid^well-roundedmechsfortheirtonnage*theytypicallymountjumpjets^whichgivethemanextraedgebyrepositioningquicklytokeepadirectlineoffirefortheirautocannons*',
     '""海盗旗""1在它们这个吨位属于坚实可靠、面面俱到的机甲。它们通常所装的跃进喷射器赋予了它们额外的优势，可以通过快速变换射击位置让自动炮保持直瞄射击线。'],
    ['withthebj-1db^thefederatedsunshaverevisedtheblackjackintoadedicatedfiresupportmech*the1dbstwolargelaserscanburnthroughheavily-armoredtargetsatlongrangewithoutsacrificingamediummechsmaneuverability*',
     '在BJ-1DB上，恒星联邦将""海盗旗""改造成了一种专用火力支援机甲。1DB型的两支大型激光可以在远距离烧穿重甲目标，同时并没有牺牲一部中型机甲该有的机动性。'],
    ['theblackknight6-kntisadedicatedenergyweaponplatform*itcanshellouthellishdamagewithitsbeamsandshrugoffalotofdamagejustgottamakesuretokeepitsheatincheck*',
     '""黑骑士""6-KNT是一种专用的能量武器平台。它能用光束打出地狱般的伤害，还能硬扛下大量损伤……只是要确保持续关注它的发热情况。'],
    ['theblackknight6bwastheharder-hitting^cooler-runningstarleagueancestortothestandardbl-6-kntwehavetoday*itdideverythingthe6does^butbettermostlythankstoitsdoubleheatsinks^whicharebasicallynonexistentthesedays*',
     '和我们今天拥有的标准型BL-6-KNT相比，""黑骑士""6B是更能打、运转温度也更低的星际联盟前辈。6型能做的事它都能做，而且做得更好——这大多要归功于它的双重散热器，如今这种散热器基本上已经绝迹了。'],
    ['wecallthecataphractafrankenmechbecauseitsgotalittlebitofeverythingstitchedtogetheronit*the1xmodelworkswellatmedium-longtocloserrange^withgoodarmorandweaponry*',
     '我们管""重甲铁骑""叫""拼装机甲""，因为它身上拼着五花八门的东西。1X型在中远程到较近距离的作战中都表现良好，装甲和武器也都不错。'],
    ['ah^thecatapultc1*justlikeitsnamesake^itsgoodatlobbinglargenumbersofmissilesoverterrainwithoutfearofreturnfire*surprisingly^itsalsonottooshabbyatcloserrangesinapinch*',
     '啊，""弩炮""C1。就跟它的名字一样，它擅长越过地形抛射大量的导弹，因此不太容易遭到还击。令人惊讶的是，在不得不近距离战斗的紧要关头，它也绝不脆弱。'],
    ['allcatapultvariantsarefundamentallyartilleryplatforms*thecplt-c4isoptimizedformassedlrmfire*thatoptimizationcostsitflexibilitycomparedtotheoriginalc1*lackingthec1smediumlasers^thec4isusuallykeptatlongrangeinafiresupportrole*',
     '所有的""弩炮""变型机从根本上讲都是炮兵平台。CPLT-C4型为大量长程导弹（LRM）火力做了优化。优化的代价是任务弹性不如最初的C1型。由于缺乏C1型的中型激光，C4型一般留在远距离上担任火力支援角色。'],
    ['thecatapultk2isanoutside-the-boxredesignthattradestheindirect-firecapabilityforheavierdirect-fireppcs*itdoesntusuallymountjumpjets^though^soitcanbeabitmorerestrictedinitsuse*',
     '""弩炮""K2是一种跳出常规的再设计型号，它舍弃了一定的间瞄射击能力，换来了更强大的直瞄粒子炮。不过它一般不安装跃进喷射器，所以在使用上会受到更多的限制。'],
    ['asturdyandreliablemech^thecenturionisgoodatbothtakingandgivingabeating*cn9-amodelsareabletoengageatanyrange^buttheirdamagecurveincreasesastheyapproachatarget*',
     '作为一种结实可靠的机甲，""百夫长""既擅长挨打又擅长打人。CN9-A型可以在任何距离上交火，但它们越接近目标，越容易打出高额伤害。'],
    ['thealvariantofthecenturiontendstotradethelargerburstdamageofanautocannonformoreenergyweaponryandheavierarmor*alscantakeanincredibleamountofdamagefortheirsizebutstillpackagoodpunch*',
     '""百夫长""的AL型倾向于用自动炮强大的爆发伤害换来更多能量武器和更重的装甲。AL型可以承受相对它们这个尺度而言非常多的伤害，之后还依然能重拳出击。'],
    ['thecenturionaisdesignedtocomplementthetrebuchetasaspotteranddirect-linemech*inadditiontoeightandahalftonsofarmor^thecn9-aisarmedwithanac/10^twomediumlasers^andanlrm-10rack^makingitbothpowerfulandversatile*',
     '""百夫长""A是为了补充""投石机""在协同作战时缺乏观测员和直射机甲的角色而诞生的。除了8.5吨装甲，CN9-A还装有一门AC/10自动炮、两支中型激光，还有一套LRM-10长程导弹，使它既强大又多面。'],
    ['inallhonesty^cicadasasaruleareveryfragile*the2amodelwasdesignedtobeasfastasanylightmech^butthatmassiveengineleaveslittleroomformuchelse*still^ifyouuseitcautiously^itcanbeasuccessfulscoutanddiversion*',
     '老实说，""蝉""式机甲一般是很脆弱的。2A型的设计初衷是和任何轻型机甲一样快，但巨大的引擎没有为其它应用留下多少空间。不过，如果你谨慎使用它的话，它还是可以成为成功的尖兵和诱饵。'],
    ['thecicada3cisslightlyslowerthanthe2abuthasmoreroomforweaponryandarmor*itstillgenerallyunderperformsinmostareasexceptspeed^butitcanputupmoreofafight^withbettersurvivalrates*',
     '""蝉""3C比2A型稍慢一些，但是有更多的空间用于武器和装甲。除了速度之外，它在其他方面的表现依然普遍不佳，但是它的存活率更高，能进行更多的战斗。'],
    ['thelargelasermountedbymost1bmodelsisnothingtosniffat^butitlackstheclose-upimpactofthesrmsitreplaces*besttokeeptheseunitsatrangeforflankingandspotting*',
     '大多数""突击者""1B型装备的大型激光不容小看，它虽然换上了短程导弹，但在近距离上仍然缺乏足够的冲击力。最好让这些单位保持距离进行包抄或观察。'],
    ['withallthosesrms^thecom-2dislikeasmall^highlymobileshotgunthatcantakedownmechstwiceitssizeorbigger*youvegottabecarefulwithit^though^becauseitsnotmeanttotakemuchofabeating*',
     '有了那些短程导弹，""突击者""COM-2D就像一把小型、高机动的霰弹枪，能击倒两倍于它、甚至更大的机甲。不过你也得小心，它并不抗揍。'],
    ['thedragon1nisabeefymachinethatcantakeaseriousbeatingbuttendstobeabitlightonweaponry*itmovesfastforaheavymech^though^whichmakesitwellsuitedtoclosingformeleeattacksagainstslowertargets*',
     '""龙""1N是一台粗壮的机器，能承受重击，但是武装有点弱。不过，对重型机甲而言它相当快，适合接近缓慢的目标进行近战攻击。'],
    ['enforcer4rmodelscombinetheheftypowerofanautocannonandmassivelaserwiththemobilityofjumpjetsadeadlycombination*abletoengageatmedium-longallthewaytopoint-blankrange^thesemechsareflexibleandsurprisingincombat*',
     '""执法官""4R型结合了一门自动炮与大量激光的猛烈威力，以及跃进喷射器的机动性——这是个致命的组合。从中远距离到近身距离，这些机甲都可以进行作战，在战斗中既灵活又出其不意。'],
    ['thefirestarterisadangerousmechforitstonnagecarefullytimedattackswithitsflamerscanshutdownanymechandleaveitopentopunishmentfromyourotherforces*thefs9-halsomakesadecentlightmechhunter-killer*',
     '""纵火犯""就它那个吨位而言是一种危险的机甲——时机恰当的喷火器攻击能让任何机甲过热关机，让它们毫无防御地承受来袭的攻击。FS9-H也是一种相当好的轻型""机甲猎手""。'],
    ['thegranddragonswapsoutthedrg-1nsautocannonforappcandadditionalheatmanagement*thedrg-1gisafastmechforitssize^withsolidprotectionandapowerfulpunch*',
     '""巨龙""用""龙""DRG-1N机甲的自动炮换来了一门粒子炮和额外的热量管理能力。DRG-1G在它所在的级别里算是一种快速机甲，同时也具有坚固的防护和强大的攻击能力。'],
    ['dontbefooledbyitswhimsicalnamethegrasshopperisakillerthatspecializesinhuntingdownlightandmediummechs*itssuperbjumpabilityandgoodarmorallowittogetbehindfoeseasilytobringitsall-energyweaponstobear*',
     '别被它离谱的名字迷惑了——""蚱蜢""是一种专门猎杀轻型和中型机甲的杀手。卓越的跳跃能力和良好的装甲让它能轻易跑到对手身后，让对手承受它的能量武器攻击。'],
    ['griffin1nsusetheirjumpjetstostayatrangeandpelttheiropponentsfromrelativesafety*1nscanrunhotiftheyspendalltheirtimeboundingaroundthebattlefieldtakingpotshots^though*',
     '""狮鹫""1N利用自身的跃进喷射器来保持距离，并从相对安全的位置攻击对手。虽然如此，如果让1N型一直围绕战场跳跃着胡乱射击，它就会过热。'],
    ['griffin1ssmountcloser-rangeweaponrythantheir1ncousins^allowingthemtojumpinforcloserattacksandthenmoveawaytodisengageorflank*theyregenerallybetteratdealingwithheatbuildup^too*',
     '和它们的兄弟型号1N型相比，""狮鹫""1S安装了较近射程的武器，使它们能跳到近处发动近距离攻击，然后脱离战斗或迂回。在处理热量积累上它们一般也更好一些。'],
    ['thegriffin2nisanoldstarleaguemodelthatwasamongthemostversatilemechsinitsheyday*itsweaponsgeneratedalotofheat^buttheolddoubleheatsinkswereputintohandleit*itsalmostimpossibletofindthoseanymore^though*',
     '""狮鹫""2N是一种老式的星际联盟型号，在它的鼎盛时期是用途最多的一种机甲。它的武器会产生许多热量，但安装了古老的双重散热器来加以控制。不过，已经很难再找到双重散热器了。'],
    ['thehighlander732bisanancientmodelfromthestarleaguedays!itsgaussriflewasaterrifyingweaponthatgaveitahugepunchatalmostanyrangebutyoucantfindthoseanymore*andofcourse^itstillhasthejumpcapabilityitsalwaysbeenknownfor*',
     '""高地勇士""732B是一种星际联盟时代的远古型号！它的高斯线膛炮是一种恐怖的武器，使它能在几乎任何距离上都造成巨大的破坏——但你在市面上几乎再也找不到那种炮了。当然，它依然拥有为人熟知的跳跃能力。'],
    ['thehighlander733isoneofthefewjump-capableassaultmechs*amixtureofmedium-andlong-rangeweaponryensuresthatwhilethehighlanderexcelsatnoparticularrole^itisdecentatallofthem*',
     '""高地勇士""733是少数拥有跳跃能力的突击型机甲中的一员。混编的中远程武器确保""高地勇士""虽然没有在哪个角色上特别突出，但在所有角色的表现上都不俗。'],
    ['thehighlander733pisavariantofthe733modelthatremovesitsautocannonandreplacesitwithappc*italsohandlesheatbuildupbetter*',
     '""高地勇士""733P是一种733型的变型机，将733型的自动炮换成了一门粒子炮。它也能更好地控制热量积累。'],
    ['thehunchback4gisatriedandtestedjuggernautonthefield*oneofthelightestmechstomountsuchamassiveautocannon^itiscapableofdestroyingsomelighterunitsinasinglevolley*ittendstomountheavyarmortoboot*',
     '""驼背""4G是在战场上久经考验的重装机甲。它是安装了此等巨大自动炮的机甲中最轻的一种，能用一次齐射就干掉好几个轻型单位。而且通常还会加装重甲。'],
    ['the4pversionofthehunchbacktradesthesingularimpactofamassiveautocannonforafrighteningarrayoflighterenergyweaponrythatisactuallycapableofdealingmoredamageoverall*thisallcomesatthecostofgreatlyincreasedheatbuildup^ofcourse*',
     '""驼背""的4P型用重型自动炮的单次攻击力换来了可怕、轻量化的能量武器组，综合来说它们能够造成更多的伤害。当然了，这一切也付出了热量积累大幅增加的代价。'],
    ['thejagermechamodelattemptstoprovideanindirect-firesupportplatformthatcandishoutdamagewithouteverbeingseen*ithasloweroverallfocuseddamagecapability^butitusuallymountsdecentarmor*',
     '""机甲猎手""A型试图提供一个间瞄火力支援平台，能在不被发现的情况下造成伤害。虽然总体来说它的短时输出能力不强，但通常都装有不俗的装甲。'],
    ['thejagermechsmodelishighlyspecializedatlong-rangeautocannonfiresupport*itdoesnthavemuchinthewayofprotectionorcloser-rangeweapons^though^sokeepitdistantandoutofharmsway*',
     '""机甲猎手""S型专精于远程自动炮火力支援。不过，它在防护或近程武器方面不强，因此要让它远离伤害。'],
    ['jennerdsrunhot^andtheyrunfastbutcanquicklyboundintocombattodeliveraknockoutpunch^evenagainstheavierunits*theircapabilitywithspeedandweaponrytendstocomeattheexpenseoflowerarmorcapacity^though*',
     '""詹纳""D容易过热，而且热得很快，但能迅速进入战斗发起致命一击，甚至是对付较重的单位。不过，它们在速度和武器上的性能往往是以装甲较少的代价换来的。'],
    ['oneofthemostheavilyarmedandarmoredmechseverconstructed^thekingcrab0000iscapableofmassiveburstdamage*apairofheavy^close-rangeautocannonsformitsprimaryweaponry^backedupbyrangedweaponrytofireasitclosesdistance*',
     '""帝王蟹""0000是现今制造的机甲中武装最多、装甲最重的一种，能造成大量的爆发伤害。一对沉重的近程自动炮构成了它的主要武器，在它抵近敌人的过程中，还有远程武器可以辅助攻击。'],
    ['thekintaro18isabeastofamachine*itsfastforitssize^mountsheavyarmor^andcanliterallyshredmostothermechswithitsalmostridiculousamountofclose-rangeweaponry*but^itrunshotterthanhellssaunas*',
     '""金太郎""18是……一头猛兽。在这个级别里它很快，装有厚重的装甲，能用多得离谱的近程武器真正地撕碎大多数其它的机甲。但是，它会比地狱的桑拿还热。'],
    ['the1elocustpacksonlylasersforitsarmament^forbetteroveralldamagewithouttheriskofammoexplosions*itrunsquiteabithotterthanothervariants^though^soitworksbestwithhit-and-runattacks*',
     '1E型的""蝗虫""只有激光作为武器，以便不用冒弹药殉爆的风险也能获得更好的整体伤害。不过和其它变型机相比，它有点容易过热，所以它最好用于打带跑式的攻击。'],
    ['thelocusts1mmodelisinterestinginthatitcanchurnoutadecentvolleyoflrmsforsuchasmallmech*itsagreatharasser^especiallyifyoucanuseitsspeedtolobmissilesintotheweakerreararmoroftargets*butitnormallyhasalmostnoarmoritself*',
     '""蝗虫""1M型非常有意思，如此之小的机甲却能发起像样的长程导弹齐射。它是很棒的袭扰机，尤其是如果你能够利用好它的速度，将导弹抛向目标薄弱的背部装甲的话。但是一般来说它本身几乎没有装甲。'],
    ['locust1smodelstendtosacrificethelittlearmortheynormallymounttofirerespectablesrmsalvos*definitelyusefulforhit-and-runs^especiallyifthoseshotsprovidetheextrapunchtoknockdownatarget*',
     '""蝗虫""1S型往往会牺牲自身微不足道的装甲来齐射可观的短程导弹。这在打了就跑的作战中相当有用，当这些射击能够为击倒目标提供足够的冲击力时，尤其有用。'],
    ['thebasiclocust1vhasonebigadvantage:speed*itsnotmeanttoputupmuchofafight^butyoudbehard-pressedtofindamechthatgoesfurtherandishardertohit*',
     '基本型号的""蝗虫""1V有个很大的优势：速度。它并不很适合战斗，但你要找到一种比它跑得更远、更难被击中的机甲是非常困难的。'],
    ['themad-2risthemaraudervariantthatwasgiventothesldfsroyaldivisionsbeforethefallofthestarleague*likemostroyalunits^itisexceedinglyrare^andcomesequippedwithadvancedweaponryandcomponents*',
     'MAD-2R型是""掠夺者""的变型机，在星际联盟灭亡前，被交付给了星际联盟防卫军的皇家军团。像大多数皇家单位一样，它极其罕见，配备了先进的武器和部件。'],
    ['themad-3dexchangesthemaraudersautocannonforanall-energyloadout^thussidesteppingtheriskofammunitionexplosions*italsopacksonextraheatsinkstohelpoffsettheincreasedheatgeneration*',
     'MAD-3D型将""掠夺者""的自动炮换成了全能量武装，从而避免了弹药殉爆的风险。它还安装了额外的散热器，以抵消部分增加的热量。'],
    ['perhapsoneofthebest-knownmechsinexistence^themaraudermakesaworthyopponentonthebattlefield*itsnoslouchatmidrangecombat^butexperiencedmechwarriorswillhangbackatlongerrangestoletitsppcsandac/5punishtargetsfromafar*',
     '""掠夺者""或许是现存最为知名的一种机甲，它在战场上是一个值得注意的对手。""掠夺者""在中距离战斗中并不差，但有经验的机甲战士会退到远距离，让它的粒子炮和AC/5自动炮远远地惩罚目标。'],
    ['theorionkwasthefirsttrueheavymech*asamultirolebrawler^theorioncanengageenemiesatavarietyofranges^andwithplentyofarmor^itcansurvivecombinedfireforquitesometime*slow^yesbutpowerful*',
     '""猎户座""K是第一种真正的重型机甲。作为一种多用途机甲，""猎户座""能在多种距离上与敌人交火；有了厚重的装甲，它能在敌人联合火力的攻击下存活好一段时间。它缓慢，没错——但强大。'],
    ['theorionvtradessomeofthearmorthekmodelisknownfortomountadditionalweaponry*thisincreasesitsoveralldamageoutput^butmanypilotsconsiderthelossofarmortoberisky*',
     '""猎户座""V牺牲了一些K型为人著称的装甲来安装额外的武器。这增强了它的总体伤害输出，但是许多的驾驶员都认为失去装甲是相当冒险的。'],
    ['panther9rsaresolidall-aroundmechs^ifabitontheslowside*theymakeupforitwithjumpjets^considerablearmor^andaheftypunchfromtheirtrademarkppc*theyveevenbeenusedinphysicalsluggingmatchestogoodeffect*',
     '""黑豹""9R是一种坚固的全能机甲，就是有点慢。它们靠跃进喷射器、可观的装甲，以及标志性粒子炮的强力一击弥补了这点。甚至为了物尽其用，它们还被用于近身搏击比赛。'],
    ['alightsupportmech^thepanther9riscapableofprovidingpowerfulcoveringfire*the9rusuallycoversfast-movinglightmechsastheyengagetheenemy^butitisequallyathomeusingitsjumpjetstoflank*',
     '""黑豹""9R是一种轻型支援机甲，能提供强大的掩护火力。9R型经常掩护快速移动接敌的轻型机甲，但它也能自在地使用自己的跃进喷射器迂回敌人。'],
    ['quickdraw4gsareamongthefastestandmostmaneuverableofheavymechs^withdecentweaponry*theysufferfromproblematicheatbuildupwhenusingalltheirfeaturesatonce^sosomecautionisneeded*',
     '""闪击""4G在重型机甲中属于最快、机动性最好的一种，武器装备也不错。同时发挥""闪击""的所有特性时，它们会受制于热量积累，所以要小心些。'],
    ['thequickdraw5awasdesignedtogivethemechmoreendurancethanthestock4g*byremovingthelrm-10^twoadditionalmediumlasersandfouradditionalheatsinkscouldbemounted*unfortunately^the5astillrunstoohotformostpilots*',
     '""闪击""5A的设计初衷是给予机甲较常备的4G型更多的耐久性。通过拆除LRM-10长程导弹换来的空间，再安装两支中型激光和四部散热器。不幸的是，5A型对大多数驾驶员来说还是太热了。'],
    ['theshadowhawk2disaninterestingmodel*itsdefaultpayloadsacrificesalotofarmortomountabitmorefirepower^thoughsomearguethetradeoffisntworthit*itsalphastrikes<i>are</i>better^though^so…iguessyoucanbethejudge*',
     '""影鹰""2D是一种很有意思的型号。它的默认配装牺牲了大量装甲来搭载稍多一些的火力，不过有些人认为这笔交易并不划算。但它的全弹攻击确实更强，所以……我想这就由你自己判断了。'],
    ['theshadowhawk2disaninterestingmodel*itsdefaultpayloadsacrificesalotofarmortomountabitmorefirepower^thoughsomearguethetradeoffisntworthit*itsalphastrikesarebetter^though^soiguessyoucanbethejudge*',
     '""影鹰""2D是一种很有意思的型号。它的默认配装牺牲了大量装甲来搭载稍多一些的火力，不过有些人认为这笔交易并不划算。但它的全弹攻击确实更强，所以……我想这就由你自己判断了。'],
    ['theshadowhawk2disaninterestingmodel*itsdefaultpayloadsacrificesalotofarmortomountabitmorefirepower^thoughsomearguethetradeoffisntworthit*itsalphastrikesarebetter^though^so…iguessyoucanbethejudge*',
     '""影鹰""2D是一种很有意思的型号。它的默认配装牺牲了大量装甲来搭载稍多一些的火力，不过有些人认为这笔交易并不划算。但它的全弹攻击确实更强，所以……我想这就由你自己判断了。'],
    ['theshadowhawk2disaninterestingmodel*itsdefaultpayloadsacrificesalotofarmortomountabitmorefirepower^thoughsomearguethetradeoffisntworthit*itsalphastrikesarebetter^though^so*iguessyoucanbethejudge*',
     '""影鹰""2D是一种很有意思的型号。它的默认配装牺牲了大量装甲来搭载稍多一些的火力，不过有些人认为这笔交易并不划算。但它的全弹攻击确实更强，所以……我想这就由你自己判断了。'],
    ['theshadowhawk2disaninterestingmodel*itsdefaultpayloadsacrificesalotofarmortomountabitmorefirepower^thoughsomearguethetradeoffisntworthit*itsalphastrikes<i>are</i>better^though^soiguessyoucanbethejudge*',
     '""影鹰""2D是一种很有意思的型号。它的默认配装牺牲了大量装甲来搭载稍多一些的火力，不过有些人认为这笔交易并不划算。但它的全弹攻击确实更强，所以……我想这就由你自己判断了。'],
    ['theshadowhawk2histheperfectexampleofajack-of-all-trades*itsupportsweaponryforallranges^hasrespectablespeedandjumpcapability^andmountsdecentarmor*thiscomesatthecostofexcellingatnothinginparticular*',
     '""影鹰""2H是一个""万金油""的完美案例。它支持所有射程的武器，有着可观的速度和跳跃能力，还装有像样的装甲。实际上，这付出了样样都不精的代价。'],
    ['the5kspidervariantkeepstheextrememaneuverabilityofitsmorecommon5vcousinbutaddssomemachinegunweaponryforclose-inwork*itsstillgotverylittlearmor^soitworksbestasascoutandspotter*',
     '""蜘蛛""5K继承了它们更常见的同类——5V型身上的极致的机动性，还加了一些适合近距离战斗的机枪。它的装甲依然非常薄弱，所以最好用作尖兵和观测员。'],
    ['thespider5vishandsdownthemostmaneuverablemechyoucanfieldbutitsmadeofpaper*itsanexcellentscout^though^andcanevenjumpintothereararcofmostenemiesforsurprisebackshots*',
     '""蜘蛛""5V无疑是你能部署的机甲中最具机动性的……可它简直是纸糊的。不过它是个出色的尖兵，甚至可以跳跃到大多数敌人的后面，发动突然的背后一击。'],
    ['thestalker3fmountsaridiculousamountofweaponryevenforanassaultmech*itisalsonotableforitsincrediblypoorheatmanagement^whichisthecostitpaysforsuchamazingdamageoutput*powerful^buttobeusedwisely*',
     '哪怕对于一部突击型机甲而言，""潜行者""3F安装的武器也算是出奇的多。另一项要注意的是它极其糟糕的热量管理，这是它为令人惊叹的伤害输出所付出的代价。它强大，但要明智地使用。'],
    ['thethunderbolt5siswell-armedandheavilyarmoredforitssize*itsoftendeployedasafrontlinemechwherethefightingisheavy^anditneedstogiveasgoodasitgets*',
     '""雷电""5S在它这一级别中全副武装而且皮糙肉厚。它通常会作为前线机甲被部署到战况激烈的地方，需要把挨的每一分打都回敬给敌人。'],
    ['thunderboltsemodelslosealittleoftheirfirepowerinexchangeformountingjumpjets*thegreatermobilityisintendedtoallowformoreprecisionattackingmaneuvers^thoughitalldependsonthebattlefieldterrain*',
     '""雷电""SE型牺牲了一点火力来加装跃进喷射器。更好机动性的目的是为了更为精准的进攻，但这一点通常有赖于战场地形。'],
    ['knownforitssuperbheatmanagement^thethunderbolt5sshitshardatlongrangewithitsppcandthenclosestodisableordestroyitstargetwithclose-rangeweaponry*',
     '""雷电""5SS以其出众的热量管理能力而闻名，它使用自身的粒子炮在远距离进行强力攻击，然后接近敌人使用近程武器来摧毁或瘫痪目标。'],
    ['oneofthelightestdedicatedfiresupportmechstobefound^thetrebuchet5ncanmountenoughmissilestogiveevenheavyunitspause*however^trenchbucketsareknownforrunninghotanddonthavemuchinthewayofprotection*',
     '""投石机""5N是现有的最轻专用火力支援机甲之一，能安装足够的导弹，打停相当重的单位。不过，""投石机""因为容易过热而闻名，而且没有多少防护。'],
    ['anoddoverhaulofthetrebuchet^thetbt-7kmodeldoesawaywithlrmsinordertoserveinamoredirect-firesupportrole*whatthisdesignlosesinmissilepoweritmakesupforintheflexibilityoftheweaponryitcanmount*',
     'TBT-7K型是""投石机""的一种奇怪的改造型号，它舍弃了长程导弹，以扮演更偏向直瞄火力支援的角色。这个型号失去了导弹火力，但可以灵活安装各类武器作为弥补。'],
    ['theurbanmechr60wasdesignedforexactlywhatthenameimplies:combatindenseurbanareas*assuch^ther60isveryheavilyarmored^butisextremelyslowdespiteitsintegratedjumpjets*armedwithasmalllaserandanac/10^ther60isadeadlyopponentagainstsimilarly-sizedmechs-ifitcangetcloseenoughtofightthem*',
     '""都市战甲""R60的设计目的正如它的名字所暗示的：在人口密集的城市地区作战。R60重铠厚甲，虽然装有跳跃喷射器，速度却依然极其缓慢。它装备一门小型激光和一门AC/10自动炮，在对抗体量相近的机甲时，R60是个致命对手——前提是它能靠得足够近。'],
    ['dontletthestubbyurbiefoolyouitmaylooklikeawalkingtrashcan^butitcanmountheavyarmorandagrown-up-sizedautocannon*r60sarentknownfortheirspeed^buttheyareveryusefulifyoucandrawtheenemyintotheirfiringrange*',
     '不要被粗短的""都市战甲""给欺骗了——也许它看起来像个行走的垃圾桶，但它能安装厚重的装甲和一门大口径自动炮。R60的速度并不出众，但如果你能把敌人引入它们射程的话，那它们就可以一展身手。'],
    ['theum-r60lisamodificationofthestandardr60urbanmechthatreplacestheac/10and2tonsofarmorwithanac/20todoubleitsfirepower*withevenlesscombatendurancethanther60^ther60lisfavoredinambushorhit-and-runtactics*',
     'UM-R60L是标准R60型""都市战甲""的改进型号，它用AC/20换下了AC/10和2吨装甲，使自身火力加倍。R60L的作战耐久性逊于R60型，在伏击或打了就跑战术中更受青睐。'],
    ['theum-r90suburbanmechadaptsthetraditionalurbanmechr60intoanenergyweaponplatformforhigherperformance*becauseitsweaponsarentlimitedbyammunitionconcerns^ther90isbetter-suitedtolongerengagements*',
     'UM-R90""小都市战甲""将传统的""都市战甲""R60改造成能量武器平台，以求更好的表现。由于它的武器不受弹药问题限制，因此R90型更适合长时间的交战。'],
    ['fewassaultmechsmountjumpjets^butthevictor9bisoneofem*withalargeballisticgunandsupportingclose-rangeweaponry^the9bisadeadlyopponentwithsuperiormobilityforitssize*unfortunately^thiscomesatthecostofarmor*',
     '很少有突击型机甲会装备跃进喷射器，而""胜利者""9B就是其中之一。9B装有一门大型弹道火炮，并辅以近程武器，在它这个体型下机动性出色，是个致命的对手。不幸的是，这是以舍弃一部分装甲为代价换来的。'],
    ['thevictor9stradessomeofitsalreadysubpararmortomountmoreweaponry*itsterrifyingforenemyforcestoseethismechrocketingoverahilltounleashitsconsiderablefirepower^butitalsoneedstoreallyworryaboutanyreturnfire*',
     '""胜利者""9S用一部分本身就较弱的装甲换来装备更多的武器。对敌军来说，看到这个机甲飞过山丘，宣泄它猛烈火力的场景是十分可怕的，但它也需要认真考虑能否承受住敌人的反击。'],
    ['thevnd-1aacarriesonlyhalfthearmorofthemorecommonvnd-1r^butusesthesavedweighttoupgradetheengine*thefinisheddesignisaverymobilemediummechsuitableforskirmishingandshootandscootsniping*',
     '""捍卫者""VND-1AA的装甲只有普通VND-1R装甲的一半，但它把节省下来的重量用于升级引擎。升级得到的成品是一种非常灵活的中型机甲，适合遭遇战和打了就跑的狙击。'],
    ['vindicator1rstendtodealtheirdamageatrangewhilemovinginforcloserattacks*typicallywellarmored^theyrecapableofsomesurpriseattacksduetotheirjumpcapabilityandabove-averageheatefficiency*',
     '""捍卫者""1R可以在接近敌人实施近战的过程中造成远距离伤害。它们往往有着良好的装甲，还可以利用跳跃能力和超棒的热效率发起突袭。'],
    ['the6dwarhammerseekstooptimizethebasemodelforsurvivabilitybydroppingafewweaponsandpilingonthearmor*itdefinitelyhasmorestayingpower^whichletsitsmashmoreppcboltsintoitstargets*',
     '""战锤""6D通过削减武器同时堆砌装甲的改装来竭力优化生存能力。它的耐久性确实更强，能把更多的粒子束打向敌人。'],
    ['the6rwarhammerisalegendarymechthatsoftenfoundinthethickofcombat^hurlingppcboltsatitsfoes*itsnotthemostheavilyarmoredbrawler^butittendstogiveatleastasgoodasitgets^especiallywithanyenergy-basedweapons*',
     '""战锤""6R是一种传奇机甲，总是在战斗的高潮出现，猛烈地将粒子束打向它的敌人。它不是装甲最厚重的机甲，但往往挨多少打就能输出多少火力，特别是用能量武器的时候。'],
    ['anextremelyrarewarhammervariantassociatedwiththesldfsfamedroyaldivisions*kittedoutwithtop-tierweaponryandadvancedheatmanagement^thewhm-7awaspilotedbythebest-trainedmechwarriorsthesldfhadtooffer*',
     '一种极其稀少的""战锤""变型机，和星际联盟防卫军著名的皇家军团有所关联。WHM-7A配备着顶级的武器和先进的热量管理系统，由星际联盟防卫军所能提供的最训练有素的机甲战士驾驶。'],
    ['thewarhammer6risalegendarymechthatsoftenfoundinthethickofcombat^hurlingppcboltsatitsfoes*itsnotthemostheavilyarmoredbrawlerbutittendstogiveatleastasgoodasitgets^especiallywithanyenergy-basedweapons*',
     '""战锤""6R是一种传奇机甲，总是在战斗的高潮出现，猛烈地将粒子束打向它的敌人。它不是装甲最厚重的机甲，但往往挨多少打就能输出多少火力，特别是用能量武器的时候。'],
    ['wolverine6kmodelsdontusuallyincludejumpjetsinordertomountmoreenergyweaponry^heatsinks^andarmor*',
     '为了搭载更多的能量武器、散热器和装甲，""狼獾""6K一般不会安装跃进喷射器。'],
    ['wolverine6rsarefairlyflexibleintermsofweaponryranges^tendingsomewhatmoretowardcloserengagements*thisissupportedbytheirjumpcapabilityandprettydecentheatmanagement*',
     '从武器射程来看，""狼獾""6R是一种相当灵活的机甲，更倾向于打近战。它们的跳跃能力和相当不错的热量管理能力也支持这一点。'],
    ['thezeu-5tisanextremelyrarezeusvariantthatwasproducedatthebeginningofthesuccessionwars*itboastsadvancedweaponssystemsandincrediblecoolingcapacity^whilemaintainingthebetter-than-averagespeedthezeusisknownfor*',
     '""宙斯""5T是一种非常罕见的""宙斯""变型机，是在继承战争开始时生产的。它拥有先进的武器系统和令人难以置信的冷却能力，同时还保留着""宙斯""闻名于世的，高于平均水平的速度。'],
    ['thezeus6smovesfasterthanmanyotherassaultmechsandmountsdecentlong-rangeweaponry*itsarmorisverygood^butitcangetstuckinatightspotifforcedintocloser-rangefights*',
     '""宙斯""6S移动得比大多数的突击型机甲都快，并且装备有不错的远程武器。它的装甲很不错，但是如果被迫进入近距离战斗，就会陷入不利境地。'],
    ['thezeu-6tzeusvariantisrelativelyfastandsturdy^withanenergy-focusedweaponloadoutandaddedheatsinks*',
     '""宙斯""6T变型机相对而言又快又坚固，还有一套专注于能量攻击的武器装备，以及额外的散热器。'],
    ['theannihilatorisanextremelyraremechthatisessentiallyamobilesiegetower*itcankickoutmoredamagethanalmostanyotherunitonthefield*itsunbelievablyslow^though^andpoorlyarmoredforitssize*',
     '""歼灭者""是一种极其稀有的机甲，本质上就是一座移动的防御塔。它能造成的伤害比战场上几乎任何单位都多。但它慢得难以置信，以体型而言装甲也很单薄。'],
    ['thewell-knownarcheristheepitomeofthe"missileboat"concept*itiscommonlyfoundhurlingdeadlyswarmsoflrmsattargetsfrombehindthesafetyofahill*itsnottooshabbyincloser-rangefights^either*itsonlyrealweaknessisterribleheatmanagement*',
     '大名鼎鼎的""弓箭手""正是""导弹艇""概念的典型代表。它通常从山后隐蔽位置向目标发射致命的长程导弹群，近距离交战时表现也不差。其唯一真正的弱点是糟糕的热量管理。'],
    ['thearchers2svarianttradessomeofitslong-rangepunchtobecomeevendeadlierwhenitgetsupclose^mountingsrmstofollowupwhatitslrmshavebattered*itsheatmanagementstillposesahugeproblem^though^soitspilotshavetostayverywaryofoverheating*',
     '""弓箭手""2S牺牲了部分远程威力，却在近身时更加致命：它加装了短程导弹，用来追击已被长程导弹打残的目标。不过它的热量管理仍是个大麻烦，驾驶员必须格外小心过热。'],
    ['theasn-101isarareassassinvariantthatreducesjumpcapabilityandtrimssomeofitsalready-thinarmortomountadditionalweapons*theextrapunchmesheswellwithitsadvancedtrackingsystems*',
     '罕见的""刺客""改型ASN-101，它降低了跳跃能力，并进一步削减了原本就已经十分薄弱的装甲，以便安装额外武器。其增强的追踪系统与额外的打击力相得益彰。'],
    ['theasn-21livesuptoitsname^atleastagainstlighterunits*ithasastoundingjumpcapabilityinadditiontoitsgroundspeedandaflexibleweaponspackage*ithaspoorarmorforitstonnage^however^soitsbestathit-and-runattacks*',
     '""刺客""ASN-21名副其实，至少在对付轻型单位时是这样。除了地面速度和灵活的武器配置，它还有惊人的跳跃能力。不过以它的吨位来说装甲太过单薄，所以最适合打了就跑。'],
    ['thisissomethingbrand-newtome^commander*idontknowwherethismechcamefrom^butitsaseriousforcetobereckonedwithbecauseofitsheavyweaponryandnearlyimpenetrablearmor*quiteafind!',
     '这台""牛鲨""对我来说完全是新东西，指挥官。我不知道它从哪来的，但凭借重型武器和几乎无法穿透的装甲，它在战场上是一股不容小视的力量。真是一大发现！'],
    ['iveneverseenanythinglikethis^commander*thismechoozesdeadlygraceandcanobviouslydevastateanythinginitspath*itsotherworldly^butclearlyinfluencedbystarleaguetech*ithasamountedartillerypiecetobootiwonderwhereitcamefrom*',
     '我从没见过这样的东西，指挥官。这台""牛鲨""散发着致命的优雅，显然能摧毁挡在路上的一切。它……像是来自另一个世界，但明显受到星际联盟技术的影响。它还装了一门火炮——我真想知道它是从哪儿来的。'],
    ['iveneverseenanythinglikethis^commander*thismechoozesdeadlygraceandcanobviouslydevastateanythinginitspath*its…otherworldly^butclearlyinfluencedbystarleaguetech*ithasamountedartillerypiecetobootiwonderwhereitcamefrom*',
     '我从没见过这样的东西，指挥官。这台""牛鲨""散发着致命的优雅，显然能摧毁挡在路上的一切。它……像是来自另一个世界，但明显受到星际联盟技术的影响。它还装了一门火炮——我真想知道它是从哪儿来的。'],
    ['iveneverseenanythinglikethis^commander*thismechoozesdeadlygraceandcanobviouslydevastateanythinginitspath*its*otherworldly^butclearlyinfluencedbystarleaguetech*ithasamountedartillerypiecetobootiwonderwhereitcamefrom*',
     '我从没见过这样的东西，指挥官。这台""牛鲨""散发着致命的优雅，显然能摧毁挡在路上的一切。它……像是来自另一个世界，但明显受到星际联盟技术的影响。它还装了一门火炮——我真想知道它是从哪儿来的。'],
    ['thecataphract0xmuchlikethelighterravenisanexperimentalmodeldesignedtocarryanewgenerationofelectronicwarfaregear*thoughlesswell-armedthanothercataphractvariants^itsabletoholditsownonthebattlefield*',
     '与更轻的""渡鸦""一样，""重甲铁骑""0X是一种实验型号，用作新一代电子战装备的平台。它的武装不如其他""重甲铁骑""改型，但仍能在战场上站稳脚跟。'],
    ['crab20sfulfillanoftoverlookedrole^thatofaskirmisherwithfirepower*wieldingstrongenergyweapons^thecrabdeliversapunchatnearlyallranges^withnoammunitionconstraints*theblendoffirepower^heatefficiency^andspeedmakethecrabtheperfectmechtoraidenemypositions*',
     '""蟹""20型机甲承担着一个常被忽视的角色：拥有强大火力的散兵。凭借强大的能量武器，""蟹""在几乎任何距离上都能打出重击，而且不受弹药限制。火力、热效率和速度的结合，使""蟹""成为突袭敌军阵地的最佳机甲。'],
    ['thecrab27bisaveryoldmodelthatdatesbacktothedaysofthestarleague*itsenergyweaponsareallrare^upgradedversionsofthetechfoundonthecrb-20^allowingittohitharderwhilestillrequiringnoammunition*improvedheatsinkingalsokeepsitcomparativelycool*',
     '""蟹""CRB-27B是星际联盟时代的古老型号。它的能量武器全是""蟹""CRB-20上那些技术的稀有改进版，使它打击更狠，却完全不用担心弹药。改良的散热系统也让它相对凉快。'],
    ['auniquelyhybridizedbrawlerbuiltfromthehuskofacrb-20*bogdanthesteelbeasttubbshadthebigsteelclawschassisrebuilttosupportthemountingofballisticweaponry^presumablyintheinterestofcreatingalouderandmoreviolentspectacleinthearena*',
     '由""蟹""CRB-20的残骸改装而成的独特混合型格斗机甲。博格丹·""钢铁猛兽""·塔布斯让人重建了""巨钢爪""的底盘，以便加装弹道武器。大概是为了在竞技场上制造更大更暴力的奇观。'],
    ['thecyclops10-hqistheultimatecommandmech*thoughitsweaponryisfairlylightforitsclass^itprovidesunmatchedbenefitstofriendlyunitsintheformofimprovedcommunications^coordination^andbattlefieldawareness*',
     '""独眼巨人""10-HQ是终极指挥机甲。以它的吨位而言武器相当轻，但凭借改良的通讯与协调能力，它能完美地指挥小队其余成员。'],
    ['cyclops10-qsarestrongsupportunits*lackingthecloseinweaponsandcommandsuiteofthe10-zvariant^thismodelinsteadcapitalizesonalongerrangeweaponconfigurationandaddedarmor*theprotectionandexpandedmissileracksmakethe10-qasignificantthreatatrangeintherighthands*',
     '""独眼巨人""10-Q型是强大的支援单位。它缺少10-Z型的近程武器和指挥套件，但这种型号转而依靠更远的武器配置和额外装甲。更强的防护和扩充的导弹架让10-Q在行家手里成为远距离上的巨大威胁。'],
    ['cyclops10-zsusetheirimposingpresenceanduniquecommunicationsequipmenttocontrolthebattlefield*whilethe10-zcarriesalethalarrayofcloserangeweaponry^itsprimaryroleiscommandandcontrol^bolsteringfriendlyunitswithitsspecializedbattlecomputer*',
     '""独眼巨人""10-Z型机甲凭借其威严的身形和独特的通讯设备掌控战场。10-Z搭载了一系列致命的近程武器，但它的主要职责是指挥与控制，用专门的战斗计算机为友军单位提供支援。'],
    ['thefleafle-15isadiminutivemechwithgoodclose-infirepowerforitssize*itmovesfastandisveryhardtohit^evencomparedtootherlightermechs*ofcourse^itsarmorleavesalottobedesired*',
     '""跳蚤""FLE-15是一种小型机甲，以体型而言近距离火力相当不错。它移动极快，就算与其他轻型机甲相比也很难被击中。当然，它的装甲就相当单薄了。'],
    ['thefleasuncommonfle-4modelpacksapowerfulpunchforsuchatinymechbutcarriesextremelylightarmor*itreliesonspeedandhit-and-runtacticstokeepitalive^butonegoodhitisallittakes*',
     '少见的""跳蚤""FLE-4虽然体型小巧，但火力强劲，同时装甲极为轻便。它依靠速度和突袭战术来作战，但只需一记精准打击即可将其击溃。'],
    ['hatchetman3fsarethekingoftheclosequartersfight*packinghighimpactshortrangeweaponry^andauniquemeleehatchet^anytargetisindangerwhenclosetothehatchetman*thehatchetmanslighterarmorrequiresittorelyonmaneuveringandambushingtostayinthefight*',
     '""斧王""3F型是近战格斗的王者。他们装备了高威力的近战武器，以及一种独特的近战斧头，一旦靠近""斧王""，任何目标都会陷入危险之中。由于""斧王""的护甲较轻，因此必须依靠机动性和伏击来战斗。'],
    ['thehatchetman-3xfurtherindexesonthestockdesignsclosecombatrole^addingmorearmorandreplacingitsac10foranarrayofsrms^lasers^andanti-personnelweapons*thisistheultimatemeleebrawler*',
     '""斧王""3X进一步强化了该型号在近战中的能力，增加了更多护甲，并用一系列短程导弹、激光武器和反人员武器取代了原有的AC10自动炮。这是一款终极近战格斗机甲。'],
    ['thejavelin10ahasstrongjumpingcapabilitiesandcanpumpoutconsiderabledamagewithitslrms*takentogether^thesequalitiesmakethe10aasuperbharasserandfiresupportunit^thoughitispronetorunningoutofammo*',
     '""标枪""10A跳跃能力出色，配合长程导弹也能打出可观的伤害。综合来看，它是让敌军极其头疼的骚扰与火力支援单位——不过它以弹药消耗快而闻名。'],
    ['thejvn-10fisarmedwithfourmediumlasers*itsafunctionalscoutingmech^butshinesasmobilereinforcementunitbecauseitcanprovidesustainedfirewithoutammolimitations*',
     '""标枪""JVN-10F装有四门中型激光。它是称职的侦察机甲，但作为机动增援单位更为出色——它不会耗尽弹药，可以持续向敌人开火。'],
    ['thejvn-10nisamaneuverablereconmechwithtwosrm-6stodiscouragepursuit*thesrmsgiveitastrongalphastrikeatshortrange^butthejavelinslightarmormeansitisbetterusedtosupporthand-to-handbrawlersthantobeoneitself*',
     '""标枪""JVN-10N是一种灵活的侦察机甲，装有两具SRM-6发射器，用来吓退追击者。靠着短程导弹，它能在近距离用一次首轮齐射打出巨大伤害，但""标枪""的装甲很薄，所以最好把它当作近战单位的支援，而不是让它自己冲上去打近战。'],
    ['thepxh-1isoneofthemostelegantandagilemechsaround^boastinggoodarmoranddecentweapons*sadly^itsheatbuildupisalsonoteworthy*savvymechwarriorstakeadvantageofthismechsjumpcapabilitytolandtimelyshotsandthenrepositiontoanothervantagepoint*',
     '""凤凰""PXH-1是目前最优雅且灵活的机甲之一，拥有出色的装甲和不错的武器。然而，它的热量积累问题也相当明显。经验丰富的机甲战士会利用该机甲的跳跃能力，在时机恰当时进行射击，然后重新调整位置以获得更好的作战视野。'],
    ['thekurita-modifiedpxh-1kremovesalmostallofitsjumpcapabilityinfavorofbetterarmorandheatmanagement*thismakesitlessflexibleinmorerestrictiveenvironments^butitsstillanimbleandreliableskirmisher*',
     '栗田改装的""凤凰""PXH-1K几乎放弃了全部跳跃能力，换来更好的装甲和散热。这让它在环境受限时不够灵活，但它仍是一台敏捷可靠的游击机甲。'],
    ['thephoenixhawk1bisahighlyadvancedmechthatwasprovidedonlytothesldfsroyaldivisions*itsanextremelyrarefind^andapowerfulstrikerthatcanexecutedevastatingflankingmaneuvers*',
     '""凤凰""1B是一种高度先进的机甲，仅提供给星际联盟防卫军的皇家军团。它是极其罕见的机型，也是一种能执行毁灭性侧翼攻击的强大突击机甲。'],
    ['thervn-1xisalightmechdesignedspecificallytocarryanewgenerationofelectronicwarfaregear*theravenexcelsatsupportandscouting^anditsstandardcomplementofsrmsandmediumlasersallowsittofightwellinapinch*',
     '""渡鸦""RVN-1X是一款轻型机甲，专为搭载新一代电子战装备而设计。它擅长支援与侦察，其标准配置的短程导弹与中型激光让它必要时也能一战。'],
    ['inadditiontoitselectronicwarfaresuite^thervn-3xhasbeenoutfittedwithexperimentaltriplestrengthmyomer*thisgreatlyincreasesthe3xsmovementspeedwithoutincreasingitsweight^buttheadvancedmyomerbundlescanreactviolentlyifdamagedbyweaponsfire*',
     '除了配备电子战系统外，""渡鸦""RVN-3X还搭载了实验性的三重强度肌动器。这大幅提升了3X的移动速度，同时并未增加其重量，但先进的肌动器束在受到武器火力破坏时会剧烈反应。'],
    ['theriflemans3cvariantpacksaheavierper-shotpunchwhilealsoimprovingthesurvivalofthemechbyaddingextraarmorandhelpingitsheatproblems*thedownsideisthatitsheavierautocannonsforceittocomesomewhatclosertodanger^makingpositioningandsupportfrombetter-armoredunitscritical*',
     '""步枪手""的3C变体在每次射击时威力更强，同时通过增加额外装甲和改善其散热问题，提升了机甲的生存能力。缺点是其更重的自动炮迫使它不得不靠近危险区域，因此需要更坚固装甲单位提供掩护和支援，以确保有效部署。'],
    ['therfl-3nriflemanisaswellknownforitsterriblearmorasforitsabilitytohammeropponentsfromlongrange*ithasonlyaveragespeedandpoorheatsinkingability^butifyoucanputitintherightposition^itcanraindeathonanythingitsurveys*',
     'RFL-3N""步枪手""既以糟糕的装甲闻名，也以能从远距离痛击对手闻名。它的速度平平，散热能力也差，但只要你能把它放到合适的位置，它就能把死亡之雨倾泻到它看到的任何东西上。'],
    ['therfl-4dsacrificestheriflemansautocannonsforanall-energyweaponloadout*the4dcanpumpoutrangeddamagewithouttheneedforammunition^butitsheatmanagementcapabilitiesleavealottobedesired*',
     '""步枪手""RFL-4D把自动炮换成了全能量武器配置。4D无需弹药就能输出远程伤害，但它的热量管理能力实在不敢恭维。'],
    ['the2tvulcanisacuriousmechthatsdesignedprimarilyforsupportattacksbutalsomountsanac/2oneofthelongest-rangeweaponsavailable*mechwarriorsnormallyditchitinfavorofmorearmorordifferentweaponrythatcomplementsthevulcansclose-quarterstrengths*',
     '2T""火神""是一种奇特的机甲，设计初衷是执行支援攻击，却也装了一门AC/2自动炮——现存射程最远的武器之一。机甲战士们通常宁愿把它换成更多装甲，或其他能配合""火神""近战优势的武器。'],
    ['afedsunsfavorite^thevulcans5tvariantdumpsthestandardmodelsac/2andbeefsupitsmedium-to-closefirepoweranddefenses*itsgenerallyconsideredtobe"better"thanthe2t^butitsalsohardertocomeby*',
     '作为恒星联邦的宠儿，""火神""5T型拆掉了标准型号的AC/2自动炮，全面加强了中近距离的火力与防护。它通常被认为比2T型""更好""，但也更难弄到手。'],
    ['thehatchetman3xfurtherindexesonthestockdesignsclosecombatrole^addingmorearmorandreplacingitsac10foranarrayofsrms^lasers^andanti-personnelweapons*thisistheultimatemeleebrawler*',
     '""斧王""3X进一步强化了该型号在近战中的能力，增加了更多护甲，并用一系列短程导弹、激光武器和反人员武器取代了原有的AC10自动炮。这是一款终极近战格斗机甲。'],
    ['thecenturionaisdesignedasdirect-linemech^beingbothpowerfulandversatile*inadditiontogoodarmor^thecn9-anormallymountsanac/10^twomediumlasers^andanlrm-10rack*thisstripped-downmechsportsonlyasinglemediumlaser^though*',
     '""百夫长""A型被设计为直射型机甲，兼具强大性能和多功能性。除了良好的装甲外，CN9-A通常配备一个AC/10自动炮、两门中型激光炮以及一个LRM-10机架。不过，这款简化版的机甲仅配备了一门中型激光炮。'],
    ['thecenturionaisdesignedasdirect-linemech^beingbothpowerfulandversatile*inadditiontogoodarmor^thecn9-anormallymountsanac/10^twomediumlasers^andanlrm-10rack*<i>this</i>stripped-downmechsportsonlyasinglemediumlaser^though*',
     '""百夫长""A型被设计为直射型机甲，兼具强大性能和多功能性。除了良好的装甲外，CN9-A通常配备一个AC/10自动炮、两门中型激光炮以及一个LRM-10机架。不过，这款简化版的机甲仅配备了一门中型激光炮。'],
    ['the2dshadowhawkisaninterestingmodel*itsdefaultpayloadsacrifcesalotofarmortomountabitmorefirepower^thoughsomearguethetradeoffisntworthit*itsalphastrikes*are*betterthoughso***iguessyoucanbethejudge*',
     '""影鹰""2D是种有趣的型号。它默认的载荷牺牲了大量装甲，以换取更强的火力，不过也有人认为这种权衡并不值得。不过它的全弹打击能力确实更优，所以……你来判断吧。'],
  ];
  // >>> CHASSIS-DESC END
  let set = 0, add = 0;
  for (const [k, v] of CHASSIS_DESC) {
    const had = merged.has(k) || keyOrder.indexOf(k) >= 0;
    if (had) {
      if (merged.get(k) !== v) { merged.set(k, v); set++; }
    } else {
      merged.set(k, v);
      keyOrder.push(k);        // 追加在末尾, 官方 key 的相对顺序不受影响
      add++;
    }
  }
  console.log(`机甲描述: 覆盖 ${set} 条, 新增 key ${add} 条 (共 ${CHASSIS_DESC.length} 条)`);
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
