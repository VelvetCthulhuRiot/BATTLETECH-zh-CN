# 第三方作品归属与授权提示

本仓库**不包含任何游戏本体文件**。下面列出用到的第三方作品及其来源。

---

## 1. 译文语料

`mods/BTHanHua/strings_zh-CN.csv`（21,505 条）改编自：

| 项目 | 地址 | 授权 |
|---|---|---|
| cxwithyxy/BATTLETECH_zhcn | https://github.com/cxwithyxy/BATTLETECH_zhcn | **MIT**, Copyright © 2022 cx2889 |

该上游项目本身又汇总了两类来源：

- **Paratranz 社区人工译文** —— 经 `translation-zh_Hans.json` 引入
- **社区旧汉化 CSV** —— `pre-data/localization/strings_zh-CN.csv`
- 其余缺口由上游脚本基于官方德语机翻补足

我们在其基础上做了大量修订：合并去重、术语按术语表统一、专名汉化、字形约束替换、
占位符与富文本标记修复、机翻来源逐条精修等。上游的 MIT 版权声明已按要求保留在
[`LICENSE`](LICENSE) 与本文件中。

---

## 2. 字体包 `mods/BTHanHuaFont/font`

- **来源**：同上，上游仓库内的 `pre-data/BATTLETECH_1.9.1_zhcn_v0.03/BattleTech_Data/StreamingAssets/font`
- **格式**：UnityFS 资源包（Unity 2018.4.2f1），内含一个 TextMeshPro 字体资产 `MSYH SDF`
- **内容**：2,615 个码位（其中约 2,458 个汉字）的 SDF 字形图集，16.2 MB
- **作用**：游戏自带字体不含汉字，没有它中文会显示成方块
- **上游授权**：上游以 **MIT** 分发该文件

### ⚠️ 需要使用者知悉的授权提示

`MSYH` 是 **Microsoft YaHei（微软雅黑）** 的缩写。这个文件是把微软雅黑转换成
TextMeshPro 的 SDF 字形图集后的**衍生作品**，而不是原始的 TTF。

- 微软雅黑的字体授权通常**不允许再分发**（包括衍生格式）。上游项目以 MIT 分发该文件，
  这一行为本身并不当然解决字体本身的授权问题。
- 该文件在被上游以 MIT 公开分发的形式下已经在公网存在多年；本仓库沿用同一来源。
- **如果你的使用场景对字体授权敏感**，请删掉 `mods/BTHanHuaFont/font`，改为用你自己
  系统里的微软雅黑生成一份（Windows 自带），或换用你有权分发的开源中文字体
  （如思源黑体 / Noto Sans CJK）重新生成 SDF 图集。
- 删掉这个文件**不会影响文本汉化**，只是中文会因缺字形而显示为方块。

如果字体权利人提出异议，请直接删除该文件——其余部分（代码与译文）不依赖它。

---

## 3. 游戏本体

- **BATTLETECH** © Harebrained Schemes / Paradox Interactive
- 本仓库**不含**游戏的 `Assembly-CSharp.dll`、`VersionManifest.csv`、
  `resources.assets`、`strings_de-DE.csv` 等任何本体文件
- `src/` 里的注入程序在**编译时**需要引用你本机的 `Assembly-CSharp.dll`，
  但仓库不随附该文件——请自备正版游戏
- 官方 mod 支持（HBS ModLoader、`0Harmony.dll`）由游戏随包提供，同样不随本仓库分发

### 关于 `docs/screenshots/`

`docs/screenshots/` 里是**游戏运行截图**（游戏画面与 UI 的版权属于
Harebrained Schemes / Paradox Interactive），仅用于说明本汉化的实际效果，
按常规同人作品的做法作为示例展示。截图已从 3200×2000 压缩到 1600×1000 以控制仓库体积。

截图里出现的飞行员名 / 部队名（如 `Polecat`、`Ada Fujiwara`）是游玩时自拟的虚构名称，
与现实身份无关。如果其中有你不想公开的内容，删掉对应文件即可，README 里的图片链接会变成裂图，
把那一行也删掉就行。
