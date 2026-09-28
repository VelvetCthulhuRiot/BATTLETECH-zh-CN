# 用开源字体重建字形图集 —— 彻底解决缺字问题

> 本文是给后续开发者/协作者的**技术方案**。背景见 README 的
> 「有些译文读起来怪怪的？那不是翻译错了」一节。

## 问题是什么

游戏自带字体不含汉字，所以汉化必须注入一个中文字形图集。现在用的是社区字体包
（`mods/BTHanHuaFont/font`，16.2 MB UnityFS），它只有 **2,610 个汉字**，
而我们的语料在**自然措辞**下需要 **2,463 个汉字**，其中 **801 个不在图集里**。

图集外的字在游戏里直接渲染成**方块**，所以只能逐字替换，这就是
`眉毛 → 眼毛`、`渡鸦 → 鸟/Raven` 这类"怪译文"的根源：**816 条替换规则，作用于约 2,300 条译文**。

## 已测定的事实（别再重复踩）

| 项目 | 实测值 | 来源 |
|---|---|---|
| 现有图集尺寸 | **4096 × 4096** | `BTHanHuaFont.log`: `glyphs=2615 atlas=4096x4096` |
| 现有图集字形数 | 2,615（汉字 2,610） | 同上 + `tools/glyph-covered.txt` |
| 现有图集字号 | `FaceInfo.PointSize = 75` | 同上（mod 为缩小字形把它调到 82.5） |
| 现有材质 / 纹理名 | `MSYH SDF Material` / `MSYH SDF Atlas` | 同上 |
| **实际使用的 shader** | **`TextMeshPro/Bitmap`** | 二进制字符串抽取：`TextMeshPro/Bitmap`、`TMP_BitmapShaderGUI` |
| 语料自然措辞需求 | 2,572 字符，其中汉字 2,463 | `BTHanHuaFont.log` |
| 图集缺失汉字 | **801** | 替换表 `corpus/zh-glyph/out*.jsonl` 去重统计 |
| Unity 版本 | **2018.4.2f1** | `globalgamemanagers` |
| TMP 版本 | 1.2 世代，**无 `CreateFontAsset`** | `tools/dump/dump2.txt` 精确检索确认 |

### ⚠️ 最关键的一条：那不是 SDF 图集，是 **Bitmap 图集**

字体资产叫 `MSYH SDF`，但它挂的 shader 是 **`TextMeshPro/Bitmap`**（`TMP_BitmapShaderGUI`）。
这意味着：

- **不需要实现 SDF 生成算法**（8SSEDT / msdfgen 那一套都省了），
  只要渲染一张抗锯齿的灰度位图就能用。
- 代价是**缩放会糊**：Bitmap 模式按图集里的原始像素渲染，所以字形像素尺寸要贴近游戏实际渲染字号。
  现有图集用 75pt 是**过采样**（2 倍左右），很可能是为了高 DPI 下的清晰度。

## 容量：图集大小根本不是瓶颈

4096² = 16,777,216 像素。按「字形 N px + 四周留白」估算能放多少字：

| 字形尺寸 | 单元 | 4096² 可容纳 | 放满通用规范汉字表（8,105）的利用率 |
|---|---|---|---|
| 18 px + 4px 留白 | 26² | ~24,800 | 33% |
| 22 px + 4px | 30² | ~18,600 | 43% |
| 24 px + 4px | 32² | ~16,400 | 49% |
| 36 px + 2px | 40² | ~10,500 | 77% |
| 48 px + 2px | 52² | ~6,200 | 放不下 8,105 |
| 64 px + 3px | 70² | ~3,400 | 只够我们的 3,411 |

**结论**：只要接受 36px 左右的字形，一张 4096² 就能装下**整个通用规范汉字表（8,105 字）**，
缺字问题可以被**完全消灭**，而不只是缓解。想保住 64px 的高清晰度，就只能覆盖
3,400 字左右——**恰好够我们语料所需**，但没有余量。

