// 生成 corpus/font-atlas/overrides.jsonl —— 人工裁决表
// 两条来源:
//   A) 换用自然措辞后, 旧版(界面串重写)反而更好的条目 -> 值取自【旧版备份】
//   B) 两边都不对、需要人工新写的条目
// 必须读 .tmp/strings_zh-CN.shipped.csv (旧版备份), 不能读 corpus/strings_zh-CN.csv
// —— 后者每次 --natural 都会被覆盖, 否则会造成自我引用。
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 仓库根目录: 从脚本自身位置推导 (脚本位于 <root>/tools/)。
// 这样克隆下来就能直接跑, 也避免把开发机的用户名写进公开仓库。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
    '官方 de=MTL(缩写); 与 轻型/重型/突击 保持一致的吨位级别用词 (旧译"中等")。' +
    '注意: 这是 UI 里的紧凑标签 key("MED"), 与画面质量下拉用的 medium 不是同一条'],
  ['medium', '中型',
    '用户反馈(第七轮): 视频设置里"质量"下拉显示成"低 / 中型 / 高 / 超高 / 自定义"。' +
    '根因: **这条 key 被两个界面共用** —— ① chassisdef 的 "weightClass":"MEDIUM"(机甲吨位级别, ' +
    '与 轻型/重型/突击 同族, 出现频率高) ② 画质下拉档位(Unity 画质名 "Medium", ' +
    '与 低/高/超高/自定义 同族, 官方 de 全是全大写 NIEDRIG/HOCH/ULTRA/BENUTZERDEFINIERT)。' +
    'CSV 一条 key 只能一个值 -> 取"中型"让机甲侧天然正确; 设置界面里的画质下拉改由 ' +
    'BTHanHuaFont.dll 运行期按界面分派(见 FontMod.cs 的 FixMedium: 探针是设置界面独有的文本, ' +
    '只在设置界面可见时把"中型"写成"中")'],
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
  // --- 用户反馈 (第二轮: 深玩后逐条截图) ---
  ['melee', '近战攻击',
    '用户反馈: 战斗界面右下武器栏里近身攻击那一行显示"肉搏", 要求改成"近战攻击"。' +
    '这是 WeaponCategory 枚举, 只当武器名用 (官方 de="Nahkampf"); 其余含 melee 的条目' +
    '(肉搏伤害 / 命中 / 回避 …) 走 merge-final 的"肉搏->近战"术语统一, 不在这里逐条改'],
  ['well^shit*', '我操！',
    '用户反馈: 阿拉诺夫人死讯那三个回答里, 第一条"哦，狗屎。"太生硬, 直接译"我操！"即可。' +
    'en="Well, shit." / 官方 de="Oh, scheiße." / fr="Ah, merde."'],
  ['damnit*whatawaste*', '妈的，全白费了。',
    '用户反馈: 第三条"该死的。真是浪费。"翻译腔明显(中文口语不说"该死")。' +
    'en="Damnit. What a waste." / de="Verdammt. So eine Verschwendung." / fr="Bon sang. Quel gâchis." -> 口语化'],
  // --- 顺带扫出来的同源问题 (同一批 key 里的漏译/坏值) ---
  ['masonsmarauders', '梅森的掠夺者',
    '顺带扫出来的同类漏译: 这是闪点里那支佣兵团的 factionID, 出自 ' +
    'data/cast/castDef_FP_justinAllard_GarrilacDefault.json, 值一直是英文原名 "MasonsMarauders"。' +
    '官方 de="Masons Marodeure" / fr="Les maraudeurs de Mason"; CSV 里另外 4 处同词已译"梅森的掠夺者", 对齐'],
  ['[flashpointdecision:agreetofightmasonsmarauders*]iacceptyourterms*wellmeetyouonthegroundfortheduel*',
    '<color=#85DBF6FF> [闪点决定:同意， 与梅森的掠夺者战斗。] </color> 我接受你的条件。到地面上来一决胜负吧。',
    '顺带扫出来的坏值: 与上一条同一句闪点决定(另一条写的是"梅森的掠夺者"), 这条把 Mason 当"泥瓦匠"译成了' +
    '"打击泥瓦匠掠夺者"。en=I accept your terms. We\'ll meet you on the ground for the duel.'],
  ['lordcommandermason', '领主指挥官梅森',
    '顺带扫出来的坏值: 旧值"军阀梅森"把 Lord Commander 当成了"军阀"(warlord)。' +
    '官方 de/fr 都保留 "Lord Commander Mason"; 这是 castDef 的 firstName, 会显示在对话框抬头 -> 直译'],
  // --- 用户反馈 (第二轮): 整句重写 (含英文专名/换行, 只能放这里 —— 见 merge-final 术语统一段的注释) ---
  ['mynameisdariusoliveira^andimthexoofmarkhamsmarauders*newlinenewlinewereamercenaryoutfitwithtiestohousearanowedidsomeworkfor[[dm*basedescriptiondefs[lorehighlordtamatiarano]^highlordtamatiwaybackwhen*',
    '我叫达吕斯·奥利维拉，是马卡姆的掠夺者佣兵团的副舰长。\\n\\n我们是一支和阿拉诺家族有联系的雇佣兵部队...很久以前，我们曾为[[DM.BaseDescriptionDefs[LoreHighLordTamatiArano]\u001f最高领主塔马蒂]]效力，那时他还活着。',
    '用户反馈: 对话里显示成"是马卡姆\'s Marauders的副舰长" —— 英文原名连所有格 \'s 一起留在译文里, 没译。' +
    '官方 de="der ausführende Offizier von Markhams Marodeuren" / fr="chef des Maraudeurs de Markham"; ' +
    'Marauders 按 glossary(Marauder=掠夺者) 与 CSV 里既有的"马卡姆的掠夺者"处理'],
  ['idintroduceyoutocommandermarkham^buthewasonasupplyruninthemarketdistrictwhenthebombsfell*he^uhwell*newlinenewlinehedidntmakeit*',
    '我本想向您介绍马卡姆指挥官，但炸弹落下时他正在市场区。他，呃……好吧。\\n\\n他没有活着出来。',
    '用户反馈: 这句对话里冒出一个莫名其妙的"H", 读不通。' +
    'en="I\'d introduce you to Commander Markham, but he was on a supply run in the market district when the bombs fell. ' +
    'He, uh... well." —— 旧值把 "uh" 译成了坏值"?H", 而且"市场区"后面多一个"，。"。' +
    '顺带把 "I\'d introduce you to"(虚拟语气)补成"我本想向您介绍"'],
  // ================= 用户反馈 (第三轮: 教程对话 / 机甲库那一屏 / 阿尔戈号升级界面) =================
  // --- ① 教程选项: 一个坏掉的富文本标签 + "Heat" 被译成"温暖" ---
  ['[tutorial:heat^stability^andmodifiers]youseemtoknowyourwayaroundabattlefield^yang*anyadvice?',
    '<color=#85DBF6FF> [教程:热量、稳定性与修正因子] </color> 你似乎对战场很在行，杨。有什么建议吗？',
    '用户反馈: 这条选项直接把 <color = #85DBF6FF> 当文字显示出来了, 而且"温暖"读不通。' +
    '① 旧值里标签写成 "<color = #85DBF6FF>"(等号两侧有空格), 游戏富文本解析不了 —— ' +
    '同一个菜单其它选项都是无空格的 "<color=#85DBF6FF>", 已对齐;' +
    '② key 就是 en 原文 "[tutorial:heat^stability^andmodifiers]", Heat 是"热量", 旧值译成了"温暖";' +
    '官方 de="[Tutorial: Wärme, Stabilität und Modifikatoren]"。Modifiers 按语料主流写法"修正因子"(26 处)' +
    '(旧值"修饰符"全库只有这一处);' +
    '③ 后半句 en="You seem to know your way around a battlefield, Yang." 是对杨说的, 旧值写成了"他们"'],
  ['[tutorial:mechbay]anythingishouldknowaboutthemechbaysthemselves?',
    '<color=#85DBF6FF> [教程:机甲库] </color> 关于机甲库本身，我应该了解什么？',
    '用户反馈(机甲库术语混乱): 标签里夹着英文"教程:Mech 机库", 正文又问的是"维护脚手架"。' +
    'en="anything I should know about the MechBays themselves?" —— 问的是机甲库本身, ' +
    '旧值是被官方德语"Wartungsgerüste"(维修脚手架)带偏了。Mech Bay 统一叫"机甲库"'],
  ['[tutorial:mechcomponents]ivebeenwonderingaboutthecomponentsyoucanputonourmechs*',
    '<color=#85DBF6FF> [教程:机甲组件] </color> 我一直在琢磨能给我们机甲装哪些组件。',
    '顺带修同一菜单的口径: key 是 [tutorial:mechcomponents], 官方 de="Mech-Komponenten", ' +
    '而旧值写了"机械组件"(机械=mechanical)。另外 en="I\'ve been wondering about the components you can put on our mechs." ' +
    '是"一直想知道", 旧值"我想了解更多关于我们机械组件的信息"把句子译散了'],
  // --- ② 机甲维修界面: 吨位后面多出来的那个 "S" ---
  ['{0:0*##}ton{1}remaining', '剩余 {0:0.##} 吨',
    '用户反馈: 机甲维修界面显示"12吨S剩余", 多一个莫名其妙的 S。' +
    '这是 en 的复数后缀占位符: en 模板是 "{0} ton{1} remaining"({1} 填 "s"), ' +
    '中文没有复数, 必须整个去掉 —— 官方 fr 就是硬写 "{0:0.##} t restante(s)" 不接 {1}(de 接了, 是官方德语的毛病)'],
  ['{0:0*##}ton{1}overweight', '超重 {0:0.##} 吨',
    '同 ②, 是它的"超重"兄弟 key: "{0} ton{1} overweight" 里的 {1} 也是复数后缀, 去掉'],
  ['{0:###0*##}ton{1}remaining', '剩余 {0:###0.##} 吨',
    '同 ②(另一种小数位格式的同义 key): 旧值"仍然是 {0:###0.##} 吨"既保留了怪语序又丢了语义, 统一'],
  ['{0:###0*##}ton{1}overweight', '超重 {0:###0.##} 吨',
    '同 ②(另一种小数位格式的同义 key): 旧值"{0:###0.##}吨{1}超重"同样会多出一个 S'],
  // --- ③ 机甲库那一屏: Mech Bay / Mech Cubicle / Repair Scaffolding 三个词分清楚 ---
  ['bays', '机甲库',
    '用户反馈(机甲库术语混乱): 机甲库界面顶部那个页签显示"机库", 而左侧导航/阿尔戈号升级卡都叫"机甲库"。' +
    '官方 de="Buchten" / fr="Baies" 就是 Mech Bay。本项无 src(界面标签, 来自 prefab)'],
  ['bay1', '1号机甲库',
    '用户反馈(机甲库术语混乱): 机甲库里每一栏的标题是"1号库", 与升级卡的"1号机甲库"(key mechbay1)不一致。' +
    '官方 de="Bucht 1" / fr 同样是 Bay 1'],
  ['bay2', '2号机甲库', '同 bay1: 官方 de="Bucht 2"; 与 key mechbay2 的"2号机甲库"对齐'],
  ['bay3', '3号机甲库', '同 bay1: 官方 de="Bucht 3"; 与 key mechbay3 的"3号机甲库"对齐'],
  ['bayl', 'L号机甲库', '同 bay1: 官方 de="Bucht L"(Leopard 上的机库位)'],
  ['beyondeachcubicleholdingonebattlemech?notmuch*itsallaboutcapacity*themoremechbayswehave^themoremechswecankeepbattle-ready*andthemoremechswehavebattle-ready^themoreflexibilityyouhaveinyourdeploymentoptions*',
    '除了每个机甲隔舱能放一台战斗机甲，也没什么了。这主要是容量的问题：我们的机甲库越多，能保持战备状态的机甲就越多；战备状态的机甲越多，您在部署时的选择就越灵活。',
    '用户反馈(机甲库术语混乱): 这条回答里 cubicle 和 mech bay 都被译成了"维修脚手架/维护脚手架", 同一句话里两个不同的东西用同一个词。' +
    'en(就在 key 里)="Beyond each cubicle holding one BattleMech? Not much. It\'s all about capacity. ' +
    'The more Mech Bays we have, the more mechs we can keep battle-ready..." —— ' +
    '用户给的口径: 每库6个隔舱、每舱一台战备机甲。所以 cubicle="机甲隔舱"(与 key theargosmechbayisvast 的既有译法一致)、Mech Bay="机甲库"; ' +
    '"维修脚手架"是另一件东西(key repairscaffolding, Repair Scaffolding)'],
  ['thepowersbackontotherestofthemechbay^andwecanstartrepairsonthelastsixcubicles*evenifyoudontwanttofillthemwithmechs^believeme^icanputtheextraspacetogooduse*itsgonnatakeashitloadofwork^though*',
    '机甲库其余部分的电力恢复了，我们可以开始修复最后6个机甲隔舱。就算你不想用机甲把它们填满，相信我，多出来的空间我也能派上大用场。不过，这活儿可不轻松。',
    '同 ③: 旧值"我们可以开始修复最后的6间隔舱"漏了"甲"字(机甲隔舱), 且"只是还有好多工作要做"语气太弱' +
    '(en="It\'s gonna take a shitload of work, though.")'],
  ['dependsonthemechbayconditionsyoureworkingin*agoodmechbaywithadvancedscaffoldingandequipmentisfasterthanoneyoullfindonastandardleopard*',
    '取决于您在什么样的机甲库里干活。一座配有先进维修脚手架和设备的机甲库，要比标准豹式上的机库快得多。',
    '同 ③: 旧值"取决于您正在工作的机库 ， 的状况。配备高级维护脚手架和工具的良好机库比普通豹子上的机库要快 ，。" ' +
    '既把 Mech Bay 写成"机库"、又用"维护脚手架/脚手架"两种写法、Leopard 还译成了"豹子"(语料里是"豹式"), ' +
    '而且原句里那个多余的"，。"是坏值'],
  ['idisplayourmechbaysefficiencyinmechtechpointsonyourtraveldisplayunderthefinancesandcrewmoralereadouts*thehighertherating^thefastertherepairs*',
    '我们机甲库的效率以""技师点数""的形式显示在您的旅行显示屏上，就在财务和士气的数值下面。这个数值越高，修复速度越快。',
    '同 ③: 旧值"我们机库的效率显示在您旅行显示屏上的 MechTech 点数中 ， 在财务和团队士气的值下。" 有两个问题: ' +
    'Mech Bay 写成"机库"; MechTech 直接留了英文, 而语料里这个属性统一叫"技师点数"' +
    '(见 DM.SimGameStatDescDefs[SimGameStatDesc_MechTechSkill] 的引用文本, 与升级卡" +2技师点数"一致)'],
  ['nomechtechnewlinetasksscheduled', '没有技师\\n任务安排',
    '同 ③: 旧值"没有 MechTech 任务 \\n 计划"把 MechTech 留成英文, 而且换行符位置不对' +
    '(官方 de="Keine MechTech-\\nAufgaben geplant" 是在词中间断行的两行标签)'],
  ['noemptybays', '没有空闲的机甲库位',
    '同 ③: 旧值"没有空闲的机库位"用了没统一的"机库"(官方 de="Keine freien Buchten")。' +
    '⚠️ 这条只是把词统一, 没有改语义 —— 到底指"机甲库满了"还是"这一库里6个隔舱都占了", 等用户在界面上真遇到再定'],
  // --- ④ 阿尔戈号升级界面: 大图标下的分类标签与模块名不一致 ---
  ['habitatpods', '居住舱',
    '用户反馈: 升级界面大图标上写"栖息胶囊", 点开后简介里的分类标签却是"居住舱"。' +
    '"栖息胶囊"是照官方德语"Habitatkapseln"(Kapsel=胶囊)硬译的; 三个舱本身叫"阿尔法舱/贝塔舱/伽玛舱", ' +
    'en=Habitat Pods。统一到 popup 用的"居住舱"(key habitatpod)'],
  ['repairrefit', '维修与改装',
    '用户反馈: 同一类升级, 大图标写"维修与改装"(key repair&refit), 点开后分类标签写"修复改造"。' +
    '官方 de 两处都是 "Reparieren und umrüsten" -> 统一到"维修与改装"'],
  ['training', '训练模块',
    '用户反馈: 阿尔戈号升级界面大图标写"训练模块"(key trainingmodules, 官方 de="Ausbildungsmodule"), ' +
    '点开后分类标签却是"训练"。本 key 的 src 就是 argoUpgrade_trainingModule1.json, 只当这个分类标签用 -> 统一'],
  // --- ⑤ 顺带: 同一个"标签被写坏"的家族 (官方三语都能跑, 就我们的写法会原样显示标签) ---
  ['currentprofile:none', '当前配置文件: <color=red>无</color>',
    '顺带扫出来的同类坏值: 旧值 "当前配置文件:<color = ""red "">NONE </color>" 里等号两侧有空格, ' +
    'TMP 解析不了会原样显示标签。官方三语都是无引号、无空格的 "<color=red>" 并把占位符译出' +
    '(de="Aktuelles Profil: <color=red>KEINS</color>" / fr=AUCUN / ru=НЕТ), 照此对齐; ' +
    '注意英文源串 strings_dev-WWW.csv 里是 "<color=""red"">", 官方本地化都去掉了引号, 这里跟官方'],
  ['customid:none', '自定义 ID: <color=red>无</color>',
    '同 currentprofile:none(官方 de="Benutzerdefinierte ID: <color=red>KEINE</color>")'],
  // ================= 用户反馈 (第五轮: 任务进度显示不出百分比 / 制造商名) =================
  // --- ⑥ 任务目标进度: 显示成字面"[完成百分比]" ---
  ['[percentagecomplete]', '[percentageComplete]',
    '用户反馈: 战斗界面左上角任务目标下面显示的是字面"[完成百分比]", 没有数值。' +
    '这是一条【标记串】: 任务数据里的原文就是 "[percentageComplete]", 游戏先本地化、' +
    '再在结果里找这个 token 替换成真实百分比 —— 译掉就找不到, 于是原样显示。' +
    '官方 de/fr 都保持 "[percentageComplete]" 不译(这就是证据)。已改回与官方完全一致的写法'],
  ['[durationremaining]', '[durationRemaining]',
    '同 ⑥: 同一家族的另一条标记串("剩余时间"型目标)。旧值"[剩余时间]"一样会让游戏找不到 token;' +
    '官方 de/fr 都保持 "[durationRemaining]" 不译 -> 改回'],
  // --- ⑦ "复数后缀"占位符: en 的 {N} 是给 "s" 用的, 中文必须丢掉 ---
  ['{0}component{1}', '{0}部件',
    '顺带扫出来的同类坏值(截图里机甲库"拆除"处显示"0部件 S")。en="{0} component{1}", {1} 是复数后缀 s;' +
    '官方 de 硬写 "{0} KOMPONENTE(N)" 不接 {1} -> 中文丢掉 {1}'],
  ['{0}day{1}', '{0}天',
    '同 ⑦: en="{0} day{1}"({1}=s), 官方 de="{0} Tag(e)" -> 丢掉 {1}'],
  ['-{0}/{1}day{2}newlinemechtechrating:{3}',
    '<color=#DE6729> - {0}</color> / {1}天\\n机甲技师评级: {3}',
    '同 ⑦: 时间线"工期 / 机甲技师评级"那行, en="{1} day{2}" 的 {2} 是复数后缀;' +
    '官方 de="{1} Tag(e)" -> 丢掉 {2}(旧值会显示成"3天s")'],
  ['gamestartingin:{0}second{1}', '游戏开始时间: {0}秒',
    '同 ⑦: en="{0} second{1}"({1}=s)。官方 de/fr 保留了 {1}(会显示成"5 SEKUNDEs", 是他们的问题),' +
    '中文没有复数 -> 丢掉'],
  ['thischassisrequires{0}morepart{1}beforeitcanbereadiedforcombat*',
    '在该机体能进入战备之前，还需要{0}个部件。',
    '同 ⑦: en="{0} more part{1}"({1}=s)。旧值写成"{0}个{1}部件" —— 顺序错了,' +
    '实际显示会是"还需要2个s部件"; 官方 de="{0} weiteres Teil{1}" 也是照抄源串。中文写"还需要{0}个部件"'],
  // --- ⑧ 制造商那一行的标签 "制造商:" ---
  ['manufacturer:', '\u200b',
    '用户反馈: "制造商：通用工业"这种写法不对 —— 用 Generic 的都是弹药/推进器/散热器,' +
    '它表达的是"通用零部件"而非厂商, 译名已改成"通用组件"(见 corpus/manufacturers-zh.tsv)。' +
    '这个 "制造商:" 前缀是**所有部件共用**的标签 key(官方 de="Hersteller:"), 没法只对通用件去掉,' +
    '所以整行标签置为一个零宽空格 U+200B: 界面上不再出现"制造商:"三个字, 只显示名字。' +
    '注意: 这同时影响那 52 个真实厂商(变成裸名字); 想恢复就把本行删掉。' +
    '(U+200B 是格式符, 不需要字形, 也不触发 verify-csv 的控制字符闸门)'],
  // ================= 用户反馈 (第八轮: 战场设置标签 / 机甲短简介) =================
  // --- ⑨ "Mood" 那个下拉: 选项是"时段+天气"的灯光氛围预设, 不是情绪 ---
  ['mood', '天候',
    '用户反馈: 遭遇战设置里"地图"旁边那个下拉标签译成了"情绪", 而选项是"雾茫茫的下午/雨天/日落/雾夜"这类' +
    '时段+天气的预设。官方 de/fr 都按字面直译成 Gemütslage / Humeur(也是错的), 所以按实际内容取名。' +
    '最终用**"天候"**(用户选定; 比"氛围"更贴——预设就是天候+时段; 2 字与"地图"等宽)'],
  ['mood:', '天候：', '同 ⑨(带冒号的同义标签)'],
  ['moods', '天候', '同 ⑨(复数形式, 同一组预设)'],
  // --- ⑩ 都市战甲短简介: 昵称被直译成"市区" ---
  ['dontletthestubbyurbiefoolyouitmaylooklikeawalkingtrashcan^butitcanmountheavyarmorandagrown-up-sizedautocannon*r60sarentknownfortheirspeed^buttheyareveryusefulifyoucandrawtheenemyintotheirfiringrange*',
    '""不要被粗短的""都市战甲""给欺骗了\\u2014也许它看起来像个行走的垃圾罐，但它能安装厚重的装甲和一门大口径自动炮。R60的速度并不出众，但如果你能把敌人引入它们射程的话，那它们会很有用。',
    '用户反馈: 描述里写着"市区"。en="Don\'t let the stubby \'Urbie\' fool you" —— Urbie 是 UrbanMech 的昵称, ' +
    '被按 urban 直译成了"市区"。改用机甲既定译名"都市战甲"(与机甲库一致)。' +
    '顺带去掉旧值里中文句号后的多余空格; 破折号沿用官方 CSV 的 \\u2014 写法(游戏能渲染, 截图为证)'],
  // --- ⑪ 驼背 4G: "重锤机"要跟已统一的"重装"对齐; 还有 "to boot" 被当成"足部" ---
  ['thehunchback4gisatriedandtestedjuggernautonthefield*oneofthelightestmechstomountsuchamassiveautocannon^itiscapableofdestroyingsomelighterunitsinasinglevolley*ittendstomountheavyarmortoboot*',
    '""驼背4G""是在战场上久经考验的重装机甲。它是安装了此等巨大自动炮的机甲中最轻的一种，能一次齐射干掉几个轻型单位。而且通常还会加装重甲。',
    '用户反馈: 描述里的"重锤机"是被替换掉的旧词, 应作"重装机甲"。en="a tried and tested juggernaut", ' +
    '而 juggernaut 在常备角色表里已统一为"重装"(见 merge-final 的 ROLE-ZH: juggernaut=重装)。' +
    '顺带修一个硬伤: 旧值"一般都会在它的足部安装重甲"把 en 的 "to boot"(此外/而且) 当成了靴子/足部 -> 改成"而且通常还会加装重甲"'],
  // --- ⑫ 黑豹 9R: "甚至为了产生良好的效果" ---
  ['panther9rsaresolidall-aroundmechs^ifabitontheslowside*theymakeupforitwithjumpjets^considerablearmor^andaheftypunchfromtheirtrademarkppc*theyveevenbeenusedinphysicalsluggingmatchestogoodeffect*',
    '""黑豹9R""是一种坚固的全能机甲，就是有点慢。它们靠跃进喷射器、可观的装甲，以及标志性粒子炮的强力一击弥补了这点。甚至为了物尽其用，它们还被用于拳击比赛。',
    '用户反馈: "甚至为了产生良好的效果"改成"甚至为了物尽其用"(en="They\'ve even been used in physical slugging ' +
    'matches to good effect")。顺带去掉一句话里重复的"可观":"标志性的粒子炮发出的可观攻击" -> "标志性粒子炮的强力一击"'],
  // --- ⑬ 纵火犯 FS9-H: 用户重写的两句 ---
  ['thefirestarterisadangerousmechforitstonnagecarefullytimedattackswithitsflamerscanshutdownanymechandleaveitopentopunishmentfromyourotherforces*thefs9-halsomakesadecentlightmechhunter-killer*',
    '""纵火犯""就它那个吨位而言是一种危险的机甲—时机恰当的喷火器攻击能让任何机甲过热关机，让它们毫无防御地承受来袭的攻击。FS9-H也是一种相当好的轻型""机甲猎手""。',
    '用户反馈改稿: "能关闭任何机甲，让它敞开迎接来自你其它部队的惩罚" -> "能让任何机甲过热关机, ' +
    '让它们毫无防御地承受来袭的攻击"(en="shut down any \'Mech and leave it open to punishment from your other forces")'],
  // --- ⑭ 顺带: 机甲提示框里那个 "( Class: ... )" 模板整段没译 ---
  ['(class:{0})', '( 类别: {0} )',
    '顺带扫出来的英文残留: 用户截图里机甲提示框顶部显示"30吨 (CLASS: 轻型)" —— 标签来自这条模板, ' +
    'en="( Class: {0} )" / de="( Klasse: {0} )", 我们只译了 {0} 没译标签。' +
    '"类别"与已有的 class:light/medium/heavy/assault 四条("类别: 轻型"…)保持一致'],
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
