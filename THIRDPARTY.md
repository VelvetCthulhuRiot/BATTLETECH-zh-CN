# 第三方作品归属与授权提示

本仓库**不包含任何游戏本体文件**。下面列出用到的第三方作品及其来源。

---

## 1. 译文语料

`mods/BTHanHua/strings_zh-CN.csv`（21,875 条）改编自：

| 项目 | 地址 | 授权 |
|---|---|---|
| cxwithyxy/BATTLETECH_zhcn | https://github.com/cxwithyxy/BATTLETECH_zhcn | **MIT**, Copyright © 2022 cx2889 |

该上游项目本身又汇总了两类来源：

- **Paratranz 社区人工译文** —— 经 `translation-zh_Hans.json` 引入
- **社区旧汉化 CSV** —— `pre-data/localization/strings_zh-CN.csv`
- 其余缺口由上游脚本基于官方德语机翻补足

我们在其基础上做了大量修订：合并去重、术语按术语表统一、专名汉化、占位符与富文本标记修复、
机翻来源逐条精修，以及**补回星币符号 `¢`**（官方 75 个键里有，旧版因字形缺失被删掉了）等。
上游的 MIT 版权声明已按要求保留在 [`LICENSE`](LICENSE) 与本文件中。

---

## 2. 字形图集 `mods/BTHanHuaFont/atlas/`

中文字形来自 **Noto Sans SC**，以 **SIL Open Font License 1.1** 授权。

| 项 | 值 |
|---|---|
| 字体 | Noto Sans SC Regular（Google 与 Adobe 联合开发，与思源黑体 Source Han Sans 同源同设计） |
| 来源 | https://github.com/notofonts/noto-cjk → `Sans/SubsetOTF/SC/NotoSansSC-Regular.otf` |
| 文件版本 | `2.004;GOOG;NotoSansSC-Regular;ADOBE` |
| 文件 SHA256 | `FAA6C9DF652116DDE789D351359F3D7E5D2285A2B2A1F04A2D7244DF706D5EA9` |
| 上游授权文件 | `Sans/LICENSE`（https://github.com/notofonts/noto-cjk/blob/main/Sans/LICENSE） |
| 本仓库随附 | [`LICENSE-OFL.txt`](LICENSE-OFL.txt)（OFL 1.1 全文，含版权行） |

### 产物是什么

`atlas/atlas.a8` 与 `atlas/atlas.bin` 是把上面那份字体**离线栅格化**得到的字形位图：

- `atlas.a8` —— 8192×8192 的 Alpha8 位图（8192×8192 字节），**不含任何字体轮廓数据**
- `atlas.bin` —— 8,352 条字形记录（码位 + 图集坐标 + 度量），外加 FaceInfo
- 字符集见 [`tools/font/charset.txt`](tools/font/charset.txt)（8,354 字，
  含《通用规范汉字表》一级/二级/三级全部 7,909 个 BMP 汉字）
- 生成脚本 [`tools/font/build-atlas.py`](tools/font/build-atlas.py)，约 5 秒可复现

### 授权要点（OFL 1.1）

1. **版权行含 Reserved Font Name 'Source'**：
   `Copyright 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'`。
   Noto Sans CJK 与思源黑体同源，继承了这条 RFN。
   → 我们**不得在产品名里使用 "Source"**。本项目的产物叫 `BTHanHua` / 字形图集，不含该名，合规。
   描述性引用（"基于思源黑体 / Noto Sans SC 生成"）不受 RFN 限制。
2. 字形图集属于 OFL 意义上的**衍生作品**，因此同样以 **OFL 1.1** 分发，
   并随包提供 OFL 全文与上述版权行（见 `LICENSE-OFL.txt`）。
3. 本项目**不再分发任何非开源授权的字体**。
   早期版本（v1.0）曾随包携带一份 **Microsoft YaHei（微软雅黑）** 的 TextMeshPro 图集
   （`mods/BTHanHuaFont/font`，16.2 MB），其再分发授权并不明确；
   自 v1.1 起该文件已被彻底移除，改由上面这份 OFL 图集承担渲染。

---

## 3. 游戏本体

- **BATTLETECH** © Harebrained Schemes / Paradox Interactive
- 本仓库**不含**游戏的 `Assembly-CSharp.dll`、`VersionManifest.csv`、
  `resources.assets`、`strings_de-DE.csv` 等任何本体文件
- `src/` 里的注入程序在**编译时**需要引用你本机的游戏程序集，但仓库不随附这些文件——请自备正版游戏
- 官方 mod 支持（HBS ModLoader、`0Harmony.dll`）由游戏随包提供，同样不随本仓库分发
- 注入程序运行时会调用游戏自带的 **`TextMeshPro/Bitmap` 着色器**（Unity TextMeshPro 的一部分），
  这是对已安装游戏正常功能的调用，不是再分发

### 关于 `docs/screenshots/`

`docs/screenshots/` 里是**游戏运行截图**（游戏画面与 UI 的版权属于
Harebrained Schemes / Paradox Interactive），仅用于说明本汉化的实际效果，
按常规同人作品的做法作为示例展示。截图已压缩以控制仓库体积。

截图里出现的飞行员名 / 部队名是游玩时自拟的虚构名称，与现实身份无关。
如果其中有你不想公开的内容，删掉对应文件即可，README 里的图片链接会变成裂图，
把那一行也删掉就行。