> 更大图集（8192²）不现实：RGBA32 就是 256 MB 显存，2018 年的游戏扛不住。

所以**第一件该做的事是量出游戏实际渲染字号**，再定字形像素尺寸：
在 `FontMod` 里临时挂钩 `TMP_Text.fontSize` / `LocalizableText`，把 UI 里实际出现的字号分布记进日志。
如果游戏最大也就渲染到 ~40px，那 48px 图集（6,200 字）就够且清晰。

## 三条实现路线

### 路线 A（推荐）：离线出图集 + 运行时组装 TMP_FontAsset

**为什么推荐**：不装 Unity、不写 UnityFS bundle 序列化、可复用已有代码。

1. **离线**（任意语言/工具）产出三个文件：
   - `atlas.png` — 灰度位图图集（4096²，紧密打包）
   - `glyphs.json` — 每个字形的 `id / x / y / width / height / xOffset / yOffset / xAdvance / scale`
   - `faceinfo.json` — `FaceInfo` 字段（见下表）
2. **运行时**（`mod-src/FullFont.cs` 里已有 90% 的代码）：
   - `new Texture2D(w, h, TextureFormat.RGBA32, false)` + `LoadImage(pngBytes)`
   - `fi.AtlasWidth/AtlasHeight/PointSize/...` 填 `FaceInfo`，`fa.AddFaceInfo(fi)`
   - 逐个 `TMP_Glyph` 填 `id/x/y/width/height/xOffset/yOffset/xAdvance/scale`，`fa.AddGlyphInfo(glyphs)`
   - 克隆现有材质、`mainTexture = myAtlas`、赋给 `fa.atlas`

**关键**：现在的 `FullFont.cs` 之所以失败，是因为它的字形数据来自**运行时的 Unity 动态系统字体**
（见下节）。把数据源换成离线文件，失败原因就消失了。

### 路线 B：用 UnityPy 直接改现有 bundle

`pip install UnityPy` 后读 `font`，替换 `Texture2D` 的像素与尺寸、改写 `TMP_FontAsset`
MonoBehaviour 的 `m_FaceInfo` / `m_GlyphTable` / `m_CharacterTable`，再写回。

- 优点：产物就是原生 bundle，不需要改 DLL 逻辑
- 缺点：`TMP_FontAsset` 是 MonoBehaviour（自定义序列化），要按字节布局改字段，容易出错；
  改尺寸后还要处理 bundle 内序列化文件大小变化

### 路线 C：Unity 2018.4 编辑器正统做法

装 Unity 2018.4.x + TMP，导入 TTF，用 Font Asset Creator 生成图集并打 AssetBundle。

- 优点：产物最可靠，官方路径
- 缺点：要装 5 GB 级 Unity 与授权，最重

## 为什么"运行时从系统字体建图集"这条路走不通

实测日志（`mod-src/FullFont.cs` 的实现，Unity 动态系统字体的纹理上限是硬伤）：

```
字号 30 汉字覆盖 1377/2463 (UV异常 3315, 溢出 0) -> 覆盖 55.9% (源图集最大 2048px)
字号 26 汉字覆盖 1930/2463 (UV异常 1650, 溢出 0) -> 覆盖 78.4% (源图集最大 1024px)
字号 22 汉字覆盖 2028/2463 (UV异常 1362, 溢出 0) -> 覆盖 82.3%
字号 18 汉字覆盖 2198/2463 (UV异常  846, 溢出 0) -> 覆盖 89.2%
字号 14 汉字覆盖 2219/2463 (UV异常  780, 溢出 0) -> 覆盖 90.1%
所有字号都达不到 99.5% 覆盖, 放弃自建 (保持现有方案)
```

