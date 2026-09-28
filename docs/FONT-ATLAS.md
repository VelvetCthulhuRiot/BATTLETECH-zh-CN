# 用开源字体重建字形图集 —— 彻底解决缺字问题

> 本文是给后续开发者/协作者的**技术方案与实现记录**。
> 背景见 README 的「关于字体与译文」一节。**本文描述的是已实现并验证过的方案**。

---

## 问题是什么

游戏自带字体不含汉字，所以汉化必须注入一个中文字形图集。v1.0 用的是社区字体包
（`mods/BTHanHuaFont/font`，16.2 MB UnityFS），它只有 **2,610 个汉字**。

图集外的字在游戏里渲染成**方块**，所以只能逐字替换——这就是 `眉毛 → 眼毛`、
`渡鸦 → 鸟/Raven` 这类"怪译文"的根源，共 **816 条替换规则、作用于约 2,300 条译文**。

v1.1 用 **Noto Sans SC**（SIL OFL 1.1）离线生成了一份 **8,352 字形**的图集替换掉它，
所有字形妥协已全部回滚，那份微软雅黑图集也一并移除了。

### 文档里曾经写错的几个数字（已实测修正）

| 指标 | 旧文档 | 实测 |
|---|---|---|
| 自然措辞汉字数 | 2,463 | **2,799**（字符集 2,923） |
| 图集缺失汉字 | 801 | **349** |

- `2,463` 来自运行时日志对**已做字形替换的交付 CSV** 的统计（`需要字符 2572 个 (其中汉字 2463)`），
  它描述的是**替换后**的文本，被误当成了自然措辞。
- `801/791` 是 `corpus/zh-glyph/in1.tsv`｜`in2.tsv` 那份**历史快照**的去重字数。
  复核 `out1.jsonl`+`out2.jsonl`：清单去重确实是 791 字，但最终自然措辞里只有 353 字还在用
  （其中 349 字确实不在旧图集里）——其余在后续精修轮次被改写掉了。

---

## 已测定的事实（别再重复踩）

全部来自对现役资产的直接读取，不是推测。

| 项目 | 实测值 | 来源 |
|---|---|---|
| 旧图集尺寸 / 格式 | 4096×4096 **Alpha8**（`m_TextureFormat=1`） | bundle 内 `Texture2D` |
| 旧图集体积 | `m_CompleteImageSize = 16,777,216` = 4096²×**1 字节** | 同上 |
| 旧图集采样 | 无 mipmap（`m_MipCount=1`）、Bilinear | 同上 |
| 旧图集字形数 | 2,608 条记录（图集覆盖 2,615 码位） | `m_glyphInfoList` |
| 旧 `FaceInfo` | PointSize 75 · Ascender 79 · Descender -20 · LineHeight 99 · Padding 4 · TabWidth 187.5 | 同上 |
| 旧材质 | `MSYH SDF Material`，shader `TextMeshPro/Bitmap` | 同上 |
| `fontAssetType` | 枚举成员 **`Bitmap`**（=2） | 反射 dump + 运行时实测 |
| Unity / TMP | 2018.4.2f1 / TMP 1.2 世代（`TMP_Glyph` + `m_characterDictionary`，无多页 atlas） | `globalgamemanagers` / 反射转储 |
| 捆绑的字符集 | 8,354 字（汉字 7,841），含规范字表 BMP 全部 7,909 字 | `tools/font/charset.txt` |

### ⚠️ 两条推翻旧文档的结论

**① 旧图集是 Alpha8，不是 RGBA32。**
所以它的显存只要 **16 MB**（不是 64 MB）。旧文档据此判断"8192² 不现实（RGBA32 就是 256 MB）"——
**这条作废**：8192² 的 Alpha8 只有 64 MB，正好等于当初担心的 4096² RGBA32。
容量天花板由此整个掀掉，本方案因此得以在**不降低清晰度**的前提下做到全字表覆盖。

**② TMP 1.2 只有单张 `Texture2D atlas`，没有多页支持。**
字段里没有 `m_AtlasTextures` / `m_AtlasPopulationMode`。所以扩容只能靠**加大单张图集**
（本方案用 8192²，即 2× 边长、4× 面积），不能靠多张分页。

---

## 实现方案：离线出图集 + 运行时组装 `TMP_FontAsset`

