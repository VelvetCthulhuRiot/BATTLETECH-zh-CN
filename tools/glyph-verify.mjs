// 验证字形扫描: 用截图上确实正常显示的字符串反查; 并统计受影响条目的长度分布
import fs from 'node:fs';
import path from 'node:path';
const PROJ = 'C:\\Users\\lxp_0\\Documents\\BTHanHua';
const GLYPHS = path.join(process.env.USERPROFILE, 'Documents', 'My Games', 'BattleTech', 'mods', 'BTHanHuaFont', 'BTHanHuaFont.glyphs.txt');
const covered = new Set(fs.readFileSync(GLYPHS, 'utf8').replace(/^\uFEFF/, ''));

function missingIn(s) {
  const out = [];
  for (const ch of s) { if (ch.codePointAt(0) < 0x80) continue; if (!covered.has(ch)) out.push(ch); }
  return out;
}
console.log('=== 反查: 这些字符串在截图里显示正常, 扫描器认为缺哪些字 ===');
const probes = [
  '设置菜单', '游戏设置', '控制', '视频', '音频', '还原', '保存', '遭遇战', '战役', '职业生涯',
  '新游戏的困难设置', '机甲战士', '火力', '耐久', '声望', '合同', '战利品', '难度',
  '提高你在一个派系中的声望可以在该派系的商店中获得折扣.',
  '在最近与我军的一次遭遇战后，一支当地政府小队的幸存单位逃离了战场',
  '重型支援小队', '机甲库', '阿尔戈号', '指挥中心', '营房', '工程区', '导航室', '船长室',
  '瑞安斯菲特', '旅行', '天',
];
for (const p of probes) {
  const m = missingIn(p);
  console.log(`  ${m.length ? '[缺' + m.join('') + ']' : '[OK]    '} ${p}`);
}

console.log('\n=== 受影响条目的长度分布 ===');
const lines = fs.readFileSync(path.join(PROJ, 'corpus', 'strings_zh-CN.csv'), 'utf8').replace(/^\uFEFF/, '').split('\n');
const buckets = { '<=10': 0, '11-30': 0, '31-90': 0, '>90': 0 };
let affected = 0;
const examples = { '<=10': [], '11-30': [], '31-90': [], '>90': [] };
for (let i = 1; i < lines.length; i++) {
  const L = lines[i]; if (!L) continue;
  const j = L.indexOf(','); if (j <= 0) continue;
  const k = L.slice(0, j), v = L.slice(j + 1);
  const m = missingIn(v);
  if (!m.length) continue;
  affected++;
  const b = v.length <= 10 ? '<=10' : v.length <= 30 ? '11-30' : v.length <= 90 ? '31-90' : '>90';
  buckets[b]++;
  if (examples[b].length < 6) examples[b].push([k, v, m.join('')]);
}
console.log(`  受影响 ${affected} 条, 按译文长度: ${JSON.stringify(buckets)}`);
for (const b of Object.keys(examples)) {
  console.log(`\n  --- ${b} ---`);
  for (const [k, v, m] of examples[b]) console.log(`    [缺:${m}] ${v.slice(0, 60)}`);
}

console.log('\n=== 关键界面词里缺字的 (短串, 优先修) ===');
const uiFix = [];
for (let i = 1; i < lines.length; i++) {
  const L = lines[i]; if (!L) continue;
  const j = L.indexOf(','); if (j <= 0) continue;
  const k = L.slice(0, j), v = L.slice(j + 1);
  if (v.length > 30) continue;
  const m = missingIn(v);
  if (m.length) uiFix.push([k, v, m.join('')]);
}
console.log(`  短串(<=30字)里缺字的: ${uiFix.length} 条`);
for (const [k, v, m] of uiFix.slice(0, 40)) console.log(`    [缺:${m}] ${v}   <= ${k.slice(0, 40)}`);
fs.writeFileSync(path.join(PROJ, 'corpus', 'glyphfix-ui.jsonl'), uiFix.map(([k, v, m]) => JSON.stringify({ key: k, zh: v, missing: m })).join('\n') + '\n', 'utf8');
