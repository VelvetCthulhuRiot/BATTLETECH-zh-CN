# 从 asset bundle 里抽出 DLC 内容, 供汉化 key 生成器使用:
#   1) 机甲定义 (Name / UIName)  -> corpus/font-atlas/dlc-mechs.json
#   2) 底盘的角色 (StockRole)     -> corpus/font-atlas/stock-roles.json
#   3) 机甲简介 (Description.Details) -> corpus/font-atlas/dlc-descriptions.json
#      (第九轮加的: 官方本地化完全没有覆盖 DLC 机甲的简介, 游戏里一直显示英文,
#       要按"英文字符串规范化后当 key"的机制补 key, 就得先把这些英文抽出来)
# 为什么需要: DLC 的 mechdef / chassisdef 不在 StreamingAssets\data 磁盘上, 而在
# flashpoint / heavymetal / urbanwarfare / shadowhawkdlc 这几个 asset bundle 里,
# 只能靠 UnityPy 读。而机甲名与"常备角色"都是"把数据里的英文字符串规范化后当 key 查 CSV",
# 所以要先把这些字符串抽出来, 才能给它们补 key。
#
# 用法: tools\fontenv\Scripts\python.exe corpus\font-atlas\extract-dlc-mechs.py
import os, json
import UnityPy

# 游戏安装目录: BT_GAME 环境变量优先, 否则在常见 Steam 位置里找, 都找不到就报错退出。
# (与 tools/game-path.mjs 保持同一套逻辑; Steam 库不一定在 C 盘, 所以不能写死。)
def _find_game():
    cands = [
        os.environ.get('BT_GAME'),
        r'C:\Program Files (x86)\Steam\steamapps\common\BATTLETECH',
        r'C:\Program Files\Steam\steamapps\common\BATTLETECH',
        r'C:\Steam\steamapps\common\BATTLETECH',
        r'C:\SteamLibrary\steamapps\common\BATTLETECH',
        r'D:\Steam\steamapps\common\BATTLETECH',
        r'D:\SteamLibrary\steamapps\common\BATTLETECH',
        r'E:\Steam\steamapps\common\BATTLETECH',
        r'E:\SteamLibrary\steamapps\common\BATTLETECH',
        r'F:\Steam\steamapps\common\BATTLETECH',
        r'F:\SteamLibrary\steamapps\common\BATTLETECH',
    ]
    for c in cands:
        if c and os.path.isdir(os.path.join(c, 'BattleTech_Data', 'StreamingAssets', 'data')):
            return c
    print('!! 找不到 BATTLETECH 安装目录。请设环境变量 BT_GAME 指向游戏根目录, 例如:')
    print('     set BT_GAME=C:\\Program Files (x86)\\Steam\\steamapps\\common\\BATTLETECH')
    print('   不确定装在哪? Steam 客户端 -> 库 -> 右键 BATTLETECH -> 管理 -> 浏览本地文件')
    raise SystemExit(1)

GAME = _find_game()
AB = os.path.join(GAME, 'BattleTech_Data', 'StreamingAssets', 'data', 'assetbundles')
# 输出目录 = 本脚本所在目录。工作区里它在 corpus/font-atlas/ (gen-mech-keys.mjs 从这里读),
# 公开仓库里它在 tools/font/ —— 两种布局都成立, 且不含开发机路径。
OUT = os.path.dirname(os.path.abspath(__file__))
BUNDLES = ['flashpoint', 'heavymetal', 'urbanwarfare', 'shadowhawkdlc']

mechs, roles, descs = {}, {}, {}
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
        # 简介 (Description.Details): mechdef 与 chassisdef 都收, 文本相同的后面去重
        if de.get('Id') and (de.get('Details') or '').strip():
            descs[de['Id']] = {'Name': de.get('Name'), 'UIName': de.get('UIName'),
                               'Details': de['Details'],
                               'kind': 'mechdef' if 'mechdef' in low else 'chassisdef',
                               'bundle': b}
    print(f'  {b}: mechdef {n_mech}, chassisdef(带 StockRole) {n_role}')

json.dump(mechs, open(os.path.join(OUT, 'dlc-mechs.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
json.dump(roles, open(os.path.join(OUT, 'stock-roles.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
json.dump(descs, open(os.path.join(OUT, 'dlc-descriptions.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
# 简介按文本去重后的条数 (同一条简介常被 mechdef 与 chassisdef 各存一份)
uniq_desc = len({v['Details'] for v in descs.values()})
print(f'\n写出 dlc-mechs.json ({len(mechs)} 个) 与 stock-roles.json ({len(roles)} 个)')
print(f'写出 dlc-descriptions.json ({len(descs)} 条, 按文本去重 {uniq_desc} 条)')