不装 Unity、不写 UnityFS 序列化、不依赖任何系统字体。

### 产物

`mods/BTHanHuaFont/atlas/`

| 文件 | 内容 |
|---|---|
| `atlas.a8` | 8192×8192 裸 Alpha8 像素，64 MB（zip 后 7.03 MB） |
| `atlas.bin` | 头部（FaceInfo 19 个 float + 尺寸 + 字形数 + 记录长度 + CRC32）+ 8,352 条定长记录 |

`atlas.bin` 头部字段顺序：`magic 'BTHA'` `version` `atlasWidth` `atlasHeight` `glyphCount`
`recordBytes`，随后 19 个 float（`pointSize scale ascender descender lineHeight capHeight baseline
centerLine superscriptOffset subscriptOffset subSize underline underlineThickness strikethrough
strikethroughThickness tabWidth padding atlasWidth atlasHeight`），再一个 `crc32(记录块)`。

每条记录 28 字节：`id(u32) x(u16) y(u16) w(u16) h(u16) xOffset(i32) yOffset(i32) xAdvance(i32) scale(f32)`。

### 度量约定（逐条用现役资产反查证实，不是猜的）

拿旧图集里 `!  H  o  一  永  渡` 六个字形的记录值与其像素做比对：

| 约定 | 结论 |
|---|---|
| **图集 y 方向** | 从**顶部**往下算。用像素反查：y-from-top 的墨迹恰好填满记录矩形；y-from-bottom 对 `o`/`一`/`永`/`渡` 全部对不上 |
| `width/height` | **纯墨迹包围盒**，不含 padding（上述 6 字的 ink bbox 全部等于 `(0,0,w,h)`） |
| `xOffset` | = 笔位到字形左沿 = FreeType `bitmap_left`（`'!'` xOffset=7, w=9, adv=23 → 7+9+7=23 ✓） |
| `yOffset` | = 基线到字形**上沿**（向上为正），下沿 = `yOffset - height`（`'H'` yOffset=57 = CapHeight ✓） |
| `xAdvance` | 步进宽度（图集像素）；CJK 恒等于 em（`一`/`永`/`渡` 都是 75） |
| **`FaceInfo` 垂直度量** | 取字体 **hhea**。用微软雅黑验算：2048upm 的 2167/-536 → 75px 得 **79/-20**，与资产里的值完全一致 |

这套约定与 FreeType 的 `bitmap_left / bitmap_top / width / rows / advance` **一一对应**，
所以离线栅格化可以 1:1 映射。

**实测验证**：用 freetype-py 复现旧图集时，上述 6 字的 `xOffset`/`yOffset`/`xAdvance` **逐字精确一致**，
宽高只差 ≤1px（抗锯齿阈值差异）。

> 顺带排掉一个坑：**Pillow 的 `getbbox` 返回的是布局框不是墨迹框**（`'!'` 返回 23 而不是 9），
> 用它会把字形全切错。必须用 freetype-py 的 `slot.bitmap_*`。

### 四个必须处理的坑

**① 裸像素的**行序**是自下而上。**
Unity 的 `Texture2D.LoadRawTextureData` 是直接 memcpy 进显存，行序必须与 bundle 内裸数据一致。
UnityPy 的 `Alpha8 → PIL` 转换带 `FLIP_TOP_BOTTOM`（`Texture2DConverter.py`），
说明裸数据第 0 行 = 图像底行。**搞错的话整个图集会上下颠倒。**
（注意：字形记录里的 `y` 是"自图像顶部算"，与像素行序是两件独立的事，都要对。）

**② TMP 1.2 的 `get_characterDictionary()` 会触发 `ReadFontDefinition()`。**
该属性 getter 在 `m_characterDictionary` 为 null 时调用 `ReadFontDefinition()`，
而后者要访问 `m_kerningInfo.kerningPairs` —— 新建资产没填 kerning 就会抛
`NullReferenceException`（本项目实测踩到过）。

对策：**自己把字典建好塞进去**（只要非空，getter 就直接返回，不会再触发）；
同时补齐 `m_kerningInfo` / `m_kerningPair` / `m_kerningDictionary`。
另外 `AddGlyphInfo()` **只填 `m_glyphInfoList`，不填 `m_characterDictionary`**，别指望它。

