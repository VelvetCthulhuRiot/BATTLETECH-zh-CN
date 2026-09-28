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
  // --- 用户反馈 (机甲库) ---
  ['assassin', '刺客',
    '用户反馈: 机甲库里 ASN-101 显示"刺杀"。官方 de 这个 key 是 Assassin(机甲型号, 名词), ' +
    '而"刺杀"对应的是另一个 key assassinate(官方 de=Attentat)。名词应译"刺客"'],
  // --- 用户反馈 (飞行员呼号, 都是官方已有 key 的"改值") ---
  ['vonkobra', '冯·科布拉',
    '用户反馈: 旧值"冯眼镜蛇"把德语贵族前缀 von 与单词 Kobra(眼镜蛇) 拆开直译了。' +
    '这里是人名 von Kobra, 应整体处理: von 译"冯", Kobra 作姓氏音译"科布拉"'],
  ['bronzite', '古铜',
    '用户反馈: 旧值"古铜辉石"是矿物的字典义, 作呼号太长、太像材料名。' +
    '呼号应简短意译 -> "古铜"'],
  ['brawler', '斗士',
    '用户反馈: 旧值"主战机"不是 Brawler 的意思。官方 de=Kämpfer(斗士/战士), ' +
    'Brawler 亦指标称擅长近身缠斗的机师 -> "斗士"。' +
    '注意: 这是【飞行员呼号】(pilot_d7_brawler); 同名的机甲角色标签(heavybrawler / brawler&closeassault 等)按用户要求不动'],
  ['elitebrawler', '精锐格斗',
    '用户裁决: 这也是【飞行员呼号】("Elite Brawler", pilot_d10_brawler), 应与其同源的 ' +
    '机甲角色 brawler(格斗, 见 corpus/stock-role-zh.tsv) 保持一致 -> "精锐格斗"。' +
    '注意 brawler 这一个 key 被呼号与角色共用, 用户定了角色的"格斗"'],
  // --- 用户反馈 (剧情文本: 译者凭空加的注解 / 断句错误) ---
  ['thekellhoundsmercenarycommandwasfoundedin3010bypatrickandmorgankell^usingtheinheritancefromthedeathoftheirfather*',
    '凯尔猎犬佣兵团是在3010年，由帕特里克和摩根·凯尔利用父亲死后的遗产创立的。',
    '用户反馈: 译文里冒出一对莫名其妙的括号"帕特里克(·马丁·凯尔)"。对照官方 de 与其它的凯尔猎犬词条, ' +
    'Patrick Kell 没有中间名, "·马丁·凯尔"是译者凭空加的, 已删'],
  ['[laughing]boldwords^cousinbuttheonlyvictorytheyllbecelebratingismine*youmaybeascendingthethronetoday^butmykagaismorethanamatchforthefamilyheirloomthatyoucallabattlemechandinthearena^ireignsupreme*',
    '[大笑]说大话呢，表姐……可他们要庆祝的胜利只有一场，那就是我的胜利。也许你今天会登上王座，但我的""加贺""可不比那台被你称作战斗机甲的传家宝逊色……而在竞技场上，唯我独尊。',
    '用户反馈: 旧译""加贺""Kaga(维公主的K-2型""弩炮"")夹着英文还带一段括号注解, 很不通顺。' +
    'en 原文只有 "my Kaga is more than a match for the family heirloom that you call a BattleMech", 括号注解系译者自加, 已删'],
  ['wecallthecataphractafrankenmechbecauseitsgotalittlebitofeverythingstitchedtogetheronit*the1xmodelworkswellatmedium-longtocloserrange^withgoodarmorandweaponry*',
    '我们管""重甲铁骑""叫""拼装机甲""，因为它身上拼着五花八门的东西。1X 型在中远程到较近距离都表现良好，装甲和武器都不错。',
    '用户反馈: 旧值把 FrankenMech 留了英文; 另外"东西.1X型"在句号后直接接型号, 断句是错的。' +
    '⚠️ 人工裁决段跑在"机甲名统一/改名"段【之后】, 所以这里必须写【当前】译名(重甲铁骑); ' +
    '写旧名(具装骑兵)会把改名覆盖回去 —— 曾因此残留 1 处, 由一致性核查抓出'],
  ['checkitout^bosswevelandedourselvesafrankenmech!lookslikeacrab^butontheinside^itsatleastaquarterurbiethatswherethenewballisticmountinghardwarecamefrom*imhonestlyamazedthatthisthingevenworks^butitdoes^anditsoursnow!',
    '快看，老板。我们弄到了一台""拼装机甲""！外形像一台""蟹""，可里面至少有四分之一是""都市战甲""——那些新的弹道挂载硬件就是从它身上来的。说实话，我很惊讶这东西居然还能动，但它确实能动，而且现在是我们的了！',
    '用户反馈: FrankenMech 应译"拼装机甲"; 顺带把"蟹式"按 glossary 改成机甲名"蟹"并加引号; ' +
    'UrbanMech 按用户新表定为"都市战甲"'],
  ['theum-r90suburbanmechadaptsthetraditionalurbanmechr60intoanenergyweaponplatformforhigherperformance*becauseitsweaponsarentlimitedbyammunitionconcerns^ther90isbetter-suitedtolongerengagements*',
    'UM-R90""小都市战甲""将传统的""都市战甲"" R60改造成能量武器平台，以求更好的表现。由于它的武器不受弹药问题限制，因此R90型更适合长时间的交战。',
    '旧译在中文名后面还留着英文 "UrbanMech R60", 而机甲英文名的加引号规则把这个残留英文替换成了' +
    '带引号的中文名, 与前面已有的中文名撞成 4 连引号 (撞了 verify-csv 的"引号连续段不超过 2 个")。' +
    '对照官方 de 重写本句'],
  // --- 用户反馈 (机甲部件名) ---
  ['bscsystem', '弹道攻城补偿系统',
    '用户反馈: 旧值"BSC星系"是错的。原文是 "BSC System" —— 歼灭者出厂自带的弹道攻城补偿器 ' +
    '(见该部件自身描述: "歼灭者"内置的弹道攻城补偿器), 而 System 被当成天文"星系"了。' +
    '官方 de 本地化为 "BBS-System"(BBS 是德语缩写), 说明官方也按"系统"处理'],
  ['statuseffect-bsc-ballisticboost', '状态效果 BSC 弹道提升',
    '用户反馈: 旧值"状态效果 BBS 弹道提升"里的 BBS 是【德语】缩写, 被从官方 de 照抄了过来。' +
    '英文原文是 BSC, 与旁边那条 statuseffect-bsc-maxstabilityboost(状态效果 BSC 最大稳定性提升) 对齐'],
  // --- 用户反馈: 部件属性标签 "奖励" 改 "效果" ---
  ['bonuses', '效果',
    '用户反馈: 机甲部件提示框里那行"奖励:"读着别扭, 更愿意看"效果"。' +
    '官方 de 是 "Boni"(加成), 语义就是部件的属性加成, 不是任务报酬 -> "效果"'],
  ['bonuses:', '效果:',
    '同上 (带冒号的那一条, 部件提示框实际用的就是它; 官方 de="Boni:")。' +
    '注意 reward / rewards (de=Belohnung) 是【任务报酬】, 仍译"奖励", 两者不要混'],
  // --- 用户反馈: 部件短简介与新名字对齐 ---
  ['theintegratedballisticsiegecompensatorsoftheannihilatorturnitintoanindomitablekillingmachine*speciallytunedtothebehemothsstatureandstride^thisequipmentincreasesmaximumstabilityandballisticweaponrydamage*',
    '""歼灭者""内置的弹道攻城补偿系统使它成为一台不可阻挡的杀戮机器。这套装备专门针对这头巨兽的体型与步幅调校，能提升最大稳定性与弹道武器伤害。',
    '用户反馈: 部件名已定为"弹道攻城补偿系统", 简介里写的是"补偿器", 用词没对齐; ' +
    '另外 ""歼灭者"" 后面多了一个空格'],
  // --- 用户反馈: 副舰长名字前面的破折号 ---
  ['darius', '达吕斯',
    '用户反馈: 对话里副舰长的名字显示成" —达吕斯", 名字前面多一个破折号。' +
    '官方 de 就是光秃秃的 "Darius", 那个 " —" 是我们自己加的 (旧值 " —达吕斯") -> 去掉'],
  ['kerensky', '克伦斯基',
    '顺带扫出来的同类脏数据: 旧值 " 克伦斯基" 带一个前导空格 (官方 de="KERENSKY"), 会显示成多一个空格'],
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
