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
    ['western', '西部工业'], ['zeus', '宙斯'],
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