**③ `ShrinkFont` 必须作用在"实际用来渲染的那个字体"上。**
`FontMod` 有一个把 `FaceInfo.PointSize` 乘 1.10 的缩放（让 CJK 字形缩 9% 以免行距压字）。
原来它只缩字体包里的 `s_cjk`，而渲染走的是 `s_full`——不修的话离线图集的字会**大 10%**。

**④ `FaceInfo` 用旧资产的垂直度量，不是 Noto 自己的。**
Noto Sans SC 的 hhea 是 1160/-288（1000upm）→ 75px 时行高 **109**；
微软雅黑是 **99**。若用 Noto 原生值，全 UI 行高会**高约 10%**，固定高度的面板可能溢出。
这些值只影响排版、不影响字形，所以照搬旧资产的
`Ascender 79 / Descender -20 / LineHeight 99`，配合 `ShrinkFont(1.10)`
→ **行高与字形大小与 v1.0 逐像素一致**（实测：按钮文字墨迹框中心偏移 ≤1px @2590px 宽画面）。

### 材质：自建，不克隆任何资产

v1.1 **不再随包携带**微软雅黑 bundle（授权不明确，且 16 MB 压不动），
材质改为 `new Material(Shader.Find("TextMeshPro/Bitmap"))` + 逐项显式赋值：

```
floats: _ColorMask=15 _Stencil=0 _StencilComp=8 _StencilOp=0
        _StencilReadMask=255 _StencilWriteMask=255
        _MaskSoftnessX/Y=0 _VertexOffsetX/Y=0
colors: _FaceColor=白(1,1,1,1)   _ClipRect=(-32767,-32767,32767,32767)
tex:    _MainTex=图集
```

这些值是 dump 旧材质（`MSYH SDF Material`）得到的——它与微软雅黑没有任何绑定关系，
就是 TMP Bitmap 着色器的常规值。样式字段（`boldStyle=0.75` `boldSpacing=7` `italicStyle=35`
`tabSize=10` `fontAssetType=Bitmap`）与 `fontWeights[10]`（TMP 渲染粗体时会查，null 会 NRE）
也按实测值显式设定。

> `Shader.Find` 只能命中"打进构建"或当前已加载的着色器。TMP 的 Bitmap 着色器随游戏构建提供，
> 实测可用；代码里还加了一层"扫描所有已加载 Shader"的兜底。

---

## 字符集与容量

字符集由 [`tools/font/make-charset.py`](tools/font/make-charset.py) 合成：

```
必需 = 通用规范汉字表(8,105, 排除 196 个非 BMP 字 → 7,909)
     ∪ 自然措辞语料(2,923)
     ∪ 旧图集覆盖(2,611)          ← 保险: 防止游戏 UI 有 CSV 之外的硬编码字
装饰 = ASCII / Latin-1 / 通用标点 / CJK标点 / 全角   (只保留字体真有字形的)
去重后 8,354 字 (汉字 7,841)
```

排序：ASCII 在最前，其余按 `语料词频降序 → 规范字表等级升序 → 码位升序`。
将来若需缩容，先丢的是最生僻、语料里最不常用的字。

**两条硬限制（已排除）**：

- 通用规范汉字表里有 **196 个非 BMP 字符**（二级 3 + 三级 193，如 `𠅘` `𠙶`）。
  TMP 1.2 的 `HasCharacter(char)` 与字符索引链都是 BMP，**无法支持**。
- 不需要字形的字符（Unicode 大类 `C*`/`Z*`：`U+001F` 官方逗号替身、`U+200B` 零宽空格、
  `U+3000` 全角空格…）一律不入表 —— 旧图集同样没有它们（ASCII 只有 33..126，没有空格），
  空白由 TMP 自己处理。

容量（8192²，padding 4，货架式摆放）：

| 字形 | 单元 | 容量 | 本方案占用 |
|---|---|---|---|
| 48 px | 52² | 24,649 | — |
| 64 px | 68² | 14,400 | — |
| **75 px** | **79²** | **10,609** | **8,352（占用高度 5,746/8,192 = 70.1%）** |

---

## 复现

