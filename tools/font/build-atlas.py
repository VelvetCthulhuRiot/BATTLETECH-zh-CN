#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 TTF/OTF 栅格化成 TMP 1.2 的 Bitmap 字形图集 (Step 1/2)。

产出三个文件到 --out:
  atlas.a8    裸 Alpha8 像素 (8192x8192, 1 字节/像素, 自下而上行序)
  atlas.bin   FaceInfo 头 + 字形记录 (小端)
  report.txt  统计与自检

为什么是 Alpha8 且自下而上:
  现役可用图集实测 m_TextureFormat=1 (Alpha8)、m_CompleteImageSize=4096*4096*1。
  运行时走 Texture2D.LoadRawTextureData, 那是直接 memcpy 进显存,
  行序必须与 bundle 内 Texture2D 的裸数据一致。
  UnityPy 的 Alpha8->PIL 转换带 FLIP_TOP_BOTTOM (Texture2DConverter.py L317),
  说明裸数据第 0 行 = 图像底行 => 我们按"自下而上"写。
  而 TMP 字形记录里的 y 是"自图像顶部往下算", 两者是独立的, 都已用现役资产反查证实。

度量约定的依据 (逐字比对现役 MSYH 图集的 2608 条记录, 6/6 偏移与步进精确一致):
  width/height = FreeType slot.bitmap.width/rows   (纯墨迹框, 不含 padding)
  xOffset      = slot.bitmap_left
  yOffset      = slot.bitmap_top                   (基线以上为正; 字形下沿 = yOffset - height)
  xAdvance     = slot.advance.x / 64
  x, y         = 图集内位置, y 自顶部算
"""
import argparse, json, os, struct, sys, zlib

MAGIC = b"BTHA"
VERSION = 1

# 现役 MSYH 图集的 FaceInfo (实测自 bundle 内的 TMP_FontAsset)。
# legacy 模式直接照搬它的"垂直度量", 目的是让行高/基线/缩进与现在完全一致 ——
# 因为这些值只影响排版, 不影响字形本身, 照搬可做到零排版回归。
# native 模式则按 Noto 自己的 hhea 计算 (行高会高约 10%)。
LEGACY_FACE = {
    "lineHeight": 99.0, "baseline": 0.0, "ascender": 79.0, "capHeight": 57.0,
    "descender": -20.0, "centerLine": 0.0, "superscriptOffset": 79.0,
    "subscriptOffset": -8.67919921875, "subSize": 0.5,
    "underline": -8.67919921875, "underlineThickness": 4.35791015625,
    "strikethrough": 21.454545974731445, "strikethroughThickness": 4.35791015625,
    "tabWidth": 187.5,
}
LEGACY_POINT_SIZE = 75.0


def crc32(b):
    return zlib.crc32(b) & 0xFFFFFFFF


def build_faceinfo(mode, size, padding, atlas, count, font):
    """返回 (name, fields dict)。字段顺序与 C# 读取顺序一致。"""
    if mode == "legacy":
        k = size / LEGACY_POINT_SIZE
        f = {name: v * k for name, v in LEGACY_FACE.items()}
        name = "Noto Sans SC (legacy metrics)"
    else:
        upm = font.units_per_EM
        asc = round(size * font.ascender / upm)
        desc = round(size * font.descender / upm)
        f = {
            "lineHeight": float(asc - desc), "baseline": 0.0, "ascender": float(asc),
            "capHeight": float(asc), "descender": float(desc), "centerLine": 0.0,
            "superscriptOffset": float(asc), "subscriptOffset": desc * 0.4,
            "subSize": 0.5, "underline": desc * 0.4,
            "underlineThickness": size * 0.058, "strikethrough": asc * 0.25,
            "strikethroughThickness": size * 0.058, "tabWidth": size * 2.5,
        }
        name = "Noto Sans SC (native metrics)"
    f["pointSize"] = float(size)
    f["scale"] = 1.0
    f["padding"] = float(padding)
    f["atlasWidth"] = float(atlas)
    f["atlasHeight"] = float(atlas)
    return name, f


