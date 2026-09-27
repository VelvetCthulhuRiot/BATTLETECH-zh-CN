# 把当前汉化 mod 打包成一个可整包搬走的 zip
# 用法: powershell -ExecutionPolicy Bypass -File pack-mod.ps1
$ErrorActionPreference = 'Stop'
$mods = Join-Path $env:USERPROFILE 'Documents\My Games\BattleTech\mods'
$dist = 'C:\Users\lxp_0\Documents\BTHanHua\dist'
$stage = Join-Path $dist 'stage'
$zip = Join-Path $dist 'BTHanHua-mod.zip'

if (-not (Test-Path (Join-Path $mods 'BTHanHua'))) { throw "找不到 $mods\BTHanHua" }
if (-not (Test-Path (Join-Path $mods 'BTHanHuaFont'))) { throw "找不到 $mods\BTHanHuaFont" }

Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
Remove-Item -Force $zip -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'mods') | Out-Null

Copy-Item -Recurse (Join-Path $mods 'BTHanHua') (Join-Path $stage 'mods')
Copy-Item -Recurse (Join-Path $mods 'BTHanHuaFont') (Join-Path $stage 'mods')

# 去掉运行时产物 (日志/字形表), 它们会在新机器上重新生成
Remove-Item -Force (Join-Path $stage 'mods\BTHanHuaFont\BTHanHuaFont.log') -ErrorAction SilentlyContinue
Remove-Item -Force (Join-Path $stage 'mods\BTHanHuaFont\BTHanHuaFont.glyphs.txt') -ErrorAction SilentlyContinue

$readme = @'
BATTLETECH 简体中文汉化 —— 迁移说明
=====================================
项目主页: https://github.com/VelvetCthulhuRiot/BATTLETECH-zh-CN

【包含内容】
  mods\BTHanHua\       文本汉化   (mod.json + strings_zh-CN.csv 共 21,505 条)
  mods\BTHanHuaFont\   字体注入   (systemMod.json + BTHanHuaFont.dll + font 字体包)

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
  * 文字变成方框/不显示: 删掉 BTHanHuaFont 文件夹即可, 文本汉化不受影响。
  * 界面还是英文: 设置里选「中文」; 下拉框里没有「中文」说明 mod.json 没加载成功,
    可以用 mod.alt.json 覆盖 mod.json 再试。
  * 某个词读起来怪怪的 (如「眼毛」): 字体字表只有 2,610 个汉字, 图集外的字会变方块,
    所以做了有意替换, 不是错译。详见项目 README 的说明。
  * 想完全恢复原版: 删掉两个文件夹。
  * 诊断日志: mods\BTHanHuaFont\BTHanHuaFont.log

【授权】
  译文语料改编自 cxwithyxy/BATTLETECH_zhcn (MIT, (c) 2022 cx2889)。
  字体包 font 是微软雅黑的 SDF 图集, 字体授权提示见项目 THIRDPARTY.md。
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
