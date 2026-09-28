# 从 asset bundle 里抽出 DLC 内容, 供汉化 key 生成器使用:
#   1) 机甲定义 (Name / UIName)  -> corpus/font-atlas/dlc-mechs.json
#   2) 底盘的角色 (StockRole)     -> corpus/font-atlas/stock-roles.json
# 为什么需要: DLC 的 mechdef / chassisdef 不在 StreamingAssets\data 磁盘上, 而在
# flashpoint / heavymetal / urbanwarfare / shadowhawkdlc 这几个 asset bundle 里,
# 只能靠 UnityPy 读。而机甲名与"常备角色"都是"把数据里的英文字符串规范化后当 key 查 CSV",
# 所以要先把这些字符串抽出来, 才能给它们补 key。
#
# 用法: tools\fontenv\Scripts\python.exe corpus\font-atlas\extract-dlc-mechs.py
import os, json
import UnityPy

# 游戏安装路径: 可用环境变量 BT_GAME 覆盖, 省得改脚本
GAME = os.environ.get('BT_GAME', r'D:\MyDownload\Things\Steam\steamapps\common\BATTLETECH')
AB = os.path.join(GAME, 'BattleTech_Data', 'StreamingAssets', 'data', 'assetbundles')
# 输出目录 = 本脚本所在目录。工作区里它在 corpus/font-atlas/ (gen-mech-keys.mjs 从这里读),
# 公开仓库里它在 tools/font/ —— 两种布局都成立, 且不含开发机路径。
OUT = os.path.dirname(os.path.abspath(__file__))
BUNDLES = ['flashpoint', 'heavymetal', 'urbanwarfare', 'shadowhawkdlc']

mechs, roles = {}, {}
for b in BUNDLES:
    p = os.path.join(AB, b)
    if not os.path.exists(p):
        print(f'  (缺 {b})')
        continue
    env = UnityPy.load(p)
    n_mech = n_role = 0
    for obj in env.objects:
        if obj.type.name != 'TextAsset':
            continue
        try:
            d = obj.read()
        except Exception:
            continue
        nm = getattr(d, 'm_Name', '') or ''
        low = nm.lower()
        if 'mechdef' not in low and 'chassisdef' not in low:
            continue
        raw = d.m_Script
        if isinstance(raw, bytes):
            raw = raw.decode('utf-8', 'ignore')
        try:
            j = json.loads(raw)
        except Exception:
            continue
        de = j.get('Description') or {}
        if 'mechdef' in low:
            if de.get('Id'):
                mechs[de['Id']] = {'Name': de.get('Name'), 'UIName': de.get('UIName'), 'bundle': b}
                n_mech += 1
        else:
            if de.get('Id') and j.get('StockRole'):
                roles[de['Id']] = {'StockRole': j['StockRole'], 'bundle': b}
                n_role += 1
    print(f'  {b}: mechdef {n_mech}, chassisdef(带 StockRole) {n_role}')

json.dump(mechs, open(os.path.join(OUT, 'dlc-mechs.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
json.dump(roles, open(os.path.join(OUT, 'stock-roles.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
print(f'\n写出 dlc-mechs.json ({len(mechs)} 个) 与 stock-roles.json ({len(roles)} 个)')
