# 工具说明

这些脚本是构建本汉化时用的工具链中**可独立运行**的部分。

```
tools/
├── verify-csv.mjs        全量不变量自检 (最常用)
├── build-mod.mjs         把文本包部署到游戏的 mods 目录
├── deploy-font.mjs       把 DLL + 字形图集 + 许可部署到 mods 目录
├── pack-mod.ps1          打包便携 zip
├── merge-final.mjs       数据管线 (需要自备上游语料)
├── make-overrides.mjs    生成人工裁决表
├── gen-mech-keys.mjs     机甲名 / 变体全名 / 常备角色的 key
├── gen-glossary-names.mjs  正文里专名 (英文->中文) 的替换表
├── gen-pilot-keys.mjs    飞行员呼号与姓名的 key
├── gen-role-zh.mjs       机甲"常备角色"译名 (读 corpus/stock-role-zh.tsv)
├── glyph-scan.mjs        字形覆盖检查
├── glyph-verify.mjs      图集与字符集的一致性校验
├── qa-*.mjs              对比官方文件的一次性分析
└── font/                 字形图集的生成与自检 (见该目录下的 README)
```

## 路径约定

**脚本里没有任何写死的开发机路径。** 仓库根目录一律从脚本自身位置推导：

```js
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
```

克隆到任何目录都能直接跑。唯一要按自己环境调整的是**游戏安装路径** —— 用环境变量即可，
不必改代码：

```powershell
$env:BT_GAME = "D:\Steam\steamapps\common\BATTLETECH"
```

## 重建译文的顺序

`merge-final.mjs` 与四个 key 生成器需要**自备上游语料**（语料不入库）。
要重整份 CSV 时按这个顺序跑（生成器读的是第一遍产出的 `.tmp/prename.csv` 基线）：

```powershell
node tools\merge-final.mjs --natural        # 第一遍: 合并来源 + 写基线快照
node tools\gen-mech-keys.mjs     --write
node tools\gen-glossary-names.mjs --write
node tools\gen-pilot-keys.mjs    --write
node tools\gen-role-zh.mjs       --write
node tools\make-overrides.mjs               # 应用人工裁决
node tools\merge-final.mjs --natural        # 第二遍: 正式产出
node tools\verify-csv.mjs                   # 硬约束自检
```

> 安装 mod 的普通用户**不需要**上面任何一步：下载 zip、解压、放进 `mods\` 就行。

---

## `verify-csv.mjs` —— 全量不变量自检

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
| 全部字符在字形图集内 | 图集外的字显示为方块。基准优先用 `tools/font/charset.txt`（8,354 字），没有才退回旧的 `glyph-covered.txt`（2,615 字） |
| 无字面 `\r` | 官方用 `\n` |
| 官方 key 全覆盖、无多余、顺序一致 | 与 `strings_de-DE.csv` 对齐 |
| `[[...]]` 平衡 | 相对官方无额外残缺 |

脚本顶部有路径常量，换机器时改这里：

```js
const PROJ = 'C:/Users/<你>/Documents/BTHanHua';
const GAME = 'D:/Steam/steamapps/common/BATTLETECH/...';
```

找不到官方 `strings_de-DE.csv` 时只会跳过对照项并给出提示，不会报错。

---

## `build-mod.mjs` —— 部署文本包

```powershell
node tools\build-mod.mjs          # 部署 (带 ASCII 探针, 用于排查)
node tools\build-mod.mjs --clean  # 部署 (正式, 无探针)
```

把 `corpus/strings_zh-CN.csv` 部署到
`%USERPROFILE%\Documents\My Games\BattleTech\mods\BTHanHua\`，
并同时写出 `mod.json` / `mod.alt.json` / `说明.txt`。

## `deploy-font.mjs` —— 部署字体 mod

```powershell
node tools\deploy-font.mjs
```

把 `BTHanHuaFont.dll`、`atlas/atlas.a8` + `atlas.bin`、以及 OFL 许可复制到
`mods\BTHanHuaFont\`，并清理上次运行的日志/字形导出文件。

## `pack-mod.ps1` —— 打包便携版

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\pack-mod.ps1
```

生成 `dist\BTHanHua-mod.zip`（两个 mod 文件夹 + `移植说明.txt`），
并剔除运行期日志、调试开关，以及旧版的微软雅黑字体包。

> ⚠️ **本文件必须带 UTF-8 BOM**。Windows PowerShell 5.1 读 `.ps1` 需要 BOM，
> 否则把中文按 GBK 解码、here-string 终止符被破坏，报
> `The string is missing the terminator`。

## `glyph-scan.mjs` —— 字形覆盖检查

扫描 CSV 用到的所有码位，报告哪些落在字形图集之外（会显示成方块）。
图集覆盖表由游戏内的 mod 导出到 `mods\BTHanHuaFont\BTHanHuaFont.glyphs.txt`。

---

## `merge-final.mjs` —— 数据管线（需要自备上游语料）

真正生成 `strings_zh-CN.csv` 的合并器。它按优先级合并多个来源
（Paratranz 人工译文 > 模型补译 > 社区旧 CSV > 机翻缓存），然后依次执行：

```
字形替代 → 整词修正 → 缩写定点修正 → 用词精修 → 界面串重写 → 一致性修正
→ 术语统一 → 专名汉化 → 占位符修复 → 性别变体中文化 → 字形安全网
→ 定点覆盖 → 人工裁决 → 星币符号 ¢ 修复 → 写出
```

**`--natural` 模式**是给"图集已能覆盖全部用字"准备的：

- 跳过「字形替代」「整词修正」「界面串重写」三阶段，让译文回到自然措辞
- 字形安全网的基准从旧的 2,615 字表切换为 `tools/font/charset.txt`（8,354 字），
  于是逐字兜底自然归零，**但"还剩图集外字符就报错并以非 0 退出"这条安全网仍然有效**

最后一步是**硬性**的：只要还剩需要字形的图集外字符，就写出 `corpus/glyph-stray.jsonl`
并以非 0 退出，绝不静默发出方块字。

> 运行前需要按脚本顶部的常量准备好上游语料目录（`incoming/gh`）。
> 上游数据不随本仓库分发，请自行从上游项目获取。

## `make-overrides.mjs` —— 人工裁决表

生成 `tools/font/overrides.jsonl`：换用自然措辞后，少数条目旧版反而更好
（例如旧版把 `Greenland` 译成「格林兰」、自然版却留了英文），以及个别两边都不对、
需要人工重写的条目。每条带 `why` 说明官方依据，改一条只需增删一行再重跑管线。

> 注意：本脚本读的是**旧版交付 CSV 的备份**，不能读 `corpus/strings_zh-CN.csv`
> —— 后者每次跑 `--natural` 都会被覆盖，否则会把新值当成"旧版值"钉住（自我引用）。

## `qa-*.mjs` —— 对比官方文件做的一次性分析

排查问题时写的，用来把我们的 CSV 和官方 `strings_de-DE.csv` / `fr-FR` / `ru-RU`
做逐条对比，找出「官方怎么写、我们怎么写」的差异：

| 脚本 | 用途 |
|---|---|
| `qa-us.mjs` | U+001F（官方逗号替身）的使用对比 |
| `qa-cost.mjs` | 找出会渲染成「一长串数字」的值 |
| `qa-quotes.mjs` | 引号连续段长度分布对比 |
| `qa-labels2.mjs` | 命中部位标签等短标签对比 |

它们会把结果写到 `corpus/_qa_*.txt`（含中文，别用 `Get-Content` 直接看到控制台，
PowerShell 的编码会乱码）。
