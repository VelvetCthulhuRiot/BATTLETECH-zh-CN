#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""离线自检: 校验 atlas.a8 / atlas.bin 与字体本身的栅格化结果是否一致。

做三件事:
 1. 逐字取图集里的墨迹框, 与 freetype 直接栅格化的结果做像素比对
 2. 用"图集 + 记录里的度量"排一段文本, 再用 PIL 直接排同一段文本, 上下叠放对比
 3. 校验 atlas.bin 的 CRC 与 FaceInfo 合理性
任何一项异常都会明确报出来 —— 目的是在进游戏之前把度量错误挡掉。
"""
import argparse, hashlib, os, struct, sys, zlib

MAGIC = b"BTHA"
FIELDS = ("pointSize", "scale", "ascender", "descender", "lineHeight", "capHeight",
          "baseline", "centerLine", "superscriptOffset", "subscriptOffset", "subSize",
          "underline", "underlineThickness", "strikethrough", "strikethroughThickness",
          "tabWidth", "padding", "atlasWidth", "atlasHeight")


def load(out_dir):
    hdr = open(os.path.join(out_dir, "atlas.bin"), "rb").read()
    if hdr[:4] != MAGIC:
        sys.exit("atlas.bin 魔数不对")
    ver, W, H, n, reclen = struct.unpack_from("<IIIII", hdr, 4)
    off = 24
    fi = {}
    for k in FIELDS:
        fi[k] = struct.unpack_from("<f", hdr, off)[0]
        off += 4
    crc = struct.unpack_from("<I", hdr, off)[0]
    off += 4
    rec_raw = hdr[off:off + reclen]
    glyphs = {}
    for i in range(n):
        cp, x, y, w, h, xo, yo, adv, sc = struct.unpack_from("<IHHHHiiif", rec_raw, i * 28)
        glyphs[cp] = dict(x=x, y=y, w=w, h=h, xo=xo, yo=yo, adv=adv, scale=sc)
    a8 = open(os.path.join(out_dir, "atlas.a8"), "rb").read()
    return dict(ver=ver, W=W, H=H, n=n, fi=fi, crc=crc, rec_raw=rec_raw, glyphs=glyphs, a8=a8)


def main():
    ap = argparse.ArgumentParser()
    here = os.path.dirname(os.path.abspath(__file__))
    ap.add_argument("--out", default=os.path.join(here, "out"))
    ap.add_argument("--font", default=os.path.join(here, "font", "NotoSansSC-Regular.otf"))
    ap.add_argument("--text", default="我们的机甲在战场上战斗，指挥官下达了命令。\nABC abc 123 装甲部队 Deployment")
    ap.add_argument("--sample", type=int, default=400, help="像素比对抽样的字数")
    a = ap.parse_args()

    import freetype
    from PIL import Image

    A = load(a.out)
    W, fi, G = A["W"], A["fi"], A["glyphs"]
    print(f"atlas.bin: v{A['ver']}  {W}x{A['H']}  {A['n']} 字形  记录 {len(A['rec_raw'])} bytes")
    print(f"atlas.a8 : {len(A['a8']):,} bytes  (期望 {W*W:,})  {'OK' if len(A['a8'])==W*W else '!! 尺寸不符'}")
    rc = zlib.crc32(A["rec_raw"]) & 0xFFFFFFFF
    print(f"记录 CRC32: 文件={A['crc']:08X} 实算={rc:08X}  {'OK' if rc==A['crc'] else '!! 不匹配'}")
    print()
    print("FaceInfo:")
    for k in FIELDS:
        print(f"  {k:<24} {fi[k]:>12.4f}")
    print()
    # 合理性
    probs = []
    if abs(fi["pointSize"] - 75) > 0.01: probs.append(f"PointSize={fi['pointSize']} 不是 75")
    if fi["atlasWidth"] != W: probs.append("AtlasWidth 与文件不符")
    if fi["ascender"] <= 0: probs.append("Ascender <= 0")
    if fi["descender"] >= 0: probs.append("Descender >= 0")
    if abs(fi["lineHeight"] - (fi["ascender"] - fi["descender"])) > 0.01 and fi["lineHeight"] != 0:
        probs.append(f"LineHeight({fi['lineHeight']}) != Ascender-Descender({fi['ascender']-fi['descender']})")
    print("合理性: " + ("; ".join(probs) if probs else "OK"))

    # ---- 逐字像素比对 ----
    # 图集裸数据自下而上 -> 转成自顶向下便于与 freetype 对照
    img = Image.frombytes("L", (W, W), A["a8"]).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    face = freetype.Face(a.font)
    size = int(round(fi["pointSize"]))
    face.set_pixel_sizes(0, size)

    cps = sorted(G)[:a.sample]
    same = 0
    diff_hist = {}
    worst = []
    for cp in cps:
        g = G[cp]
        if g["w"] == 0 or g["h"] == 0:
            continue
        face.load_char(chr(cp), freetype.FT_LOAD_RENDER | freetype.FT_LOAD_TARGET_NORMAL)
        s = face.glyph
        ref = Image.frombytes("L", (s.bitmap.width, s.bitmap.rows), bytes(s.bitmap.buffer)
                              if s.bitmap.pitch == s.bitmap.width else
                              b"".join(bytes(s.bitmap.buffer)[i * s.bitmap.pitch: i * s.bitmap.pitch + s.bitmap.width]
                                       for i in range(s.bitmap.rows)))
        got = img.crop((g["x"], g["y"], g["x"] + g["w"], g["y"] + g["h"]))
        if ref.size == got.size and ref.tobytes() == got.tobytes():
            same += 1
        else:
            # 允许 ±1 的尺寸差 (抗锯齿阈值), 记录最大像素差
            if ref.size == got.size:
                d = max(abs(p - q) for p, q in zip(ref.tobytes(), got.tobytes()))
            else:
                d = -1
            diff_hist[d] = diff_hist.get(d, 0) + 1
            if len(worst) < 8:
                worst.append((chr(cp), ref.size, got.size, d))
    print()
    print(f"像素逐字比对 (抽样 {len(cps)} 字): 完全一致 {same}, 不一致 {sum(diff_hist.values())}")
    if diff_hist:
        print(f"  差异分布 (最大像素差 -> 个数): {dict(sorted(diff_hist.items(), key=lambda kv: (kv[0] is None, kv[0])))}")
        print(f"  样例: {worst}")

    # ---- 排版对比 ----
    lines = a.text.split("\n")
    out_img = tmp_layout(G, fi, lines, img)
    pil_img = pil_layout(a.font, size, lines)
    total_w = max(out_img.width, pil_img.width)
    canvas = Image.new("L", (total_w, out_img.height + pil_img.height + 30), 0)
    canvas.paste(pil_img, (0, 0))
    canvas.paste(out_img, (0, pil_img.height + 30))
    p = os.path.join(a.out, "verify-layout.png")
    canvas.save(p)
    print(f"\n排版对比已写 {p}")
    print("  上半 = PIL 直接排版 (字体原生度量), 下半 = 我们的图集 + TMP 度量")
    print("  两者字形应完全一致, 位置允许有基线定义差异 (我们用的是 MSYH 的 FaceInfo)")


def tmp_layout(G, fi, lines, atlas):
    """用图集 + 记录里的度量排版 (与 TMP 1.2 一致)。"""
    from PIL import Image
    size = int(round(fi["pointSize"]))
    lh = int(round(fi["lineHeight"])) + 6
    Wc = max(600, max(len(l) for l in lines) * size + 20)
    from PIL import ImageDraw
    im = Image.new("L", (Wc, lh * len(lines) + 12), 0)
    for li, line in enumerate(lines):
        penX = 6.0
        baseY = 6 + li * lh + int(round(fi["ascender"]))
        for ch in line:
            g = G.get(ord(ch))
            if g is None:
                penX += size * 0.5
                continue
            if g["w"] and g["h"]:
                gl = atlas.crop((g["x"], g["y"], g["x"] + g["w"], g["y"] + g["h"]))
                im.paste(gl, (int(round(penX + g["xo"])), int(round(baseY - g["yo"] - g["h"] + g["h"]))), gl)
            penX += g["adv"]
    return im


def pil_layout(font_path, size, lines):
    from PIL import Image, ImageDraw, ImageFont
    f = ImageFont.truetype(font_path, size)
    lh = int(round(size * 1.45)) + 6
    Wc = max(600, max(len(l) for l in lines) * size + 20)
    im = Image.new("L", (Wc, lh * len(lines) + 12), 0)
    d = ImageDraw.Draw(im)
    for li, line in enumerate(lines):
        d.text((6, 6 + li * lh), line, fill=255, font=f)
    return im


if __name__ == "__main__":
    main()
