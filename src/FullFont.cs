// 运行期自建"全字库" TMP 字体资产 (v2)
// 思路: 从系统 CJK 字体取字形 -> 拷进自建图集 -> 构造 Bitmap 模式的 TMP_FontAsset
// 关键教训:
//   1) CharacterInfo 的 uv 是"自上而下"的 (uvTopLeft.y < uvBottomRight.y)
//   2) 系统动态字体的图集初始很小(256x256), 字号太大就装不下 -> 必须自适应字号 + 小批量
//   3) 覆盖不全就绝不启用(缺字会显示成方块, 比现在更差)
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using TMPro;
using UnityEngine;

namespace BTHanHua
{
    public static class FullFont
    {
        const int Atlas = 4096;
        static readonly int[] Sizes = new int[] { 30, 26, 22, 18, 14 };
        static readonly string[] Candidates = new string[] {
            "Microsoft YaHei", "微软雅黑", "Microsoft YaHei UI", "SimHei", "黑体", "SimSun", "宋体",
            "Microsoft JhengHei", "Microsoft JhengHei UI", "Malgun Gothic", "Yu Gothic UI", "Yu Gothic",
            "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", "Arial Unicode MS"
        };
        const double MinCoverage = 0.995;

        public static TMP_FontAsset Build(string csvPath, Action<string> log)
        {
            try { return BuildInternal(csvPath, log); }
            catch (Exception ex) { log("FullFont 异常: " + ex); return null; }
        }

        static TMP_FontAsset BuildInternal(string csvPath, Action<string> log)
        {
            // 1) 需要哪些字符 (按出现频率排序: 万一图集装不下, 缺的是最生僻的字)
            Dictionary<int, int> freq = new Dictionary<int, int>();
            for (int c = 32; c < 127; c++) freq[c] = 1000;
            if (File.Exists(csvPath))
            {
                foreach (string line in File.ReadAllLines(csvPath, Encoding.UTF8))
                {
                    int i = line.IndexOf(',');
                    if (i <= 0) continue;
                    string v = line.Substring(i + 1);
                    for (int k = 0; k < v.Length; k++)
                    {
                        int c = v[k];
                        if (freq.ContainsKey(c)) freq[c] = freq[c] + 1; else freq[c] = 1;
                    }
                }
            }
            else log("FullFont: 警告 找不到 " + csvPath);
            List<int> ordered = new List<int>(freq.Keys);
            ordered.Sort(delegate(int a, int b) { int r = freq[b].CompareTo(freq[a]); return r != 0 ? r : a.CompareTo(b); });
            int needCjk = 0;
            for (int i = 0; i < ordered.Count; i++) if (IsCjk((char)ordered[i])) needCjk++;
            log("FullFont: 需要字符 " + ordered.Count + " 个 (其中汉字 " + needCjk + ")");

            // 2) 找一个能显示中文的系统字体名
            string osName = null;
            for (int i = 0; i < Candidates.Length; i++)
            {
                try
                {
                    Font f = Font.CreateDynamicFontFromOSFont(Candidates[i], 32);
                    if (f == null) continue;
                    if (f.HasCharacter('机') && f.HasCharacter('谢')) { osName = Candidates[i]; break; }
                }
                catch { }
            }
            if (osName == null) { log("FullFont: 没找到可用的中文字体, 放弃"); return null; }
            log("FullFont: 系统字体 '" + osName + "'");

            // 3) 自适应字号: 从大到小试, 直到覆盖率达标
            for (int s = 0; s < Sizes.Length; s++)
            {
                int size = Sizes[s];
                double cov; int got, maxTex;
                TMP_FontAsset fa = TryBuild(osName, size, ordered, needCjk, log, out cov, out got, out maxTex);
                log("FullFont: 字号 " + size + " -> 字形 " + got + "/" + ordered.Count + " 覆盖 " + (cov * 100).ToString("0.0") + "% (源图集最大 " + maxTex + "px)");
                if (fa != null && cov >= MinCoverage)
                {
                    log("FullFont: 采用字号 " + size);
                    return fa;
                }
                if (fa != null) { try { UnityEngine.Object.Destroy(fa.atlas); UnityEngine.Object.Destroy(fa.material); } catch { } }
            }
            log("FullFont: 所有字号都达不到 " + (MinCoverage * 100) + "% 覆盖, 放弃自建 (保持现有方案)");
            return null;
        }

