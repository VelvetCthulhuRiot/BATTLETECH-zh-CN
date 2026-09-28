#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""合成字形图集的最终字符集 (Step 0b)。

输入
  --gsc     通用规范汉字表 level-1/2/3.txt 所在目录
  --natural 自然措辞译文 CSV (merge-final.mjs --natural 的产物)
  --atlas   现役图集覆盖表 corpus/glyph-covered.txt
  --font    选定字体文件 (用于过滤装饰性区段 / 校验必需字符)
输出
  charset.txt  最终字符集, 每行一个字符 (ASCII 区在最前, 其余按优先级排序)
  meta.json    统计与溯源信息

字符分两类:
  【必需】通用规范汉字表 + 语料实际字符 + 现役图集覆盖 —— 字体缺任何一个都硬性报错。
  【装饰】ASCII / Latin-1 / 通用标点 / CJK标点 / 全角 —— 只保留字体真的有字形的,
        这样既不会因为纳入了不可见控制符而浪费图集格子, 也不会漏掉能渲染的符号。

优先级 = 语料词频(高->低) -> 规范字表等级(1->2->3) -> 码位
这样将来若图集要缩容, 先丢的是最生僻、语料里最不常用的字。

硬限制: TMP 1.2 的 HasCharacter(char) 与字符索引链都是 BMP,
所以通用规范汉字表里的 196 个非 BMP 字 (扩展 B 及以后) 无法支持, 直接排除。
"""
import argparse, json, os, sys, unicodedata

# 装饰性区段 (码位区间, 含两端)。这些是"有则更好"的符号:
# 汉字文本里偶尔会混入 —— … ‘ ’ “ ” • ★ 等。
# 注意不要写成大块不可见控制符区 (U+2000-206F 里的 ZWSP/双向控制符没有字形, 也不该占格子)。
OPTIONAL_RANGES = [
    (0x0021, 0x007E),   # ASCII 可打印 (无 U+0020 空格: 现役图集也没放, TMP 自己处理空白)
    (0x00A0, 0x00FF),   # Latin-1 补充 (× ÷ ° · § ¶ 等)
    (0x2010, 0x2027),   # 通用标点可打印段 (– — ‘ ’ “ ” • … ‰ ′ ″ ‹ › ⁄ 等)
    (0x2030, 0x205E),   # 通用标点可打印段 (‱ ‸ ⁄ ⁅ ⁆ 等)
    (0x2190, 0x2193),   # ← ↑ → ↓
    (0x25A0, 0x25FF),   # 几何图形 (字体有的才留)
    (0x2605, 0x2606),   # ★ ☆
    (0x2660, 0x2667),   # 花色
    (0x3000, 0x303F),   # CJK 标点 。、《》「」
    (0xFF01, 0xFF5E),   # 全角形式
]


def is_han(cp):
    return 0x4E00 <= cp <= 0x9FFF


def read_chars(path, strip="\r\n \t\uFEFF"):
    t = open(path, encoding="utf-8-sig").read()
    return [c for c in t if c not in strip]


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    proj = os.path.abspath(os.path.join(here, "..", ".."))
    ap = argparse.ArgumentParser()
    ap.add_argument("--gsc", default=os.path.join(here, "gsc"))
    ap.add_argument("--natural", default=os.path.join(
        proj, ".tmp", "natural", "corpus", "strings_zh-CN.csv"))
    ap.add_argument("--atlas", default=os.path.join(proj, "corpus", "glyph-covered.txt"))
    ap.add_argument("--font", default=os.path.join(
        here, "font", "NotoSansSC-Regular.otf"))
    ap.add_argument("--out", default=here)
    a = ap.parse_args()

    # ---- 1) 字体 cmap ----
    cmap = None
    if a.font and os.path.exists(a.font):
        from fontTools.ttLib import TTFont
        cmap = TTFont(a.font, lazy=True).getBestCmap()
        print(f"字体 {os.path.basename(a.font)}: cmap {len(cmap)} 码位")
    else:
        print("!! 未提供字体, 装饰区段不做过滤")

    # ---- 2) 通用规范汉字表: 等级 -> 字 ----
    level_of = {}
    for lv, fn in enumerate(("level-1.txt", "level-2.txt", "level-3.txt"), 1):
        p = os.path.join(a.gsc, fn)
        if not os.path.exists(p):
            sys.exit(f"缺少 {p}")
        for c in read_chars(p):
            level_of.setdefault(c, lv)

    # ---- 3) 语料词频 (来自自然措辞译文) ----
    freq = {}
    if os.path.exists(a.natural):
        rows = open(a.natural, encoding="utf-8-sig").read().split("\n")[1:]
        for line in rows:
            j = line.find(",")
            if j <= 0:
                continue
            for c in line[j + 1:].rstrip("\r"):
                freq[c] = freq.get(c, 0) + 1

    # ---- 4) 现役图集覆盖 ----
    atlas = set(read_chars(a.atlas)) if os.path.exists(a.atlas) else set()

    # ---- 5) 【必需】集合 ----
    # 排掉"不需要字形"的字符: 控制符(Cc)/格式符(Cf)/未分配(Cn)/分隔符(Z*)/代理对(Cs)。
    # 典型: U+001F 官方逗号替身、U+200B 零宽空格、U+3000 全角空格、U+00A0 不换行空格。
    # 现役图集同样不放这些 (它的 ASCII 只有 33..126, 没有空格), 空白由 TMP 自己处理。
    def needs_glyph(c):
        cat = unicodedata.category(c)
        return cat[0] != "C" and cat[0] != "Z"

    required = set(level_of) | set(freq) | atlas
    no_glyph_need = sorted(c for c in required if not needs_glyph(c))
    required = {c for c in required if needs_glyph(c)}
    req_nonbmp = sorted(c for c in required if ord(c) > 0xFFFF)
    required = {c for c in required if ord(c) <= 0xFFFF}

    # ---- 6) 【装饰】集合: 只留字体真有字形的 ----
    optional = set()
    for lo, hi in OPTIONAL_RANGES:
        for cp in range(lo, hi + 1):
            optional.add(chr(cp))
    if cmap is not None:
        dropped = sorted(c for c in optional if ord(c) not in cmap)
        optional = {c for c in optional if ord(c) in cmap}
    else:
        dropped = []
    optional -= required

    # 必需字符字体是否都覆盖 -> 缺了就是真问题
    if cmap is not None:
        req_missing = sorted(c for c in required if ord(c) not in cmap)
    else:
        req_missing = []

    keep = required | optional

    # ---- 7) 排序: ASCII 在最前, 其余按 词频降 -> 等级升 -> 码位升 ----
    ascii_c = sorted((c for c in keep if 0x20 <= ord(c) <= 0x7E), key=ord)
    rest = sorted((c for c in keep if not (0x20 <= ord(c) <= 0x7E)),
                  key=lambda c: (-freq.get(c, 0), level_of.get(c, 9), ord(c)))
    ordered = ascii_c + rest

    # ---- 8) 写出 ----
    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, "charset.txt"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(ordered) + "\n")

    cap = {}
    for n in (56, 64, 72, 75, 80, 88):
        cap[f"{n}px"] = (8192 // (n + 4)) ** 2
    meta = {
        "charset_total": len(ordered),
        "han": sum(1 for c in ordered if is_han(ord(c))),
        "required": len(required),
        "no_glyph_need_excluded": len(no_glyph_need),
        "no_glyph_need_sample": [[c, hex(ord(c)), unicodedata.category(c)] for c in no_glyph_need[:12]],
        "optional_kept": len(optional),
        "optional_dropped_no_glyph": len(dropped),
        "optional_dropped_sample": dropped[:40],
        "gsc_total": len(level_of),
        "gsc_nonbmp_excluded": len(req_nonbmp),
        "gsc_nonbmp_sample": req_nonbmp[:10],
        "natural_charset": len(freq),
        "atlas_charset": len(atlas),
        "font": os.path.basename(a.font) if a.font else None,
        "font_required_missing": req_missing,
        "capacity_8192_pad4": cap,
    }
    with open(os.path.join(a.out, "meta.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    # ---- 9) 报告 ----
    print(f"通用规范汉字表      : {len(level_of)} 字 (非BMP {len(req_nonbmp)} 已排除)")
    print(f"自然措辞语料        : {len(freq)} 字符")
    print(f"现役图集覆盖        : {len(atlas)}")
    print(f"必需集合            : {len(required)}")
    print(f"装饰区段保留        : {len(optional)}  (因字体无字形丢掉 {len(dropped)})")
    print(f"最终字符集          : {len(ordered)}  (汉字 {meta['han']}, ASCII {len(ascii_c)})")
    print(f"8192²+4px @75px 容量: {cap['75px']}  余量 {(1 - len(ordered) / cap['75px']) * 100:.0f}%")
    if req_missing:
        print(f"!! 字体缺少 {len(req_missing)} 个必需字符: {''.join(req_missing[:40])}")
    else:
        print("必需字符字体 100% 覆盖 ✓")
    print(f"已写出 {os.path.join(a.out, 'charset.txt')} 与 meta.json")


if __name__ == "__main__":
    main()
