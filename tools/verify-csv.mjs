// verify-csv.mjs — 汉化 CSV 全量不变量自检
// 用法: node tools/verify-csv.mjs
// 逐条检查所有"一旦违反就会在游戏里出问题"的硬性约束, 全部通过才打印 OK。
import fs from 'node:fs';
import path from 'node:path';

const PROJ = 'C:/Users/lxp_0/Documents/BTHanHua';
const GAME = 'D:/MyDownload/Things/Steam/steamapps/common/BATTLETECH/BattleTech_Data/StreamingAssets/data/localization';
const CSV = path.join(PROJ, 'corpus', 'strings_zh-CN.csv');
const US = '\u001f';

const raw = fs.readFileSync(CSV, 'utf8');
const fails = [];
const warns = [];
const ok = (name, detail) => console.log(`  [OK]   ${name}${detail ? '  — ' + detail : ''}`);
const bad = (name, detail) => { fails.push(name); console.log(`  [FAIL] ${name}${detail ? '  — ' + detail : ''}`); };
const warn = (name, detail) => { warns.push(name); console.log(`  [WARN] ${name}${detail ? '  — ' + detail : ''}`); };

console.log('== 汉化 CSV 全量自检 ==\n');
console.log(`文件: ${CSV}\n大小: ${(Buffer.byteLength(raw, 'utf8') / 1048576).toFixed(2)} MB (${raw.length} 字符)\n`);

// ---- 1. 编码形态: 无 BOM, 仅 LF ----
console.log('[1] 编码形态');
if (raw.charCodeAt(0) === 0xfeff) bad('文件无 BOM'); else ok('文件无 BOM');
if (raw.includes('\r')) bad('仅使用 LF 换行', `发现 ${(raw.match(/\r/g) || []).length} 个 CR 字符`); else ok('仅使用 LF 换行');

const lines = raw.replace(/^\uFEFF/, '').split('\n');
const dataLines = lines.filter(l => l.trim());
if (!dataLines.length || !/^KEY,/.test(dataLines[0])) warn('首行为表头 KEY,zh-CN', '未见表头');
else dataLines.shift();
ok('译文条目数 (不含表头)', String(dataLines.length));

// ---- 2. 逐行解析 + 值级检查 ----
console.log('\n[2] 逐行解析与值级约束');
// 字形白名单基准: 优先用新离线图集的字符集 (corpus/font-atlas/charset.txt, 8354 字);
// 没有才退回旧的 2615 字表。新方案下图集已覆盖通用规范汉字表 BMP 部分, 白名单不再是约束。
const wlFile = fs.existsSync(path.join(PROJ, 'corpus', 'font-atlas', 'charset.txt'))
  ? path.join(PROJ, 'corpus', 'font-atlas', 'charset.txt')
  : path.join(PROJ, 'corpus', 'glyph-covered.txt');
const wl = new Set([...fs.readFileSync(wlFile, 'utf8').replace(/\s/g, '')]);
console.log(`   字形白名单基准: ${path.basename(wlFile)} (${wl.size} 字)`);

// 与 build-atlas.py / AtlasFont.cs 同口径: 控制符(Cc)/格式符(Cf)/未分配(Cn)/代理(Cs)/
// 私用(Co)/分隔符(Z*) 都不需要字形。
function needsGlyph(ch) {
  return !/[\p{Cc}\p{Cf}\p{Cn}\p{Cs}\p{Co}\p{Zs}\p{Zl}\p{Zp}]/u.test(ch);
}
const seen = new Set();
const order = [];
let asciiComma = 0, oddQuote = 0, quoteRun = 0, usOutside = 0, usOutsideRows = 0, usInside = 0, spanNoSep = 0, outAtlas = 0, litCR = 0, emptyVal = 0, spanOpen = 0, spanClose = 0, tagLines = 0;
const badSamples = { asciiComma: [], oddQuote: [], quoteRun: [], spanSep: [], outAtlas: [], litCR: [] };
const outAtlasChars = new Map();