        static TMP_FontAsset TryBuild(string osName, int size, List<int> ordered, int needCjk, Action<string> log, out double coverage, out int got, out int maxTex)
        {
            coverage = 0; got = 0; maxTex = 0;
            Font f = null;
            try { f = Font.CreateDynamicFontFromOSFont(osName, size); } catch { }
            if (f == null) return null;

            Texture2D myAtlas = new Texture2D(Atlas, Atlas, TextureFormat.RGBA32, false);
            Color32[] dst = new Color32[Atlas * Atlas];
            for (int i = 0; i < dst.Length; i++) dst[i] = new Color32(255, 255, 255, 0);
            List<TMP_Glyph> glyphs = new List<TMP_Glyph>();
            HashSet<int> done = new HashSet<int>();
            int curX = 1, curY = 1, rowH = 0, badUv = 0, overflow = 0, cjkGot = 0;

            for (int pass = 0; pass < 3; pass++)
            {
                int batch = (pass == 0) ? 12 : (pass == 1 ? 4 : 1);
                List<int> todo = new List<int>();
                for (int i = 0; i < ordered.Count; i++) if (!done.Contains(ordered[i])) todo.Add(ordered[i]);
                if (todo.Count == 0) break;
                for (int start = 0; start < todo.Count; start += batch)
                {
                    int n = Math.Min(batch, todo.Count - start);
                    StringBuilder sb = new StringBuilder(n);
                    for (int i = 0; i < n; i++) sb.Append((char)todo[start + i]);
                    try { f.RequestCharactersInTexture(sb.ToString(), size, FontStyle.Normal); } catch { continue; }
                    Texture2D src = null;
                    try { src = (f.material != null) ? f.material.mainTexture as Texture2D : null; } catch { }
                    if (src == null) return null;
                    if (src.width > maxTex) maxTex = src.width;
                    Color32[] srcPx = ReadPixels(src, log);
                    if (srcPx == null) return null;
                    for (int i = 0; i < n; i++)
                    {
                        int ch = todo[start + i];
                        if (done.Contains(ch)) continue;
                        bool ok = Place(f, size, ch, srcPx, src.width, src.height, dst, ref curX, ref curY, ref rowH, glyphs, out overflow);
                        if (ok) { done.Add(ch); if (IsCjk((char)ch)) cjkGot++; } else badUv++;
                    }
                }
            }
            got = done.Count;
            coverage = (needCjk > 0) ? ((double)cjkGot / needCjk) : ((double)got / ordered.Count);
            if (coverage < MinCoverage) { log("FullFont: 字号 " + size + " 汉字覆盖 " + cjkGot + "/" + needCjk + " (UV异常 " + badUv + ", 溢出 " + overflow + ")"); return null; }

            myAtlas.SetPixels32(dst);
            myAtlas.Apply(false, false);

            FaceInfo fi = new FaceInfo();
            fi.Name = osName; fi.PointSize = size; fi.Scale = 1f;
            int asc = size, desc = 0, cap = size;
            CharacterInfo t = default(CharacterInfo);
            try { if (f.GetCharacterInfo('H', out t, size, FontStyle.Normal)) { asc = t.maxY; cap = t.maxY; } } catch { }
            try { if (f.GetCharacterInfo('g', out t, size, FontStyle.Normal)) desc = t.minY; } catch { }
            fi.Ascender = asc; fi.Descender = desc; fi.CapHeight = cap;
            fi.LineHeight = (asc - desc) * 1.16f;
            fi.Baseline = 0f; fi.CenterLine = (asc + desc) * 0.5f;
            fi.SuperscriptOffset = asc * 0.5f; fi.SubscriptOffset = -asc * 0.2f; fi.SubSize = 0.5f;
            fi.Underline = desc * 0.5f; fi.UnderlineThickness = 1f;
            fi.strikethrough = asc * 0.25f; fi.strikethroughThickness = 1f;
            fi.TabWidth = size * 4f; fi.Padding = 0f;
            fi.AtlasWidth = Atlas; fi.AtlasHeight = Atlas; fi.CharacterCount = glyphs.Count;

            Shader sh = null;
            string[] shNames = new string[] { "TextMeshPro/Bitmap", "TextMeshPro/Mobile/Bitmap" };
            for (int i = 0; i < shNames.Length; i++) { try { sh = Shader.Find(shNames[i]); } catch { sh = null; } if (sh != null) { log("FullFont: 着色器 " + shNames[i]); break; } }
            if (sh == null) { log("FullFont: 找不到 Bitmap 着色器, 放弃"); return null; }
            Material mat = new Material(sh);
            mat.mainTexture = myAtlas;
            try { mat.SetTexture("_MainTex", myAtlas); } catch { }

            TMP_FontAsset fa = ScriptableObject.CreateInstance<TMP_FontAsset>();
            fa.AddFaceInfo(fi);
            fa.AddGlyphInfo(glyphs.ToArray());
            fa.atlas = myAtlas;
            fa.material = mat;
            try { fa.name = "BTHanHuaFull"; } catch { }
            try { fa.ReadFontDefinition(); }
            catch (Exception ex) { log("FullFont: ReadFontDefinition 警告: " + ex.Message); }
            int dict = (fa.characterDictionary != null) ? fa.characterDictionary.Count : -1;
            log("FullFont: 构建完成 字号=" + size + " glyphs=" + glyphs.Count + " dict=" + dict + " 占用到 y=" + curY + " atlas=" + Atlas);
            if (dict <= 0) return null;
            return fa;
        }

