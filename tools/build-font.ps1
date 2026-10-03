# 编译 BTHanHuaFont 注入程序 (C#) -> mod-src\BTHanHuaFont.new.dll
#
# 为什么需要这一步: 除了字形注入, 还有极少数"运行期按界面改写文本"的特例
# (例如 medium 这条 key 被"机甲吨位级别"与"设置里的画质下拉"共用, 见 FontMod.cs 的 FixMedium),
# 改完源码必须重新编译 DLL。
#
# 依赖: Windows 自带的 .NET Framework 编译器 csc.exe (C# 5) + 游戏 Managed 目录里的引用程序集。
#       源码用 /noconfig /nostdlib+ 编译, 显式引用游戏那套程序集 (与 Unity 的 Mono 运行时一致;
#       不加 /noconfig 的话 csc.rsp 会带进桌面版 System.dll 与游戏版撞标识报 CS1703)。
#
# 用法: powershell -ExecutionPolicy Bypass -File tools\build-font.ps1
#       游戏目录取 -GameDir 参数, 其次取环境变量 BT_GAME (脚本里不写死开发机路径)。
#       产物 mod-src\BTHanHuaFont.new.dll 由 tools\deploy-font.mjs 转正并部署。
param([string]$GameDir = '')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$modSrc = Join-Path $root 'mod-src'
$out = Join-Path $modSrc 'BTHanHuaFont.new.dll'

if (-not $GameDir) { $GameDir = $env:BT_GAME }
if (-not $GameDir) { throw '需要游戏目录: 传 -GameDir <路径> 或设置环境变量 BT_GAME' }
$managed = Join-Path $GameDir 'BattleTech_Data\Managed'
if (-not (Test-Path $managed)) { throw "找不到 $managed" }

$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = 'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path $csc)) { throw '找不到 csc.exe (.NET Framework)' }

# 引用集: 游戏自带的 mscorlib/System*/Unity*/0Harmony/TMP。
# 新增用到的 Unity 模块时在这里补一行 (缺哪个模块 csc 会报 CS1070 并点名程序集)。
$names = @(
  'mscorlib.dll', 'System.dll', 'System.Core.dll',
  'Assembly-CSharp.dll', '0Harmony.dll', 'Unity.TextMeshPro.dll',
  'UnityEngine.dll', 'UnityEngine.CoreModule.dll', 'UnityEngine.UI.dll', 'UnityEngine.UIModule.dll',
  'UnityEngine.TextRenderingModule.dll', 'UnityEngine.ImageConversionModule.dll',
  'UnityEngine.AssetBundleModule.dll', 'UnityEngine.TextCoreModule.dll',
  'UnityEngine.JSONSerializeModule.dll', 'UnityEngine.UnityWebRequestModule.dll',
  'UnityEngine.UnityWebRequestTextureModule.dll', 'UnityEngine.UnityWebRequestAssetBundleModule.dll',
  'UnityEngine.PhysicsModule.dll', 'UnityEngine.AudioModule.dll'
)
$refs = @()
foreach ($n in $names) {
  $p = Join-Path $managed $n
  if (-not (Test-Path $p)) { throw "缺少引用程序集 $n" }
  $refs += ('/reference:' + $p)
}

$src = @('AtlasFont.cs', 'FontMod.cs', 'FullFont.cs') | ForEach-Object { Join-Path $modSrc $_ }
foreach ($s in $src) { if (-not (Test-Path $s)) { throw "缺少源码 $s" } }

Write-Host '编译中 (csc, C# 5)...'
& $csc /noconfig /nostdlib+ /target:library /nologo /optimize+ /out:$out @refs @src
if ($LASTEXITCODE -ne 0) { throw "csc 失败 (exit $LASTEXITCODE)" }

$f = Get-Item $out
Write-Host ("已生成 {0}  ({1} 字节)" -f $f.FullName, $f.Length)
Write-Host ("sha256 " + (Get-FileHash $out -Algorithm SHA256).Hash)
Write-Host '下一步: node tools\deploy-font.mjs   (把 .new.dll 转正并部署到 mods 目录)'
