// 生成 corpus/font-atlas/overrides.jsonl —— 人工裁决表
// 两条来源:
//   A) 换用自然措辞后, 旧版(界面串重写)反而更好的条目 -> 值取自【旧版备份】
//   B) 两边都不对、需要人工新写的条目
// 必须读 .tmp/strings_zh-CN.shipped.csv (旧版备份), 不能读 corpus/strings_zh-CN.csv
// —— 后者每次 --natural 都会被覆盖, 否则会造成自我引用。
import fs from 'node:fs';
import path from 'node:path';

const root = 'C:\\Users\\lxp_0\\Documents\\BTHanHua';
const SHIPPED = path.join(root, '.tmp', 'strings_zh-CN.shipped.csv');
const shipped = new Map();
for (const L of fs.readFileSync(SHIPPED, 'utf8').replace(/^\uFEFF/, '').split('\n').slice(1)) {
  const i = L.indexOf(',');
  if (i > 0) shipped.set(L.slice(0, i), L.slice(i + 1).replace(/\r$/, ''));
}

// A) 保留旧版措辞: 主要原因是自然版把专名留成了英文, 或旧版中文更忠实
const KEEP_SHIPPED = [
  ['fiji', '旧版已汉化"菲济", 自然版留 Fiji'],
  ['frenchguiana', '旧版"法属瓜亚那" > 自然版 French Guiana'],
  ['greenland', '旧版"格林兰" > 自然版 Greenland'],
  ['guyana', '旧版"瓜亚那" > 自然版 Guyana'],
  ['taurus', '旧版"托鲁斯"(地名) > 自然版"金牛座"(星座)'],
  ['tweet', '旧版"鸟叫" > 自然版"推文"; 上下文是鸟叫声效'],
  ['yourcompany%', '旧版"你的公司" > 自然版"你的部队"; 官方 de = Deine Firma'],
  ['destroytheziegelhauswhileprotectingmilitiahq', '旧版已汉化, 自然版留 Ziegelhaus'],
  ['makesurejailbirdslanceevacuatessafely', '旧版已汉化, 自然版留 Jailbird'],
  ['value:¢9^999', '旧版格式更整齐; ¢ 由星币符号阶段补'],
  ['¢9^999^999/qtr', '官方 QRT 未翻译, 旧版保留 QRT'],
  ['¢9999999/mo', '自然版把 "/月" 写成 "/周一"(星期一)'],
  ['[¢300^000^argo:hospitalbays]', '自然版把 Krankendecks(医疗舱) 译成"病态套牌"'],
  ['providegenerousmechbaysupportfor¢100^000*', '自然版丢了"提供…支持"'],
  ['providegenerousmedbaysupportfor¢100^000*', '自然版丢了"提供…支持"'],
  ['provideminimalmedbaysupportfor¢25^000*', '自然版 ¢ 位置错'],
  ['providesomesupportbutalsouseofthegymfor¢100^000*', '自然版丢了"提供部分支持"'],
  ['sellhimsomeheavyfirepowerfor¢150^000*', '自然版 ¢ 位置错'],
];

// B) 人工新写 (两边都不对, 或用户反馈的译文不准确)
const CUSTOM = [
  ['actually^ihaveadifferentideaofwhattodowiththeraven*',
    '其实，关于怎么处理这架渡鸦，我有个不同的主意。',
    '旧版"渡鸟"是缺"鸦"字的妥协; 自然版留 Raven'],
  ['capturethearmorytorecovertheprototyperaven', '占领军械库以回收渡鸦原型机',
    '旧版"渡鸟"、自然版 Raven, 都不如渡鸦'],
  ['recovertheprototyperaven', '回收渡鸦原型机',
    '旧版"Raven 比尔格原型"把 Birg(取回) 音译了, 是坏值'],
  ['u00a2999^999^999', '¢999，999，999',
    '旧版"999 修正."是坏值; 官方 de = ¢999.999.999'],
  // --- 用户反馈 (2024) ---
  ['scar', '疤痕',
    '用户反馈: 官方 de=Narbe / fr=Balafre 都是"疤痕"; 旧译"创伤"是 wound/trauma, 不准确'],
  ['makeup', '妆容',
    '用户反馈: 官方 de=Schminke / fr=Maquillage 都是"化妆品/妆容"; 旧译"美容"偏"美容院"义'],
  ['day', '日',
    '用户反馈: 设置里的日期格式显示"年/月/天", 应为"年/月/日"。day 这个 key 只做日期格式分量用, 时长另有 {0}days / 100days 等 key'],
  // --- 批量对照官方德文/俄文时发现的其它不准确处 ---
  ['showstock', '显示标准',
    '官方 de="Standard anzeigen" / ru="Станд." 都是"标准", fr 才是 stocks; 且"显示库存"过长会把按钮挤成两行'],
  ['med', '中型',
    '官方 de=Mittel; 与 轻型/重型/突击 保持一致的吨位级别用词 (旧译"中等")'],
  ['medium', '中型',
    '同上; 官方 de=Mittel'],
  ['40-55t', '40-55吨',
    '旧值"40- 55吨"多个空格, 与 20-35吨 / 80-100吨 不一致'],
  ['60-75t', '60-75吨',
    '旧值"60-75 吨"在"吨"前多一个空格'],
  ['gun', '枪炮',
    '用户反馈: 小长条只显示"枪"。gun 是 gunner 四项属性的缩写 key (官方 de="WAF." 即 Waffen 的缩写), ' +
    '但同排的驾驶/勇气/战术都是 2 字(tac 官方 de="Tak." 中文也仍是"战术"), 宽度放得下, 没必要单独截短'],
];

const out = [];
const notes = [];
const missing = [];
for (const [k, why] of KEEP_SHIPPED) {
  if (!shipped.has(k)) { missing.push(k); continue; }
  out.push({ key: k, value: shipped.get(k), src: 'shipped', why });
  notes.push(`  [旧版] ${k}\n         -> ${shipped.get(k).slice(0, 66)}\n         ${why}`);
}
// 前缀匹配的条目
for (const [k, v] of shipped) {
  if (k.startsWith('thestratfordnarwhalisjustupahead')) {
    out.push({ key: k, value: v, src: 'shipped', why: '旧版已部分汉化, 自然版整句留英文' });
    notes.push(`  [旧版] ${k}\n         -> ${v.slice(0, 66)}`);
  }
}
for (const [k, v, why] of CUSTOM) {
  out.push({ key: k, value: v, src: 'custom', why });
  notes.push(`  [新写] ${k}\n         -> ${v.slice(0, 66)}\n         ${why}`);
}

fs.writeFileSync(path.join(root, 'corpus', 'font-atlas', 'overrides.jsonl'),
  out.map((o) => JSON.stringify(o)).join('\n') + '\n', 'utf8');
console.log(`overrides.jsonl: ${out.length} 条 (旧版 ${out.length - CUSTOM.length}, 新写 ${CUSTOM.length})`);
if (missing.length) console.log(`!! 找不到的 key: ${missing.join(', ')}`);
console.log();
for (const n of notes) console.log(n);
