# 素材溯源与校验

本文件记录 `tools/font/` 下所有输入的出处与哈希，以及关键实测结论。
技术细节见 [`docs/FONT-ATLAS.md`](../../docs/FONT-ATLAS.md)。

---

## 1. 字体

| 项 | 值 |
|---|---|
| 文件 | `font/NotoSansSC-Regular.otf`（**不随仓库分发**，见 README 的下载地址） |
| 大小 | 8,331,336 字节 |
| SHA256 | `FAA6C9DF652116DDE789D351359F3D7E5D2285A2B2A1F04A2D7244DF706D5EA9` |
| Family / Subfamily | Noto Sans SC / Regular |
| UniqueID | `2.004;GOOG;NotoSansSC-Regular;ADOBE` |
| Version | `Version 2.004;hotconv 1.0.118;makeotfexe 2.5.65603` |
| usWeightClass | 400（Regular） |
| unitsPerEm | 1000 |
| hhea asc / desc / lineGap | 1160 / -288 / 0 |
| glyph 数 | 31,036 |
| cmap 码位 | 30,890 |
| 轮廓格式 | CFF (OTF) |
| 授权 | SIL Open Font License 1.1 |

### 为什么选这份（而不是其它三个候选）

| 候选 | 体积 | 结论 |
|---|---|---|
| **`noto-cjk/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf`** | **8.3 MB** | **选用** |
| `google/fonts/ofl/notosanssc/NotoSansSC[wght].ttf` | 17.8 MB | 是变体字体，其 `wght` 默认实例为 100（Thin），必须先 instance 到 400 |
| `noto-cjk/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf` | 16.4 MB | 全量版，体积翻倍，无必要 |
| `C:\Windows\Fonts\NotoSansSC-VF.ttf` | 16.9 MB | Windows 随附的 `non-release` 变体构建，默认实例同样是 Thin |

---

## 2. 通用规范汉字表

| 文件 | 大小 | SHA256 | 内容 |
|---|---|---|---|
| `gsc/level-1.txt` | 14,000 | `79A6C710013CC86617D5DB65871F59B2D67DEE72415D380A2CC7145A51450FE4` | 一级 3,500 字 |
| `gsc/level-2.txt` | 12,003 | `D597A6E99EA7B8C41215081F824C6E8587BF1C9A3F45FB13086A826306789785` | 二级 3,000 字 |
| `gsc/level-3.txt` | 6,613 | `C9FBC83A9F8CD860306B218BF16C6A4CC56D7C4A22A686D403B176A0DBEC7931` | 三级 1,605 字 |

来源：<https://github.com/shengdoushi/common-standard-chinese-characters-table>
（`master` 分支的 `level-{1,2,3}.txt`）。合计 **8,105 字**，与 2013 年国务院公布的
《通用规范汉字表》字数一致。

**其中 196 字是非 BMP 字符**（二级 3 个 + 三级 193 个，如 `𠅤` `𠙶` `𠳐`）。
TMP 1.2 的 `HasCharacter(char)` 与字符索引链都是 BMP，**这 196 字无法支持**，已在字符集里排除。
实际可支持 7,909 字。

---

## 3. 生成的字符集

| 项 | 值 |
|---|---|
| 文件 | `charset.txt`（33,132 字节） |
| SHA256 | `B56548315AF34350F47549F258F21F03773D7E87FA4930FD9B5412C35E6B1412` |
| 总字数 | **8,354**（汉字 7,841） |
| 必需集合 | 8,042（规范字表 7,909 ∪ 语料 2,923 ∪ 旧图集 2,611，已排非渲染字符） |
| 装饰区段保留 | 312（字体确有字形的符号） |
| 生成脚本 | `make-charset.py` |

**安全性质（已实测）**：

- 字体对"必需字符"覆盖 **100%**（0 缺）
- 旧图集全部 **2,608 个字形 100% 被新字符集包含** → 新字体在任何情况下都不会比旧版更差
- 8192²+4px 在 75px 下容量 **10,609**，**余量 21%**