```powershell
# 0) 需要 tools/fontenv 里的 Python 环境 (fonttools + freetype-py + Pillow)
#    装法: python -m venv tools\fontenv; tools\fontenv\Scripts\pip install fonttools freetype-py Pillow

# 1) 取字体 (见 tools/font/README.md 的出处与 SHA256)
#    放到 tools/font/font/NotoSansSC-Regular.otf

# 2) 合成字符集 (需要 corpus/ 里的语料与 corpus/glyph-covered.txt)
python tools\font\make-charset.py --gsc tools\font\gsc --font tools\font\font\NotoSansSC-Regular.otf

# 3) 生成图集 (约 5 秒)
python tools\font\build-atlas.py --atlas 8192 --out tools\font\out

# 4) 离线自检: 图集像素与 FreeType 直接栅格化逐字比对
python tools\font\verify-atlas.py --out tools\font\out --sample 9000
#    预期: 像素逐字比对 8352 完全一致, CRC OK, FaceInfo 合理性 OK

# 5) 部署 (DLL + 图集 + OFL 许可)
node tools\deploy-font.mjs
```

### 验证结果

| 检查项 | 结果 |
|---|---|
| 图集像素 vs FreeType 直接栅格化 | **8,352 / 8,352 逐字节完全一致** |
| `atlas.bin` CRC32 | 文件值 = 实算值 |
| FaceInfo 合理性 | OK |
| 越界字形 | 0 |
| 运行时构建耗时 | 125 ms |
| 图集外残留（`merge-final.mjs` 安全网） | 0 行 / 0 种字符 |
| 语料非 ASCII 字符覆盖 | 2,832 / 2,832 = 100.00% |

---

## 回滚与开关

`mods/BTHanHuaFont/` 下的空文件开关：

| 文件 | 作用 |
|---|---|
| `ATLAS_OFF` | 跳过离线图集，退回字体包（若还在） |
| `ATLAS_FORCE` | 强制启用离线图集，忽略覆盖率闸门（仅测试用，会出方块） |
| `FONT_NOSHRINK` | 不做 1.10 字号缩放 |
| `FULLFONT_ON` | 启用 v0.7 那套"运行时从系统字体建图集"（已证实走不通，默认关闭） |

**覆盖率闸门**：`AtlasFont` 内建 `MinCoverage = 0.995`。低于它就直接放弃、绝不启用——
"宁可退回旧方案也不发方块字"这条安全网必须保留。

---

## 走不通的路线（别再试）

**运行时从系统字体建图集。** 实测日志：

```
字号 30 汉字覆盖 1377/2463 (UV异常 3315) -> 覆盖 55.9% (源图集最大 2048px)
字号 26 汉字覆盖 1930/2463 (UV异常 1650) -> 覆盖 78.4% (源图集最大 1024px)
字号 22 汉字覆盖 2028/2463 (UV异常 1362) -> 覆盖 82.3%
字号 18 汉字覆盖 2198/2463 (UV异常  846) -> 覆盖 89.2%
字号 14 汉字覆盖 2219/2463 (UV异常  780) -> 覆盖 90.1%
所有字号都达不到 99.5% 覆盖, 放弃自建
```

`Font.CreateDynamicFontFromOSFont` + `RequestCharactersInTexture` + `GetCharacterInfo`
拿到的字形受**动态字体内部纹理**限制（1024 / 2048 px），一次放不下几千个字，
于是大量字形 UV 异常，覆盖率卡在 90% 上不去。**这条路可以放弃了。**

（另外：`C:\Windows\Fonts\NotoSansSC-VF.ttf` 那份变体的 `wght` 轴 **default = 100**，
直接栅格化会得到发丝一样细的汉字。必须 instance 到 400 才能用——本方案改用官方静态
Regular，绕开了这个坑。）

---

## 顺带解决的问题

图集覆盖常见汉字后，这些限制随之消失：

- ✅ README 里那节「有些译文读起来怪怪的」已删除，816 条字形替换规则全部回滚
- ✅ 提交译文时不再需要 `tools/glyph-covered.txt` 白名单约束
- ✅ `眉毛` / `鸣谢` / `渡鸦` / `翡翠曙光` 这些自然写法都回来了
- ✅ 补回了官方有、旧版因为缺 `¢` 字形而删掉的**星币符号**（75 个键）
- ✅ 移除了微软雅黑图集，第三方授权不再有隐患（见 `THIRDPARTY.md`）
- `merge-final.mjs` 的字形安全网仍在，但基准换成新图集的 `charset.txt`，
  实际上变成"永远不触发"的保险