for (const L of dataLines) {
  const i = L.indexOf(',');
  if (i < 0) { bad('每行都能切出 key', L.slice(0, 60)); continue; }
  const k = L.slice(0, i), v = L.slice(i + 1);
  if (seen.has(k)) bad('key 唯一', k);
  seen.add(k); order.push(k);
  if (!v.trim()) emptyVal++;

  if (v.includes(',')) { asciiComma++; if (badSamples.asciiComma.length < 5) badSamples.asciiComma.push(k); }
  const q = (v.match(/"/g) || []).length;
  if (q % 2 !== 0) { oddQuote++; if (badSamples.oddQuote.length < 5) badSamples.oddQuote.push(k); }
  // 官方 de/fr/ru 的引号连续段最长只有 2 (一个转义后的引号); >=3 连说明被重复转义, 玩家会看到多余的引号
  for (const run of v.match(/"+/g) || []) if (run.length > 2) { quoteRun++; if (badSamples.quoteRun.length < 5) badSamples.quoteRun.push(`${k.slice(0, 40)} (${run.length} 连)`); break; }
  if (v.includes('\\r')) { litCR++; if (badSamples.litCR.length < 5) badSamples.litCR.push(k); }
  if (/<[a-zA-Z/]/.test(v)) tagLines++;

  // U+001F 只能出现在 [[...]] 内部 (深度扫描, 支持嵌套; 与非贪婪正则不同, 嵌套也不会误判)
  const spans = [];
  {
    let i = 0;
    while (i < v.length - 1) {
      if (v[i] === '[' && v[i + 1] === '[') {
        let d = 0, j = i, closed = false;
        while (j < v.length) {
          if (v[j] === '[') d++;
          else if (v[j] === ']') { d--; if (d === 0) { closed = true; break; } }
          j++;
        }
        if (closed) { spans.push(v.slice(i, j + 1)); i = j + 1; continue; }
      }
      i++;
    }
  }
  spanOpen += (v.match(/\[\[/g) || []).length;
  spanClose += (v.match(/\]\]/g) || []).length;
  for (const s of spans) { usInside += (s.match(new RegExp(US, 'g')) || []).length; }
  // 每个 [[...]] 必须恰好含 1 个 U+001F 分隔符 (引用键<U+001F>显示文本)
  for (const s of spans) {
    const c = (s.match(new RegExp(US, 'g')) || []).length;
    if (c !== 1) { spanNoSep++; if (badSamples.spanSep.length < 5) badSamples.spanSep.push(`${k.slice(0, 45)} (${c} 个)`); }
  }
  // 标记外的 U+001F 是官方约定的"逗号替身" (官方 de-DE 有 29409 个 / 10548 行), 允许存在
  let masked = v;
  for (const s of spans) masked = masked.replace(s, m => m.replace(new RegExp(US, 'g'), ''));
  const strayUS = (masked.match(new RegExp(US, 'g')) || []).length;
  usOutside += strayUS;
  if (strayUS) usOutsideRows++;

  // 字形白名单
  const badc = new Set();
  for (const ch of v) {
    const cp = ch.codePointAt(0);
    if (cp < 128 || cp === 0x1f) continue;
    if (wl.has(ch)) continue;
    // 控制符/格式符/空白不需要字形 (U+200B 零宽空格、U+3000 全角空格 ...), 与
    // build-atlas.py 的 needs_glyph / AtlasFont.cs 的 NeedsGlyph 同口径
    if (!needsGlyph(ch)) continue;
    badc.add(ch);
  }
  if (badc.size) {
    outAtlas++;
    for (const c of badc) outAtlasChars.set(c, (outAtlasChars.get(c) || 0) + 1);
    if (badSamples.outAtlas.length < 5) badSamples.outAtlas.push(k + ' -> ' + [...badc].join(' '));
  }
}

if (asciiComma === 0) ok('值内无半角逗号 (游戏 CSV 解析前提)'); else bad('值内无半角逗号', `${asciiComma} 行: ${badSamples.asciiComma.join(', ')}`);
if (oddQuote === 0) ok('每行双引号个数为偶数 (游戏解析器是引号状态机)'); else bad('每行双引号个数为偶数', `${oddQuote} 行奇数: ${badSamples.oddQuote.join(', ')}`);
if (quoteRun === 0) ok('引号连续段不超过 2 个 (与官方 de/fr/ru 一致, 无重复转义)'); else bad('引号连续段不超过 2 个', `${quoteRun} 行: ${badSamples.quoteRun.join(' ; ')}`);
if (spanNoSep === 0) ok('每个 [[...]] 恰好含 1 个 U+001F 分隔符', `标记内共 ${usInside} 个`);
else bad('每个 [[...]] 恰好含 1 个 U+001F 分隔符', `${spanNoSep} 处异常: ${badSamples.spanSep.join(' ; ')}`);
console.log(`  [INFO] U+001F 出现在标记外 (官方"逗号替身"约定): ${usOutside} 个 / ${usOutsideRows} 行`);
if (outAtlas === 0) ok('全部字符都在字形图集内 (否则显示为方块)', `${wl.size} 个可用汉字`);
else bad('全部字符都在字形图集内', `${outAtlas} 行含白名单外字符: ${[...outAtlasChars.entries()].map(([c, n]) => `${c}(${n})`).join(' ')}`);
if (litCR === 0) ok('无字面 \\r 转义', '与官方 de-DE 一致 (官方 \\n 3425 行 / \\r\\n 仅 4 行)');
else warn('无字面 \\r 转义', `${litCR} 行: ${badSamples.litCR.join(', ')}`);
if (spanOpen === spanClose) ok('[[ 与 ]] 数量相等', `${spanOpen} 对`);
else console.log(`  [INFO] [[ 与 ]] 总数不等 ([[ ${spanOpen} / ]] ${spanClose}) — 逐行判定见下方 [4] 节`);
if (emptyVal === 0) ok('无空译文');
else console.log(`  [INFO] 空译文 ${emptyVal} 行 (官方 de-DE 里本身即为空值的内部串, 属预期)`);
ok('含 <...> 富文本标签的行', String(tagLines));

// ---- 3. 与官方 CSV 对齐: key 集合与顺序 ----
console.log('\n[3] 与官方 CSV 对齐');
const dePath = path.join(GAME, 'strings_de-DE.csv');
if (!fs.existsSync(dePath)) {
  warn('官方 de-DE 存在, 可做 key 对齐', '未找到官方文件, 跳过');
} else {
  const deAll = fs.readFileSync(dePath, 'utf8').replace(/^\uFEFF/, '').split('\n').filter(l => l.trim())
    .map(l => { const i = l.indexOf(','); return { k: i < 0 ? '' : l.slice(0, i), v: i < 0 ? '' : l.slice(i + 1) }; });
  // 官方文件里有两行 key 为空 (以逗号开头) 的历史残留, 不属于真正的 key
  const officialEmptyKey = deAll.filter(o => o.k === '').length;
  const deEntries = deAll.filter(o => o.k !== '' && o.k !== 'KEY');   // 去掉表头与 2 行空 key 残留
  const deKeys = deEntries.map(o => o.k);
  const deSet = new Set(deKeys);
  const missing = deKeys.filter(k => !seen.has(k));
  const extra = order.filter(k => !deSet.has(k));
  if (officialEmptyKey) console.log(`    (官方文件含 ${officialEmptyKey} 行空 key, 是官方自身的历史残留, 已排除)`);
  if (missing.length === 0) ok('官方 key 全部有译文', `${deKeys.length} 个官方 key`);
  else {
    // 官方本身值为空的 key (如内部串 deptooltip) 只需存在即可
    const hardMissing = missing.filter(k => (deEntries.find(o => o.k === k) || {}).v !== '');
    if (hardMissing.length === 0) ok('官方 key 全部有译文', `${deKeys.length} 个 (${missing.length} 个官方本就为空值)`);
    else bad('官方 key 全部有译文', `缺 ${hardMissing.length} 个: ${hardMissing.slice(0, 8).join(', ')}`);
  }
  if (extra.length === 0) ok('无官方之外的 key'); else warn('无官方之外的 key', `${extra.length} 个: ${extra.slice(0, 8).join(', ')}`);
  const ordSet = new Set(order);
  const cmpDe = deKeys.filter(k => ordSet.has(k));   // 只比对双方都有的 key, 检查相对顺序
  let sameOrder = 0;
  for (let i = 0; i < cmpDe.length; i++) if (cmpDe[i] === order[i]) sameOrder++;
  if (sameOrder === cmpDe.length) ok('key 相对顺序与官方一致', `${cmpDe.length} 个`);
  else warn('key 相对顺序与官方一致', `${sameOrder}/${cmpDe.length} 同序`);
}

// ---- 4. [[...]] 链接标记: 区分"我们引入的缺陷"与"官方自身就残缺" ----
console.log('\n[4] [[...]] 链接标记完整性');
{
  const dePath2 = path.join(GAME, 'strings_de-DE.csv');
  const deMap = new Map();
  if (fs.existsSync(dePath2)) {
    for (const l of fs.readFileSync(dePath2, 'utf8').replace(/^\uFEFF/, '').split('\n')) {
      const i = l.indexOf(','); if (i <= 0) continue;
      deMap.set(l.slice(0, i), l.slice(i + 1));
    }
  }
  const ours = [], inherited = [];
  for (const L of dataLines) {
    const i = L.indexOf(','); if (i < 0) continue;
    const k = L.slice(0, i), v = L.slice(i + 1);
    const a = (v.match(/\[\[/g) || []).length, b = (v.match(/\]\]/g) || []).length;
    if (a === b) continue;
    const dv = deMap.get(k) || '';
    const da = (dv.match(/\[\[/g) || []).length, db = (dv.match(/\]\]/g) || []).length;
    (da === db ? ours : inherited).push(`${k.slice(0, 50)} ([[${a} ]]${b})`);
  }
  if (inherited.length) console.log(`  [INFO] 官方德文本身即不平衡的 ${inherited.length} 行 (非我方缺陷, 与官方一致)`);
  if (ours.length === 0) ok('链接标记平衡 (相对官方无额外残缺)');
  else bad('链接标记平衡 (相对官方无额外残缺)', `${ours.length} 行 [[ 与 ]] 不等, 例: ${ours.slice(0, 6).join(' ; ')}`);
}

// ---- 5. 结论 ----
console.log('\n== 结论 ==');
if (fails.length === 0) console.log(`全部硬性检查通过 (${warns.length} 项警告)。`);
else { console.log(`失败 ${fails.length} 项: ${fails.join(' | ')}`); process.exitCode = 1; }
if (warns.length) console.log(`警告: ${warns.join(' | ')}`);
