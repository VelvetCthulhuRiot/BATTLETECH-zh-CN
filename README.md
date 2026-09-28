# BATTLETECH 简体中文汉化 (BTHanHua)

[![release](https://img.shields.io/github/v/release/VelvetCthulhuRiot/BATTLETECH-zh-CN?label=release&color=blue)](https://github.com/VelvetCthulhuRiot/BATTLETECH-zh-CN/releases/latest) [![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE) ![game](https://img.shields.io/badge/%E6%B8%B8%E6%88%8F%E7%89%88%E6%9C%AC-1.9.1%20%28686R%29-orange)

给 **BATTLETECH (2018, Harebrained Schemes)** 做的简体中文汉化，通过游戏**官方 ModLoader** 注入，
**不修改游戏安装目录里的任何文件**。

- 覆盖 **21,505 / 21,505** 条官方本地化键（100%，0 条未翻译）
- **8,352 个字形**的离线中文字形图集（Noto Sans SC，SIL OFL 1.1），
  含《通用规范汉字表》全部 BMP 汉字，**无缺字、无字形妥协**
- 引用键顺序与官方 `strings_de-DE.csv` 完全一致
- 自带全量不变量自检脚本，可自行复核

> 游戏版本要求：**1.9.1 (build 686R)**，Steam AppID `637090`。
> `BTHanHuaFont.dll` 是针对该版本的游戏程序集编译的，换版本需要重新编译。

---

## 界面预览

| | |
|---|---|
| ![主菜单](docs/screenshots/main-menu.jpg)<br>主菜单 | ![语言设置](docs/screenshots/settings-language.jpg)<br>设置 → 语言 → **中文** |
| ![模组管理](docs/screenshots/mods-menu.jpg)<br>MODS 里两个模组**已启用** | ![生涯模式](docs/screenshots/career-main.jpg)<br>生涯模式主界面（阿尔戈号） |
| ![任务列表](docs/screenshots/career-contracts.jpg)<br>可用合约列表 | ![角色出身](docs/screenshots/career-origin.jpg)<br>角色出身与背景属性 |
| ![机甲库](docs/screenshots/skirmish-mechbay.jpg)<br>遭遇战机甲库 / 自定义小队 | ![战斗](docs/screenshots/skirmish-battle.jpg)<br>遭遇战战斗界面 |

> 主菜单右下角的 **Season Pass 横幅仍是英文** —— 那串文字不经过游戏的本地化系统
> （它由外部注入，`LocalizeKey` 根本看不到），CSV 汉化覆盖不到，属于已知限制。
> 除此之外截图里的界面文字都是中文。

---

## 安装

1. 到 **[Releases](https://github.com/VelvetCthulhuRiot/BATTLETECH-zh-CN/releases/latest)** 下载 **`BTHanHua-mod.zip`**
   （仓库根目录也放了一份内容完全相同的 `BTHanHua-mod.zip`，或者直接克隆本仓库）
2. 把 `mods` 里的**两个文件夹**整体复制到：

   ```
   C:\Users\<你的用户名>\Documents\My Games\BattleTech\mods\
   ```

   （`mods` 目录不存在就自己新建。注意 `My Games` 里有空格）
3. 启动游戏 → 主菜单左下角 **MODS** → 勾选右上角 **「模组启用」** → 点 **SAVE**

   ![模组管理](docs/screenshots/mods-menu.jpg)

4. **重启游戏** → **设置 → LANGUAGE → 中文**

   ![语言设置](docs/screenshots/settings-language.jpg)

第 3、4 步不能省：模组启用开关和语言选择存在**游戏自己的设置**里，不在 mod 文件夹内，
所以换电脑时要重新做一次。

### 卸载

删掉这两个文件夹即可：

```
mods\BTHanHua\
mods\BTHanHuaFont\
```

游戏安装目录零改动，**Steam「验证游戏文件完整性」不受影响**
（它只校验 depot 清单内的文件，不会删除未知文件，也不会因为我们而判定文件损坏）。

### ⚠️ 第一次打开 MODS 界面可能会提示「检测不到模组」——这是正常的

装好之后第一次进 MODS 界面，**可能会有个小窗口提示检测不到模组**，或者模组列表是空的。
**这不是装错了，是正常现象**，原因有两个：

1. 游戏的模组功能**默认是关的**（右上角「模组启用」是未勾选状态）
2. 游戏第一次运行时要**建立模组索引**（缓存在 `mods\HBS\Cache\`），这需要一次重启才能完成

**照这样做就行**：勾选右上角 **「模组启用」** → 点 **保存** → **完全退出并重启游戏**。
重启后再进 MODS，列表里就会出现 `BTHANHUA` 和 `BTHANHUA FONT`，状态都是 **已启用**（见上方截图）。

如果你不放心，可以看 `mods\HBS\Cache\mod_status.json`，里面 `"failedToLoad": false` 和
`"enabled": true` 就说明两个模组都正常加载了。这个 `HBS\Cache` 目录和 `modloader.log`
都可以随便删，游戏会自己重建。

---

## 目录结构

```
mods\BTHanHua\          文本汉化 (Game Mod)
  mod.json              ModLoader 描述文件: Manifest 把 strings_zh-CN.csv 注入版本清单
  mod.alt.json          备用描述文件 (若 mod.json 加载失败, 用它替换再试)
  strings_zh-CN.csv     中文文本包 (21,505 条, 4.6 MB)
  说明.txt               随包说明

mods\BTHanHuaFont\      字体注入 (System Mod)
  systemMod.json        System Mod 描述文件
  BTHanHuaFont.dll      注入程序 (C#, 针对 1.9.1 编译)
  atlas\atlas.a8        字形图集像素 (8192x8192 Alpha8, 64 MB) —— 让中文能渲染出来
  atlas\atlas.bin       字形记录 (8,352 条 + FaceInfo)
  LICENSE-OFL.txt       Noto Sans SC 的 SIL OFL 1.1 许可全文 (随包必须带)

src\                    注入程序源码
tools\                  构建与自检脚本
tools\font\             字形图集的生成脚本与字符集
docs\screenshots\       界面截图
BTHanHua-mod.zip        打包好的便携版 (两个 mod 文件夹 + 迁移说明)
```

> `atlas.a8` 是裸位图，压缩后只有 7 MB（原始 64 MB），所以 zip 里并不占多少体积。

### 两个 mod 为什么要分开

游戏 ModLoader 要求 **Game Mod** 与 **System Mod** 用不同的 `Name`。
最初放在同一个文件夹里会导致 `ModLoader.GetCombinedModStatus()` 无限递归、MODS 菜单卡死，
所以拆成两个文件夹（`BTHanHua` / `BTHanHuaFont`）。

---

## 汉化是怎么生效的

游戏原生的多语言系统支持 10 种 culture，其中包括 `CULTURE_ZH_CN`（"Mandarin"），
但官方只发布了 de-DE / fr-FR / ru-RU。它的实现方式是：

1. 游戏支持的 culture 列表 = **版本清单（VersionManifest）里能找到的 CSV 资源**
2. `mod.json` 的 `Manifest` 声明一个 `CSV` 资源，ModLoader 就会把它注入版本清单
3. 于是「中文」出现在语言下拉框里，游戏按 `KEY,value` 逐条取值

所以**一行游戏文件都不用改**：我们只是往版本清单里加了一个资源。

### 几个必须遵守的格式约定（改文本时请注意）

| 约定 | 原因 |
|---|---|
| 值里**不能有半角逗号 `,`** | 会破坏游戏 CSV 解析。断句用全角 `，`；数字千位分隔也用全角（`160，000`） |
| 每行的双引号个数必须是**偶数** | 游戏解析器是引号状态机。一个字面引号要写成 `""`（官方 de/fr/ru 的引号连续段最长就是 2） |
| `[[引用键<U+001F>显示文本]]` | `[[...]]` 是富文本链接。**分隔符是一个不可见的 U+001F**，不是空格 |
| U+001F 也是官方的**逗号替身** | 官方 de-DE 在链接标记之外用了 29,409 个 U+001F。游戏载入时会还原成真逗号 |
| 不能出现字面 `\r` | 官方用 `\n`（3425 行）对 `\r\n`（仅 4 行） |

最后两条组合起来有个重要后果：`.NET` 数字格式串里的逗号**必须**写成 U+001F，
写成全角 `，` 会被 .NET 当成普通字符，于是机甲造价显示成 `2160000，，.00M` 而不是 `2.16M`。
这是本项目踩过的坑之一。

> **关于字形**：v1.1 起图集覆盖 8,352 字（含规范字表全部 BMP 汉字），
> 译文用字不再有任何限制——`tools/glyph-covered.txt` 那份 2,615 字白名单已不再需要，
> `verify-csv.mjs` 会自动改用 `tools/font/charset.txt` 做基准。

---

## 自检

仓库自带全量不变量自检，一条命令：

```powershell
node tools\verify-csv.mjs
```

退出码 0 = 全部通过。它检查：

```
[1] 编码形态      条目数 21505 · 无 BOM · 仅 LF
[2] 逐行解析      值内无半角逗号 · 每行引号数为偶数 · 引号连续段 ≤ 2
                  每个 [[...]] 恰好 1 个 U+001F 分隔符
                  全部字符都在字形图集内 · 无字面 \r
[3] 与官方对齐    官方 key 全部有译文 · 无多余 key · key 相对顺序与官方一致
[4] 链接标记      [[...]] 平衡 (相对官方无额外残缺)
```

字形基准会自动选用 `tools/font/charset.txt`（新的 8,354 字图集）；
没有它才退回旧的 `tools/glyph-covered.txt`（2,615 字）。

脚本会自动从游戏目录读取官方 `strings_de-DE.csv` 做对照；找不到时只跳过对照项，不报错。
路径写在脚本顶部，换机器可自行修改。

### 字形图集自检

```powershell
python tools\font\verify-atlas.py --out tools\font\out --sample 9000
```

它把图集里的每个字形像素与 FreeType 直接栅格化的结果逐字节比对
（当前结果是 **8,352 / 8,352 完全一致**），并校验 `atlas.bin` 的 CRC32 与 FaceInfo 合理性。

---

## 出问题了怎么办

| 症状 | 处置 |
|---|---|
| 首次进 MODS 提示**检测不到模组** | **正常现象**。勾选「模组启用」→ 保存 → **完全重启游戏**（首次要建模组索引） |
| 中文变成**方框**/不显示 | 说明字形图集没加载成功。看 `mods\BTHanHuaFont\BTHanHuaFont.log` 里的 `AtlasFont` 行；日志会写明原因（缺 `atlas\atlas.a8`、CRC 不符、着色器找不到…） |
| 界面还是**英文** | 设置 → LANGUAGE 选「中文」。若下拉框里没有「中文」，说明 `mod.json` 没加载成功——试试用 `mod.alt.json` 覆盖 `mod.json` |
| MODS 菜单**卡死** | 确认两个 mod 在**两个独立文件夹**里，且 `Name` 不同 |
| 想恢复原样 | 删掉两个文件夹，重启游戏 |

注入程序会往 `mods\BTHanHuaFont\BTHanHuaFont.log` 写自己的日志（游戏默认的
`settings.json` 里日志级别是 `Error` 且 `disableLoggingOnLoad: true`，所以不能只靠游戏日志）。
日志里可以看字形图集的加载结果、覆盖率、以及漏译（MISS）记录。

---

## 关于字体与译文

游戏自带字体不含汉字，得靠 `BTHanHuaFont` 注入一个中文字形图集。

**v1.1 起图集有 8,352 个字形**，由 **Noto Sans SC**（SIL OFL 1.1，可自由再分发）离线生成，
覆盖《通用规范汉字表》一级/二级/三级**全部 BMP 汉字**（7,909 字）。因此：

- 译文**没有任何字形限制**，`眉毛` / `鸣谢` / `渡鸦` / `翡翠曙光` 这些自然写法都在
- v1.0 那 **816 条字形替换规则已全部回滚**（当时图集只有 2,610 汉字，导致
  `眉毛→眼毛`、`渡鸦→鸟/Raven` 这类"怪译文"；那些是**有意取舍，不是错译**，现在都已成为历史）
- 官方有、旧版因为缺 `¢` 字形而被删掉的**星币符号**也补回来了
  （例如 `现金奖励： 1，000，000` → `现金奖励： ¢1,000,000`）

只有两种字仍然渲染不出，属于技术硬限制：

- **CJK 扩展 B 及以后**（非 BMP 字符，如 `𠅘` `𠙶`）——TMP 1.2 的字符索引链是 BMP，无法支持，
  规范字表里的 196 个此类字符已排除
- 玩家**自己输入**的极生僻字可能不在 8,354 字的字符集里

### 实现细节

完整的实测数据、字形度量约定、踩过的坑与复现步骤写在
[`docs/FONT-ATLAS.md`](docs/FONT-ATLAS.md)。生成脚本在
[`tools/font/`](tools/font/)，字符集是 [`tools/font/charset.txt`](tools/font/charset.txt)。

### 发现真的错译 / 读不通？

如果你看到的是**整句不通、意思反了、明显机翻腔、或者某句完全没有中文**，
那是真的缺陷，欢迎开 [Issue](https://github.com/VelvetCthulhuRiot/BATTLETECH-zh-CN/issues)，
把界面上的原话（或截图）贴上来，我可以定位到具体的 key 去改。

译文的修正都集中记录在 `tools/font/overrides.jsonl`（每条带 `why` 说明官方依据），
可复查、可回滚。

---

## 已知限制（如实说明）

- **CJK 扩展 B 及以后无法渲染**：TMP 1.2 的字符索引链是 BMP，规范字表里的 196 个非 BMP 字符
  （如 `𠅘` `𠙶`）已排除。玩家自己输入的极生僻字也可能不在 8,354 字的字符集里。
- **约 10,300 条社区人工译文（Paratranz）未做二次精修**：抽样看是 `glacier→冰川` 这种已译好的
  词条，改动收益接近零。机器翻译来源的部分（约 5,600 条）已逐条精修过。
- **2 处裸 `DM.*` 引用**保留原样：官方德语本身就是裸的，与官方保持一致。
- 少量开发者内部串（`(HIDDEN)…` 调试目标名）故意不翻译。
- **主菜单右下角的 Season Pass 横幅仍是英文**：那串文字不经过游戏的本地化系统，CSV 覆盖不到。
- **只支持 1.9.1 (686R)**：DLL 依赖该版本的游戏程序集。

---

## 从源码构建

`src\` 里是注入程序源码（`FontMod.cs` / `AtlasFont.cs`，另附已不启用的 `FullFont.cs`）。
用 .NET Framework 自带的编译器即可，**不需要装 Visual Studio**：

```powershell
$Game = "D:\Steam\steamapps\common\BATTLETECH"
$Managed = "$Game\BattleTech_Data\Managed"
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

& $csc /target:library /nowarn:0618 /out:BTHanHuaFont.dll `
  /reference:"$Managed\UnityEngine.dll" `
  /reference:"$Managed\UnityEngine.CoreModule.dll" `
  /reference:"$Managed\UnityEngine.AssetBundleModule.dll" `
  /reference:"$Managed\UnityEngine.ImageConversionModule.dll" `
  /reference:"$Managed\UnityEngine.UIModule.dll" `
  /reference:"$Managed\UnityEngine.IMGUIModule.dll" `
  /reference:"$Managed\UnityEngine.TextRenderingModule.dll" `
  /reference:"$Managed\UnityEngine.UI.dll" `
  /reference:"$Managed\Unity.TextMeshPro.dll" `
  /reference:"$Game\Mods\HBS\0Harmony.dll" `
  src\FontMod.cs src\FullFont.cs src\AtlasFont.cs
```

> 注意：编译器是 .NET Framework 自带的 **C# 5**（不支持字符串插值、`nameof`、`?.` 等），
> 改代码时请守住这个语言版本。
>
> 也不需要再引用 `Assembly-CSharp.dll`——注入点全部按类型名反射查找，
> 这样编译时无需游戏本体程序集，仓库因此不含任何游戏文件。

字形图集的生成脚本在 `tools\font\`（Python + freetype-py），字符集、上游字表、
字体出处与 SHA256 见 [`tools/font/README.md`](tools/font/README.md) 与
[`docs/FONT-ATLAS.md`](docs/FONT-ATLAS.md)。

数据管线的完整工具链（合并各来源、术语统一、专名汉化、字形安全网等）也在 `tools\` 里，
其中 `merge-final.mjs` 需要自行准备上游语料后才能运行（见脚本内的路径常量）。

---

## 发布新版本

发版不用手动传文件，打个 tag 就行：

```powershell
cd repo
node tools\verify-csv.mjs                 # 先自检, 退出码 0 才继续
powershell -File tools\pack-mod.ps1       # 重新生成 dist\BTHanHua-mod.zip
copy dist\BTHanHua-mod.zip .              # 同步仓库根目录那份
# 写发版说明: docs\release-notes\v1.2.md (工作流会读它)
git add -A; git commit -m "v1.2: ..."; git push
git tag -a v1.2 -m "v1.2"; git push origin v1.2
```

推 tag 会触发 [`.github/workflows/attach-release-asset.yml`](.github/workflows/attach-release-asset.yml)，
在 GitHub 的 runner 上自动创建 Release、用 `docs/release-notes/<tag>.md` 作为发版说明，
并把 `BTHanHua-mod.zip` 挂上去（release 已存在则更新说明并覆盖资源，可安全重跑）。

> 为什么用 Actions 而不是本地 `gh release upload`：本机 `uploads.github.com` 被 DNS 污染
> （解析到 bit.ly 的 IP），直传走不通。放到 runner 上执行就绕开了。
>
> 也可以手动补挂：Actions → **Attach release asset** → Run workflow，填 tag 和文件名。

---

## 授权与致谢

- 本项目（注入程序源码、构建脚本、以及在此之上的译文修订）：**MIT**，见 [`LICENSE`](LICENSE)
- 译文语料改编自 **[cxwithyxy/BATTLETECH_zhcn](https://github.com/cxwithyxy/BATTLETECH_zhcn)**
  （MIT License, Copyright © 2022 cx2889），其中包含 Paratranz 社区人工译文
- 字形来自 **[Noto Sans SC](https://github.com/notofonts/noto-cjk)**（Google 与 Adobe 联合开发，
  与思源黑体同源），**SIL Open Font License 1.1**，可自由再分发。
  图集属于其衍生作品，随包提供 [OFL 全文](LICENSE-OFL.txt)

第三方归属与授权细节详见 [`THIRDPARTY.md`](THIRDPARTY.md)。

> v1.0 曾随包携带一份 **Microsoft YaHei（微软雅黑）** 的 TextMeshPro 字形图集，其再分发授权并不明确；
> **v1.1 起已彻底移除**，改由上面这份 OFL 图集承担渲染。

BATTLETECH 是 Harebrained Schemes / Paradox Interactive 的商标与版权作品。
本仓库只包含**文本与代码**，不含任何游戏本体文件；使用时请自备正版游戏。