        // 取一个字形: 度量 + 图集摆放 + 拷像素
        static bool Place(Font f, int size, int ch, Color32[] srcPx, int srcW, int srcH,
            Color32[] dst, ref int curX, ref int curY, ref int rowH, List<TMP_Glyph> glyphs, out int overflow)
        {
            overflow = 0;
            CharacterInfo ci = default(CharacterInfo);
            bool has = false;
            try { has = f.GetCharacterInfo((char)ch, out ci, size, FontStyle.Normal); } catch { has = false; }
            if (!has) { try { has = f.GetCharacterInfo((char)ch, out ci, size); } catch { has = false; } }
            if (!has) return false;

            int gw = 0, gh = 0, ox = 0, oy = 0;
            if (ci.glyphWidth > 0 && ci.glyphHeight > 0) { gw = ci.glyphWidth; gh = ci.glyphHeight; ox = ci.bearing; oy = ci.minY; }
            else if (ci.vert.width > 0.5f && ci.vert.height > 0.5f) { gw = Mathf.RoundToInt(ci.vert.width); gh = Mathf.RoundToInt(ci.vert.height); ox = Mathf.RoundToInt(ci.vert.x); oy = Mathf.RoundToInt(ci.vert.y); }
            else { gw = ci.maxX - ci.minX; gh = ci.maxY - ci.minY; ox = ci.minX; oy = ci.minY; }
            if (gw <= 0 || gh <= 0 || gw > 300 || gh > 300) return false;

            // uv (自上而下)
            int ux = Mathf.RoundToInt(ci.uvTopLeft.x * srcW);
            int uyTop = Mathf.RoundToInt(ci.uvTopLeft.y * srcH);
            int uw = Mathf.RoundToInt((ci.uvBottomRight.x - ci.uvTopLeft.x) * srcW);
            int uh = Mathf.RoundToInt((ci.uvBottomRight.y - ci.uvTopLeft.y) * srcH);
            if (uw <= 0 || uh <= 0) return false;      // 图集里没有这个字形 (装不下)

            if (curX + gw + 1 > Atlas) { curX = 1; curY += rowH + 1; rowH = 0; }
            if (curY + gh + 1 > Atlas) { overflow = 1; return false; }

            for (int r = 0; r < gh; r++)
            {
                int srowTop = uyTop + (r * uh / gh);
                int sy = srcH - 1 - srowTop;
                if (sy < 0 || sy >= srcH) continue;
                int dy = Atlas - 1 - (curY + r);
                if (dy < 0 || dy >= Atlas) continue;
                for (int c2 = 0; c2 < gw; c2++)
                {
                    int sc = ux + (c2 * uw / gw);
                    if (sc < 0 || sc >= srcW) continue;
                    int si = sy * srcW + sc;
                    int di = dy * Atlas + (curX + c2);
                    if (si < 0 || si >= srcPx.Length || di < 0 || di >= dst.Length) continue;
                    byte a = srcPx[si].a;
                    if (a == 0) { byte a2 = srcPx[si].r; if (a2 > a) a = a2; }
                    if (a > dst[di].a) dst[di] = new Color32(255, 255, 255, a);
                }
            }

            TMP_Glyph g = new TMP_Glyph();
            g.id = ch;
            g.x = curX; g.y = curY; g.width = gw; g.height = gh;
            g.xOffset = ox; g.yOffset = oy; g.xAdvance = ci.advance; g.scale = 1f;
            glyphs.Add(g);
            curX += gw + 1;
            if (gh > rowH) rowH = gh;
            return true;
        }

        static bool IsCjk(char c)
        {
            return (c >= 0x2E80 && c <= 0x9FFF) || (c >= 0xF900 && c <= 0xFAFF)
                || (c >= 0xFE30 && c <= 0xFE4F) || (c >= 0xFF00 && c <= 0xFFEF);
        }

        static Color32[] ReadPixels(Texture2D t, Action<string> log)
        {
            try { return t.GetPixels32(); }
            catch { }
            try
            {
                RenderTexture rt = RenderTexture.GetTemporary(t.width, t.height, 0, RenderTextureFormat.ARGB32);
                Graphics.Blit(t, rt);
                RenderTexture prev = RenderTexture.active;
                RenderTexture.active = rt;
                Texture2D tmp = new Texture2D(t.width, t.height, TextureFormat.RGBA32, false);
                tmp.ReadPixels(new Rect(0, 0, t.width, t.height), 0, 0);
                tmp.Apply();
                RenderTexture.active = prev;
                RenderTexture.ReleaseTemporary(rt);
                Color32[] px = tmp.GetPixels32();
                UnityEngine.Object.Destroy(tmp);
                log("FullFont: 源图集不可直接读, 已用 Blit+ReadPixels (" + t.width + "x" + t.height + ")");
                return px;
            }
            catch (Exception ex) { log("FullFont: 读源图集失败: " + ex.Message); return null; }
        }
    }
}
