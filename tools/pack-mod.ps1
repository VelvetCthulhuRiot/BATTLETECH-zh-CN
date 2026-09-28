﻿# 把当前汉化 mod 打包成一个可整包搬走的 zip
# 用法: powershell -ExecutionPolicy Bypass -File pack-mod.ps1
#
# 注意: 本文件必须带 UTF-8 BOM。Windows PowerShell 5.1 读 .ps1 需要 BOM,
#       否则会把中文按 GBK 解码, 下面的 here-string 终止符被破坏
#       -> "The string is missing the terminator"。
$ErrorActionPreference = 'Stop'
$mods = Join-Path $env:USERPROFILE 'Documents\My Games\BattleTech\mods'
# 仓库根目录从脚本自身位置推导 (脚本位于 <root>/tools/), 克隆下来即可用
$dist = Join-Path $PSScriptRoot '..\dist'
$stage = Join-Path $dist 'stage'
$zip = Join-Path $dist 'BTHanHua-mod.zip'

if (-not (Test-Path (Join-Path $mods 'BTHanHua'))) { throw "找不到 $mods\BTHanHua" }
if (-not (Test-Path (Join-Path $mods 'BTHanHuaFont'))) { throw "找不到 $mods\BTHanHuaFont" }

# 字形图集是必需的 (v1.1 起不再带微软雅黑字体包), 缺了就打不出可用的包
foreach ($f in 'atlas\atlas.a8', 'atlas\atlas.bin', 'BTHanHuaFont.dll', 'LICENSE-OFL.txt') {
  $p = Join-Path $mods "BTHanHuaFont\$f"
  if (-not (Test-Path $p)) { throw "找不到 $p (先跑 node tools\deploy-font.mjs)" }
}

Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
Remove-Item -Force $zip -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'mods') | Out-Null

Copy-Item -Recurse (Join-Path $mods 'BTHanHua') (Join-Path $stage 'mods')
Copy-Item -Recurse (Join-Path $mods 'BTHanHuaFont') (Join-Path $stage 'mods')

# 去掉运行时产物与调试开关, 它们不该进发行包
foreach ($f in 'BTHanHuaFont.log', 'BTHanHuaFont.glyphs.txt',
  'ATLAS_OFF', 'ATLAS_FORCE', 'FONT_NOSHRINK', 'FULLFONT_ON', 'FULLFONT_OFF') {
  Remove-Item -Force (Join-Path $stage "mods\BTHanHuaFont\$f") -ErrorAction SilentlyContinue
}
# 旧版的微软雅黑字体包 (若 mods 目录里还留着, 不要打进发行包)
Remove-Item -Recurse -Force (Join-Path $stage 'mods\BTHanHuaFont\font') -ErrorAction SilentlyContinue

$readme = @'
BATTLETECH 简体中文汉化 —— 迁移说明
=====================================
项目主页: https://github.com/VelvetCthulhuRiot/BATTLETECH-zh-CN

【包含内容】
  mods\BTHanHua\        文本汉化   (mod.json + strings_zh-CN.csv 共 21,875 条)
  mods\BTHanHuaFont\    字体注入   (systemMod.json + BTHanHuaFont.dll + atlas 字形图集)
    atlas\atlas.a8      8192x8192 中文字形位图, 8,352 个字形 (原始 64 MB)
    atlas\atlas.bin     字形记录与字体度量
    LICENSE-OFL.txt     字体的 SIL OFL 1.1 许可 (随包必须带, 请勿删除)

【安装到另一台 Windows 电脑】
  1. 把 mods 里的两个文件夹整体复制到:
     C:\Users\<你的用户名>\Documents\My Games\BattleTech\mods\
     (这个目录不存在就自己新建)
  2. 启动游戏 -> 主菜单左下角 MODS -> 勾选右上角「模组启用」-> 点 SAVE
  3. 完全退出并重启游戏 -> 设置 -> LANGUAGE 选「中文」

【重要: 第一次进 MODS 界面可能提示「检测不到模组」】
  这是正常现象, 不是装错了。原因:
    * 游戏的模组功能默认是关闭的 (右上角「模组启用」未勾选)
    * 游戏第一次运行时要建立模组索引 (缓存在 mods\HBS\Cache\), 需要一次重启才能完成
  照这样做即可: 勾选「模组启用」-> 保存 -> 完全重启游戏。
  重启后列表里会出现 BTHANHUA 与 BTHANHUA FONT, 状态「已启用」。

【前提】
  * 游戏版本需为 1.9.1 (build 686R)。BTHanHuaFont.dll 是针对该版本的游戏程序集编译的。
  * 本汉化不修改游戏任何原文件: 游戏安装目录零改动, Steam「验证游戏文件完整性」不受影响。
    卸载 = 删掉上面两个文件夹。

【没有随包携带、需在新机器上手动做一次的东西】
  * 「模组启用」开关 与 语言选择: 存在游戏自己的设置里, 不在 mod 文件夹内。
  * mod 加载缓存 (mods\HBS\Cache): 游戏会自动重建, 不用管, 也可以直接删掉。

【出问题时的快速处置】
  * 中文变成方框: 说明字形图集没加载成功。看 mods\BTHanHuaFont\BTHanHuaFont.log 里的
    AtlasFont 行, 日志会写明原因 (缺 atlas.a8 / CRC 不符 / 着色器找不到 ...)。
  * 界面还是英文: 设置里选「中文」; 下拉框里没有「中文」说明 mod.json 没加载成功,
    可以用 mod.alt.json 覆盖 mod.json 再试。
  * 想完全恢复原版: 删掉两个文件夹。
  * 诊断日志: mods\BTHanHuaFont\BTHanHuaFont.log

【关于字体】
  字形来自 Noto Sans SC (Google 与 Adobe 联合开发, 与思源黑体同源), 以 SIL Open Font
  License 1.1 授权, 可自由再分发。随包提供 OFL 全文 (LICENSE-OFL.txt)。
  v1.0 曾使用微软雅黑的字形图集 (授权不明确), v1.1 起已彻底移除。

【授权】
  译文语料改编自 cxwithyxy/BATTLETECH_zhcn (MIT, (c) 2022 cx2889)。
  第三方归属详见项目 THIRDPARTY.md。
'@
Set-Content -Path (Join-Path $stage '移植说明.txt') -Value $readme -Encoding UTF8

Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue

$z = Get-Item $zip
"打包完成: $($z.FullName)"
"  大小: $([math]::Round($z.Length/1MB,2)) MB"
"  内容:"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$a = [System.IO.Compression.ZipFile]::OpenRead($zip)
$a.Entries | Sort-Object FullName | ForEach-Object { "    {0,10}  {1}" -f ([math]::Round($_.Length/1KB,1)), $_.FullName }
$a.Dispose()
