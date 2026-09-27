# 工具说明

这些脚本是构建 `mods/BTHanHua/strings_zh-CN.csv` 时用的工具链中**可独立运行**的部分。

## `verify-csv.mjs` —— 全量不变量自检（最常用）

```powershell
node tools\verify-csv.mjs
```

逐条检查所有「一旦违反就会在游戏里出问题」的硬约束，退出码 0 = 全过：

| 检查 | 为什么重要 |
|---|---|
| 条目数 / 无 BOM / 仅 LF | 编码形态 |
| 值内无半角逗号 | 会破坏游戏的 CSV 解析 |
| 每行引号个数为偶数 | 游戏解析器是引号状态机 |
| 引号连续段 ≤ 2 | 官方 de/fr/ru 最长就是 2；≥3 说明被重复转义，玩家会看到多余引号 |
| 每个 `[[...]]` 恰好 1 个 U+001F | `[[引用键<U+001F>显示文本]]` 的分隔符 |
| 全部字符在字形图集内 | 图集外的字显示为方块（白名单：`glyph-covered.txt`，2,610 字） |
| 无字面 `\r` | 官方用 `\n` |
| 官方 key 全覆盖、无多余、顺序一致 | 与 `strings_de-DE.csv` 对齐 |
| `[[...]]` 平衡 | 相对官方无额外残缺 |

脚本顶部有路径常量，换机器时改这里：

```js
const PROJ = 'C:/Users/<你>/Documents/BTHanHua';
const GAME = 'D:/Steam/steamapps/common/BATTLETECH/...';
```

找不到官方 `strings_de-DE.csv` 时只会跳过对照项并给出提示，不会报错。

## `build-mod.mjs` —— 部署到游戏的 mods 目录

```powershell
node tools\build-mod.mjs          # 部署 (带 ASCII 探针, 用于排查)
node tools\build-mod.mjs --clean  # 部署 (正式, 无探针)
```

把 `corpus/strings_zh-CN.csv` 部署到
`%USERPROFILE%\Documents\My Games\BattleTech\mods\BTHanHua\`，
并同时写出 `mod.json` / `mod.alt.json` / `说明.txt`。

## `pack-mod.ps1` —— 打包便携版

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\pack-mod.ps1
```

生成 `dist\BTHanHua-mod.zip`（两个 mod 文件夹 + `移植说明.txt`），
并剔除运行期日志。

## `glyph-scan.mjs` —— 字形覆盖检查

扫描 CSV 用到的所有码位，报告哪些落在字体图集之外（会显示成方块）。

## `merge-final.mjs` —— 数据管线（需要自备上游语料）

真正生成 `strings_zh-CN.csv` 的合并器。它按优先级合并多个来源
（Paratranz 人工译文 > 模型补译 > 社区旧 CSV > 机翻缓存），然后依次执行：

字形替换 → 整词修正 → 缩写定点修正 → 用词精修 → 界面串重写 → 一致性修正
→ 术语统一 → 专名汉化 → 占位符修复 → 性别变体中文化 → 字形安全网 → 定点覆盖 → 写出

最后一步是**硬性**的：只要还剩图集外字符就写出 `corpus/glyph-stray.jsonl` 并以非 0 退出，
绝不静默发出方块字。

> 运行前需要按脚本顶部的常量准备好上游语料目录（`incoming/gh`）。
> 上游数据不随本仓库分发，请自行从上游项目获取。

## `qa-*.mjs` —— 对比官方文件做的一次性分析

这几个脚本是排查问题时写的，用来把我们的 CSV 和官方 `strings_de-DE.csv` / `fr-FR` / `ru-RU`
做逐条对比，找出「官方怎么写、我们怎么写」的差异。用来复现类似问题：

| 脚本 | 用途 |
|---|---|
| `qa-us.mjs` | U+001F（官方逗号替身）的使用对比 |
| `qa-cost.mjs` | 找出会渲染成「一长串数字」的值 |
| `qa-quotes.mjs` | 引号连续段长度分布对比 |
| `qa-labels2.mjs` | 命中部位标签等短标签对比 |

它们都会把结果写到 `corpus/_qa_*.txt`，用 read 打开看（含中文，别用 `Get-Content` 直接看到控制台，
PowerShell 的编码会乱码）。