def main():
    ap = argparse.ArgumentParser()
    here = os.path.dirname(os.path.abspath(__file__))
    ap.add_argument("--charset", default=os.path.join(here, "charset.txt"))
    ap.add_argument("--font", default=os.path.join(here, "font", "NotoSansSC-Regular.otf"))
    ap.add_argument("--out", default=os.path.join(here, "out"))
    ap.add_argument("--size", type=int, default=75, help="em 像素 (对应 FaceInfo.PointSize)")
    ap.add_argument("--padding", type=int, default=4)
    ap.add_argument("--atlas", type=int, default=8192)
    ap.add_argument("--faceinfo", choices=("legacy", "native"), default="legacy")
    ap.add_argument("--limit", type=int, default=0, help="只取字符集前 N 个 (PoC 用)")
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--preview-text", default="")
    a = ap.parse_args()

    import freetype
    from PIL import Image, ImageDraw

    # ---- 字符集 ----
    chars = [c for c in open(a.charset, encoding="utf-8").read() if c != "\n"]
    if a.limit:
        chars = chars[:a.limit]
    if len(set(chars)) != len(chars):
        sys.exit("字符集有重复")
    print(f"字符集: {len(chars)} 字")

    # ---- 字体 ----
    face = freetype.Face(a.font)
    face.set_pixel_sizes(0, a.size)
    upm = face.units_per_EM
    print(f"字体: units_per_EM={upm} ascender={face.ascender} descender={face.descender}")

    # ---- 逐个栅格化 + 记录度量 ----
    glyphs = []          # (id, w, h, xOffset, yOffset, xAdvance, bitmap_bytes, pitch)
    no_ink = []
    W = a.atlas
    for ch in chars:
        cp = ord(ch)
        try:
            face.load_char(ch, freetype.FT_LOAD_RENDER | freetype.FT_LOAD_TARGET_NORMAL)
        except Exception:
            no_ink.append(ch)
            continue
        s = face.glyph
        bm = s.bitmap
        w, h = bm.width, bm.rows
        adv = int(round(s.advance.x / 64))
        if w == 0 or h == 0:
            # 零墨迹字符 (NBSP / 全角空格 之类) 不写记录:
            # 现役 MSYH 图集同样没有它们 (ASCII 只有 33..126, 没有 U+0020),
            # 空白由 TMP 自己处理, 所以"不发记录"与现状完全一致, 零回归风险。
            no_ink.append(ch)
            continue
        buf = bytes(bm.buffer)
        glyphs.append((cp, w, h, s.bitmap_left, s.bitmap_top, adv, buf, bm.pitch))
    print(f"栅格化完成: 有墨迹 {sum(1 for g in glyphs if g[1] > 0)}, 无墨迹 {len(no_ink)}")
    if no_ink:
        print(f"  无墨迹字符: {''.join(no_ink[:40])}")

    # ---- 货架式摆放 (与现役 FullFont.cs 的 Place() 同构: 逐行左到右, 行高 = 该行最高) ----
    pad = a.padding
    placed = []          # (cp, x, y, w, h, xo, yo, adv)
    curX, curY, rowH = pad, pad, 0
    overflow = 0
    for cp, w, h, xo, yo, adv, buf, pitch in glyphs:
        cw = max(w, 1)
        chh = max(h, 1)
        if curX + cw + pad > W:
            curX = pad
            curY += rowH + pad
            rowH = 0
        if curY + chh + pad > W:
            overflow += 1
            continue
        placed.append((cp, curX, curY, w, h, xo, yo, adv, buf, pitch))
        curX += cw + pad
        if chh > rowH:
            rowH = chh
    used_h = curY + rowH + pad
    print(f"摆放: {len(placed)}/{len(glyphs)}  占用高度 {used_h}/{W} "
          f"({used_h / W * 100:.1f}%)  溢出 {overflow}")
    if overflow:
        sys.exit(f"!! 图集装不下, 溢出 {overflow} 个字形。请增大 --atlas 或减小 --size")

    # ---- 合成 Alpha8 缓冲 (自下而上) ----
    data = bytearray(W * W)
    for cp, x, y, w, h, xo, yo, adv, buf, pitch in placed:
        if w == 0 or h == 0:
            continue
        for i in range(h):
            src = buf[i * pitch: i * pitch + w]
            if not any(src):
                continue
            raw_row = W - 1 - (y + i)          # 显示行 -> 裸数据行 (翻转)
            off = raw_row * W + x
            data[off:off + w] = src

    # ---- 写出 ----
    os.makedirs(a.out, exist_ok=True)
    a8_path = os.path.join(a.out, "atlas.a8")
    with open(a8_path, "wb") as f:
        f.write(data)
    print(f"已写 {a8_path}  ({len(data):,} bytes)")

    name, fi = build_faceinfo(a.faceinfo, a.size, pad, W, len(placed), face)
    # 记录块
    rec = bytearray()
    for cp, x, y, w, h, xo, yo, adv, buf, pitch in placed:
        rec += struct.pack("<IHHHHiiif", cp, x, y, w, h, xo, yo, adv, 1.0)
    hdr = bytearray()
    hdr += MAGIC
    hdr += struct.pack("<IIIII", VERSION, W, W, len(placed), len(rec))
    for k in ("pointSize", "scale", "ascender", "descender", "lineHeight", "capHeight",
              "baseline", "centerLine", "superscriptOffset", "subscriptOffset", "subSize",
              "underline", "underlineThickness", "strikethrough", "strikethroughThickness",
              "tabWidth", "padding", "atlasWidth", "atlasHeight"):
        hdr += struct.pack("<f", float(fi[k]))
    hdr += struct.pack("<I", crc32(bytes(rec)))
    bin_path = os.path.join(a.out, "atlas.bin")
    with open(bin_path, "wb") as f:
        f.write(hdr)
        f.write(rec)
    print(f"已写 {bin_path}  (头 {len(hdr)} + 记录 {len(rec)} = {len(hdr) + len(rec):,} bytes)")

    # ---- 自检 ----
    cjk = [p for p in placed if 0x4E00 <= p[0] <= 0x9FFF]
    cjk_adv = sorted(set(p[7] for p in cjk))
    print(f"自检: 汉字 {len(cjk)} 个, xAdvance 取值 {cjk_adv[:6]}{'...' if len(cjk_adv) > 6 else ''}"
          f"  (应主要为 {a.size})")
    bad = [p for p in placed if p[1] + p[3] > W or p[2] + p[4] > W]   # p=(cp,x,y,w,h,...)
    print(f"自检: 越界字形 {len(bad)}")

    rep = {
        "charset": len(chars), "placed": len(placed), "no_ink": len(no_ink),
        "no_ink_chars": "".join(no_ink), "overflow": overflow,
        "atlas": W, "size": a.size, "padding": pad, "faceinfo": a.faceinfo,
        "faceinfo_name": name, "used_height": used_h,
        "used_ratio": round(used_h / W, 4),
        "cjk_advance_values": cjk_adv,
        "atlas_a8_sha256": __import__("hashlib").sha256(bytes(data)).hexdigest().upper(),
        "atlas_bin_sha256": __import__("hashlib").sha256(hdr + rec).hexdigest().upper(),
        "faceinfo_values": {k: fi[k] for k in sorted(fi)},
    }
    with open(os.path.join(a.out, "report.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(rep, f, ensure_ascii=False, indent=2)
    print("atlas.a8 SHA256:", rep["atlas_a8_sha256"])

    # ---- 预览 (仅供人工核对; 不参与运行时) ----
    if a.preview or a.preview_text:
        img = Image.frombytes("L", (W, W), bytes(data)).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        if a.preview:
            small = img.resize((2048, 2048), Image.Resampling.LANCZOS)
            small.save(os.path.join(a.out, "preview-atlas.png"))
            print("已写 preview-atlas.png (自顶向下, 缩放到 2048)")
        if a.preview_text:
            layout = simulate_tmp(placed, a.preview_text, a.size, img)
            layout.save(os.path.join(a.out, "preview-text.png"))
            print("已写 preview-text.png")


def simulate_tmp(placed, text, point_size, atlas_img):
    """按 TMP 1.2 的排版方式把文本画出来, 用于离线核对度量。

    scale = fontSize / PointSize
    字形水平: 四边形左沿 = penX + xOffset*scale, 右沿 = + width*scale
    字形垂直: 基线以上 yOffset*scale 为顶, (yOffset-height)*scale 为底
    """
    from PIL import Image
    by_cp = {p[0]: p for p in placed}
    sizes = [point_size, point_size // 2, 16, 12]
    lines = text.split("\n")
    scale_factor = 2
    W = 1400
    imgs = []
    for fs in sizes:
        scale = fs / point_size
        line_h = int(point_size * 1.45 * scale) + 6
        canvas = Image.new("L", (W, line_h * len(lines) + 8), 0)
        for li, line in enumerate(lines):
            penX = 4.0
            baseY = 4 + li * line_h + int(fs * 1.15)
            for ch in line:
                p = by_cp.get(ord(ch))
                if p is None:
                    penX += fs * 0.5
                    continue
                _, x, y, w, h, xo, yo, adv, _, _ = p
                if w and h:
                    gl = atlas_img.crop((x, y, x + w, y + h))
                    tw, th = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
                    gl = gl.resize((tw, th), Image.Resampling.LANCZOS)
                    dx = int(round(penX + xo * scale))
                    dy = int(round(baseY - (yo + h) * scale))
                    canvas.paste(gl, (dx, dy), gl)
                penX += adv * scale
        canvas = canvas.resize((W * scale_factor, canvas.height * scale_factor), Image.Resampling.NEAREST)
        imgs.append((fs, canvas))
    total_h = sum(im.height + 24 for _, im in imgs)
    out = Image.new("L", (imgs[0][1].width, total_h), 0)
    yy = 0
    for fs, im in imgs:
        out.paste(im, (0, yy))
        yy += im.height + 24
    return out


if __name__ == "__main__":
    main()