排序：ASCII 在最前，其余按 `语料词频降序 → 规范字表等级升序 → 码位升序`，
将来若需缩容，先丢的是最生僻、语料里最不常用的字。

---

## 4. 图集产物

| 文件 | 大小 | SHA256 |
|---|---|---|
| `atlas.a8` | 67,108,864 | `2A523E56EAECCDBF1B13CFC239AD5F3599CFEE57555941634CD0AA48CD5E8DFF` |
| `atlas.bin` | 233,960 | `5E875442F9872C47…`（见 `mods/BTHanHuaFont/atlas/`） |

| 项 | 值 |
|---|---|
| 图集尺寸 | 8192 × 8192 |
| 像素格式 | **Alpha8**（1 字节/像素，与游戏原图集一致） |
| 字形数 | **8,352**（字符集 8,354 中 2 个是无墨迹空白符，不发记录） |
| em / 字形尺寸 | 75 px |
| 留白 | 4 px |
| 摆放 | 货架式，占用高度 5,746 / 8,192 = **70.1%** |
| 越界字形 | 0 |
| 生成耗时 | 约 4.8 秒 |

### 离线自检结果

`verify-atlas.py` 把图集里每个字形与 FreeType 直接栅格化的结果逐字节比对：

```
atlas.a8  67,108,864 bytes  (期望 67,108,864)  OK
记录 CRC32: 文件=5D180A60 实算=5D180A60  OK
合理性: OK
像素逐字比对 (抽样 8352 字): 完全一致 8352, 不一致 0
```

---

## 5. 许可

| 文件 | SHA256 | 说明 |
|---|---|---|
| 仓库根 `LICENSE-OFL.txt` | `377B91BFA1B971CF4358822085C35D13E92A3FCE427F7EEAB08BBCC476951046` | OFL 1.1 全文 **+ 版权行**（含 Reserved Font Name 'Source'） |
| 上游 `noto-cjk/Sans/LICENSE` | `3A5218CB71454423583ACE48BBE623E9EB61AAC01E91977D33F410D50B747DC9` | 字体所在目录自己的许可副本（纯 OFL 正文） |
| 上游 `Sans/README-third_party.md` | `AA229A2136C426E3DECA957C305727E02415198116138D8C1721222B12E22131` | 字体内含第三方组件声明 |

两者都是 **SIL Open Font License 1.1**。随包分发时使用带版权行的 `LICENSE-OFL.txt`。

### 写文档时必须注意的三点

1. **版权行带 Reserved Font Name 'Source'**：
   `Copyright 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'`。
   Noto Sans CJK 与思源黑体同源（Google + Adobe 联合开发），所以继承了这条 RFN。
   → 产物**不得在名称里使用 "Source"**。本项目叫 `BTHanHua` / 字形图集，不含该名，合规。
   描述性引用（"基于思源黑体 / Noto Sans SC 生成"）不受 RFN 限制。
2. **字形图集属于 OFL 意义上的衍生作品** → 需随产物一并提供 OFL 1.1 全文与上述版权行，
   并声明衍生作品同样以 OFL 1.1 分发。
3. **该字体对"必需字符"覆盖 100%**，无缺字，因此译文不需要任何字形妥协。

---

## 6. 两处对旧文档的数字修正

旧版 `docs/FONT-ATLAS.md` 写的两个数字与实际不符，已在本仓库修正：

| 指标 | 旧文档 | 实测 |
|---|---|---|
| 自然措辞汉字数 | 2,463 | **2,799**（字符集 2,923） |
| 图集缺失汉字 | 801 | **349** |

来源搞错的原因：

- `2,463` 是**运行时日志对"已做字形替换的交付 CSV"**统计出来的
  （`需要字符 2572 个 (其中汉字 2463)`），描述的是**替换后**的文本，被误当成了自然措辞。
- `801 / 791` 是 `zh-glyph/in1.tsv`｜`in2.tsv` 那份**历史快照**的去重字数。
  复核 `out1.jsonl` + `out2.jsonl`：缺字清单去重确实是 **791** 字，
  但最终自然措辞里只有 **353** 字还在用（其中 349 字确实不在旧图集里），
  其余在后续精修轮次被改写掉了。
