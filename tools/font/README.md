# tools/font/ —— 字形图集的生成与自检

这里是把 **Noto Sans SC** 栅格化成游戏可用字形图集的全部输入与脚本。
产物落在 `mods/BTHanHuaFont/atlas/`。

完整的技术说明（实测数据、字形度量约定、踩过的坑）见
[`docs/FONT-ATLAS.md`](../../docs/FONT-ATLAS.md)。

---

## 目录内容

| 文件 | 说明 |
|---|---|
| `charset.txt` | **最终字符集，8,354 字**（每行一个字符，ASCII 在前，其余按语料词频排序） |
| `make-charset.py` | 合成 `charset.txt` |
| `build-atlas.py` | 栅格化并打包成 `atlas.a8` + `atlas.bin` |
| `verify-atlas.py` | 离线自检：图集像素 vs FreeType 直接栅格化，逐字节比对 |
| `overrides.jsonl` | **人工裁决表**：译文里逐条人工确认过的覆盖项，每条带 `why` 出处 |
| `PROVENANCE.md` | 素材出处、SHA256、许可要点、复现命令 |
| `gsc/level-{1,2,3}.txt` | 《通用规范汉字表》一级/二级/三级，共 8,105 字 |
| `font/`（**不在仓库里**） | 需要自行下载的字体文件，见下 |

---

## 需要的字体

仓库**不包含**字体文件（8.3 MB，且可下载 + 可校验），请自行获取：

| 项 | 值 |
|---|---|
| 文件 | `NotoSansSC-Regular.otf` |
| 下载 | https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf |
| 大小 | 8,331,336 字节 |
| SHA256 | `FAA6C9DF652116DDE789D351359F3D7E5D2285A2B2A1F04A2D7244DF706D5EA9` |
| 版本 | `2.004;GOOG;NotoSansSC-Regular;ADOBE`（Noto Sans SC Regular，`usWeightClass=400`） |
| 授权 | **SIL Open Font License 1.1**（见 [`LICENSE-OFL.txt`](../../LICENSE-OFL.txt)） |

放到 `tools/font/font/NotoSansSC-Regular.otf`。

> ⚠️ 不要用 Windows 自带的 `C:\Windows\Fonts\NotoSansSC-VF.ttf`：那份变体的 `wght` 轴
> **default = 100**，直接栅格化会得到发丝一样细的汉字，必须 instance 到 400 才能用。
> 本方案改用官方静态 Regular，绕开了这个坑。

---

## 运行环境

需要 Python 3 与三个包（**不要装进系统 Python**，用虚拟环境）：

```powershell
python -m venv tools\fontenv
tools\fontenv\Scripts\python -m pip install fonttools freetype-py Pillow
```

---

## 重新生成

```powershell
$PY = "tools\fontenv\Scripts\python.exe"

# 1) 合成字符集 (需要语料 corpus/ 与 corpus/glyph-covered.txt)
& $PY tools\font\make-charset.py --gsc tools\font\gsc --font tools\font\font\NotoSansSC-Regular.otf

# 2) 生成图集 (约 5 秒)
& $PY tools\font\build-atlas.py --atlas 8192 --out tools\font\out

# 3) 自检 (预期: 8352 / 8352 逐字节完全一致)
& $PY tools\font\verify-atlas.py --out tools\font\out --sample 9000

# 4) 部署到游戏 mods 目录
node tools\deploy-font.mjs
```

> 第 1 步需要 `corpus/` 里的译文语料（未随仓库公开）。
> 若只想重建图集、不改字符集，可以跳过第 1 步，直接用仓库里已有的 `charset.txt`。

---

## overrides.jsonl 是什么

译文管线的最后一环有两处"人工介入"：

1. `merge-final.mjs` 用 `--natural` 跳过全部字形妥协后，有少数条目的**旧版措辞反而更好**
   （例如旧版把 `Greenland` 译成「格林兰」，自然版却留了英文）
2. 个别条目两边都不对，需要人工重写；以及用户反馈确认的译文错误

这些结论逐条记在 `overrides.jsonl` 里，格式：

```json
{"key":"scar","value":"疤痕","src":"custom",
 "why":"官方 de=Narbe / fr=Balafre 都是\"疤痕\"; 旧译\"创伤\"是 wound/trauma, 不准确"}
```

`merge-final.mjs` 会在管线末尾应用它；`src` 为 `shipped` 表示值取自 v1.0 的交付版本，
`custom` 表示人工新写。改一条只需增删一行再重跑管线，**可复现、可回滚、带出处**。