`Font.CreateDynamicFontFromOSFont` + `RequestCharactersInTexture` + `GetCharacterInfo`
拿到的字形受**动态字体内部纹理**限制（1024 / 2048 px），一次放不下几千个字，
于是大量字形 UV 异常（几千条），覆盖率卡在 90% 上不去。**这条路可以放弃了。**

（`mod-src/FullFont.cs` 里有覆盖率闸门 `MinCoverage = 0.995`，正是它拒绝了启用——
这个闸门要保留，它是"宁可退回旧方案也不发方块字"的安全网。）

## 运行时组装需要的 TMP 字段清单

来自 `tools/dump/dump2.txt`（对 `Unity.TextMeshPro.dll` 的反射转储）：

```
FaceInfo（public 字段）:
  Name  PointSize  Scale  CharacterCount  LineHeight  Baseline  Ascender
  CapHeight  Descender  CenterLine  SuperscriptOffset  SubscriptOffset  SubSize
  Underline  UnderlineThickness  strikethrough  strikethroughThickness
  TabWidth  Padding  AtlasWidth  AtlasHeight

TMP_Glyph : TMP_TextElement（public 字段）:
  id  x  y  width  height  xOffset  yOffset  xAdvance  scale

TMP_FontAsset 可用方法:
  AddFaceInfo(FaceInfo)   AddGlyphInfo(TMP_Glyph[])
  ReadFontDefinition()    GetCharactersArray()   HasCharacter(char, bool)
  字段: atlas (Texture2D)   fontInfo   m_sharedMaterial ...
```

## 字符集怎么选

| 方案 | 字数 | 说明 |
|---|---|---|
| 只补现状 | 3,411 | 现有 2,610 + 缺失 801，恰好零替换 |
| **GB2312 一级字表** | 3,755 | 覆盖现代汉语常用字，推荐下限 |
| **通用规范汉字表 一级 + 二级** | 6,500 | **推荐**：4096² 在 44px 下放得下，日常文本覆盖 99.99% |
| 通用规范汉字表 全表 | 8,105 | 36px 以下才放得下；一劳永逸 |

另外别忘了 ASCII、常用全角标点（`，。！？：、；…—·""''《》`）和拉丁扩展字母。

## 字体选择

- **思源黑体 / Source Han Sans SC** — <https://github.com/adobe-fonts/source-han-sans>
- **Noto Sans CJK SC** — <https://github.com/notofonts/noto-cjk>

两者都是 **SIL OFL 1.1**，允许再分发（包括子集化与格式转换），
**顺便彻底解决现在 `THIRDPARTY.md` 里那条微软雅黑授权隐患**。

## 验收与回滚

```powershell
# 1. 图集覆盖检查：CSV 用到的每个码位是否都在新图集里
node tools\glyph-scan.mjs

# 2. 全量不变量自检（应保持 0 失败）
node tools\verify-csv.mjs

# 3. 生成"自然措辞"版文本（跳过全部字形替换/整词修正/界面串重写）
node tools\merge-final.mjs --natural
```

`tools/merge-final.mjs` 已经内建 `--natural` 开关（第 10-12 行），
它就是为"换上全字库"这个场景准备的：一旦新图集到位，
用 `--natural` 重新生成 CSV 即可让 `眉毛`、`鸣谢`、`渡鸦` 这些写法全部回来，
同时**术语统一、专名汉化、占位符修复这些与字形无关的步骤照常执行**。

> 注意：`--natural` 也会跳过「界面串整句重写」（420 条）和「整词修正」（23 条），
> 这两类里有一部分是为字形妥协写的，也有一部分是修真实错译的——
> 换图集时需要人工过一遍，别无脑全丢。

## 顺带的好处

图集一旦覆盖常见汉字，这些限制都随之消失：

- README 里那节「有些译文读起来怪怪的」可以删掉或改成历史说明
- 提交译文时不再需要 `tools/glyph-covered.txt` 白名单约束（现在的译校流程要求逐字核对白名单）
- `merge-final.mjs` 里的字形安全网会变成"永远不触发"的保险
