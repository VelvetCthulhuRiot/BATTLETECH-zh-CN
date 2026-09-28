// BATTLETECH 中文字形图集 - 离线图集装载器 (v1)
//
// 数据源: mod 目录下 atlas/atlas.bin (FaceInfo + 字形记录) 与 atlas/atlas.a8 (Alpha8 像素)
// 由 corpus/font-atlas/build-atlas.py 离线生成, 离线自检 8352/8352 逐字像素与 FreeType 一致。
//
// 关键约定 (全部由现役可用图集 "MSYH SDF" 反查证实, 不是猜的):
//   * 纹理格式 Alpha8 (现役 m_TextureFormat=1), 无 mipmap, 双线性
//   * .a8 的裸字节第 0 行 = 图像底行 (Unity 惯例; UnityPy 的 Alpha8->PIL 带 FLIP_TOP_BOTTOM)
//   * 字形记录的 y 自图集顶部往下算
//   * width/height = 纯墨迹框; xOffset = bitmap_left; yOffset = bitmap_top (基线上方为正)
//   * FaceInfo 采用现役 MSYH 的垂直度量, 使行高/基线/缩进与现在完全一致 -> 零排版回归
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Text;
using TMPro;
using UnityEngine;

namespace BTHanHua
{
    public static class AtlasFont
    {
        const double MinCoverage = 0.995;
        const int MaxMissingReport = 40;
        const int RecSize = 28;   // id u32, x/y/w/h u16, xOffset/yOffset/xAdvance i32, scale f32

        // 必须与 build-atlas.py 的写出顺序一致
        static readonly string[] FaceFields = new string[] {
            "pointSize", "scale", "ascender", "descender", "lineHeight", "capHeight",
            "baseline", "centerLine", "superscriptOffset", "subscriptOffset", "subSize",
            "underline", "underlineThickness", "strikethrough", "strikethroughThickness",
            "tabWidth", "padding", "atlasWidth", "atlasHeight"
        };

        // 从现役资产继承的"样式"字段 (只影响加粗/斜体/字距, 不影响字形)
        static readonly string[] StyleFields = new string[] {
            "normalStyle", "normalSpacingOffset", "boldStyle", "boldSpacing",
            "italicStyle", "tabSize", "fontAssetType", "fontWeights", "m_CreationSettings"
        };

        public static TMP_FontAsset Build(string atlasDir, string csvPath,
            TMP_FontAsset template, bool force, Action<string> log)
        {
            try { return BuildInternal(atlasDir, csvPath, template, force, log); }
            catch (Exception ex) { log("AtlasFont 异常: " + ex); return null; }
        }

        static TMP_FontAsset BuildInternal(string atlasDir, string csvPath,
            TMP_FontAsset template, bool force, Action<string> log)
        {
            int t0 = Environment.TickCount;
            string binPath = Path.Combine(atlasDir, "atlas.bin");
            string a8Path = Path.Combine(atlasDir, "atlas.a8");
            if (!File.Exists(binPath)) { log("AtlasFont: 找不到 " + binPath); return null; }
            if (!File.Exists(a8Path)) { log("AtlasFont: 找不到 " + a8Path); return null; }

            // ---------- 1) 解析 atlas.bin ----------
            byte[] bin = File.ReadAllBytes(binPath);
            if (bin.Length < 28 || bin[0] != (byte)'B' || bin[1] != (byte)'T'
                || bin[2] != (byte)'H' || bin[3] != (byte)'A')
            { log("AtlasFont: atlas.bin 魔数不对"); return null; }

            int p = 4;
            int version = (int)BitConverter.ToUInt32(bin, p); p += 4;
            int atlasW = (int)BitConverter.ToUInt32(bin, p); p += 4;
            int atlasH = (int)BitConverter.ToUInt32(bin, p); p += 4;
            int glyphCount = (int)BitConverter.ToUInt32(bin, p); p += 4;
            int recLen = (int)BitConverter.ToUInt32(bin, p); p += 4;
            if (version != 1) { log("AtlasFont: atlas.bin 版本 " + version + " 不支持"); return null; }
            if (glyphCount <= 0 || recLen != glyphCount * RecSize)
            { log("AtlasFont: 记录长度不符 glyphCount=" + glyphCount + " recLen=" + recLen); return null; }
            if (atlasW <= 0 || atlasH <= 0 || atlasW > 16384 || atlasH > 16384)
            { log("AtlasFont: 图集尺寸异常 " + atlasW + "x" + atlasH); return null; }
            if (bin.Length < p + FaceFields.Length * 4 + 4 + recLen)
            { log("AtlasFont: atlas.bin 被截断 (" + bin.Length + " 字节)"); return null; }

            float[] fv = new float[FaceFields.Length];
            for (int i = 0; i < fv.Length; i++) { fv[i] = BitConverter.ToSingle(bin, p); p += 4; }
            uint crcStored = BitConverter.ToUInt32(bin, p); p += 4;
            uint crcCalc = Crc32(bin, p, recLen);
            if (crcStored != crcCalc)
            { log("AtlasFont: 记录 CRC 不匹配 (文件 " + crcStored.ToString("X8") + " / 实算 " + crcCalc.ToString("X8") + ")"); return null; }
            log("AtlasFont: atlas.bin v" + version + " " + atlasW + "x" + atlasH
                + " 字形 " + glyphCount + " CRC OK");

            TMP_Glyph[] glyphs = new TMP_Glyph[glyphCount];
            int[] ids = new int[glyphCount];
            HashSet<int> idSet = new HashSet<int>();
            for (int i = 0; i < glyphCount; i++)
            {
                int o = p + i * RecSize;
                TMP_Glyph g = new TMP_Glyph();
                g.id = (int)BitConverter.ToUInt32(bin, o);
                g.x = BitConverter.ToUInt16(bin, o + 4);
                g.y = BitConverter.ToUInt16(bin, o + 6);
                g.width = BitConverter.ToUInt16(bin, o + 8);
                g.height = BitConverter.ToUInt16(bin, o + 10);
                g.xOffset = BitConverter.ToInt32(bin, o + 12);
                g.yOffset = BitConverter.ToInt32(bin, o + 16);
                g.xAdvance = BitConverter.ToInt32(bin, o + 20);
                g.scale = BitConverter.ToSingle(bin, o + 24);
                glyphs[i] = g;
                ids[i] = g.id;
                idSet.Add(g.id);
            }

            // ---------- 2) 覆盖检查 (先查, 不合格就别浪费显存) ----------
            int need, got;
            List<char> missing;
            Coverage(csvPath, idSet, out need, out got, out missing);
            double cov = (need > 0) ? ((double)got / need) : 1.0;
            log("AtlasFont: 语料非 ASCII 字符覆盖 " + got + "/" + need
                + " = " + (cov * 100.0).ToString("0.00") + "%");
            if (missing.Count > 0)
            {
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < missing.Count && i < MaxMissingReport; i++)
                    sb.Append(missing[i]).Append("(U+").Append(((int)missing[i]).ToString("X4")).Append(") ");
                log("AtlasFont: 缺 " + missing.Count + " 种: " + sb.ToString().Trim());
            }
            if (cov < MinCoverage && !force)
            {
                log("AtlasFont: 覆盖率低于 " + (MinCoverage * 100.0).ToString("0.0") + "%, 放弃 (继续用 MSYH SDF)");
                return null;
            }
            if (cov < MinCoverage) log("AtlasFont: 警告! ATLAS_FORCE 强制启用, 覆盖率仅 "
                + (cov * 100.0).ToString("0.00") + "% (缺字会显示成方块)");

            // ---------- 3) 像素 ----------
            byte[] a8 = File.ReadAllBytes(a8Path);
            long expect = (long)atlasW * atlasH;
            if (a8.Length != expect)
            { log("AtlasFont: atlas.a8 大小 " + a8.Length + " 应为 " + expect); return null; }

            Texture2D tex;
            try
            {
                tex = new Texture2D(atlasW, atlasH, TextureFormat.Alpha8, false);
                tex.name = "BTHanHua Atlas";
                tex.LoadRawTextureData(a8);
                tex.Apply(false, false);
                tex.filterMode = FilterMode.Bilinear;
                tex.wrapMode = TextureWrapMode.Clamp;
            }
            catch (Exception ex)
            { log("AtlasFont: 建纹理失败 (显卡可能不支持 " + atlasW + "px): " + ex.Message); return null; }
            log("AtlasFont: 纹理 " + tex.width + "x" + tex.height + " " + tex.format
                + " 约 " + (expect / 1048576L) + " MB");

            // ---------- 4) FaceInfo ----------
            FaceInfo fi = new FaceInfo();
            fi.Name = "Noto Sans SC";
            fi.PointSize = fv[0]; fi.Scale = fv[1]; fi.Ascender = fv[2]; fi.Descender = fv[3];
            fi.LineHeight = fv[4]; fi.CapHeight = fv[5]; fi.Baseline = fv[6]; fi.CenterLine = fv[7];
            fi.SuperscriptOffset = fv[8]; fi.SubscriptOffset = fv[9]; fi.SubSize = fv[10];
            fi.Underline = fv[11]; fi.UnderlineThickness = fv[12]; fi.strikethrough = fv[13];
            fi.strikethroughThickness = fv[14]; fi.TabWidth = fv[15]; fi.Padding = fv[16];
            fi.AtlasWidth = fv[17]; fi.AtlasHeight = fv[18];
            fi.CharacterCount = glyphCount;

            // ---------- 5) 材质 ----------
            // 自建, 不克隆任何现成资产 —— 这样发行包里不需要再带那个微软雅黑的 bundle。
            // 下面的属性值是逐项 dump 现役材质 (MSYH SDF Material) 得到的, 照抄, 不依赖 shader 默认值:
            //   floats: _ColorMask=15 _Stencil=0 _StencilComp=8 _StencilOp=0
            //           _StencilReadMask=255 _StencilWriteMask=255
            //           _MaskSoftnessX/Y=0 _VertexOffsetX/Y=0
            //   colors: _FaceColor=白(1,1,1,1)  _ClipRect=(-32767,-32767,32767,32767)
            //   tex:    _MainTex=图集  _FaceTex=空
            Material mat;
            try
            {
                Shader sh = Shader.Find("TextMeshPro/Bitmap");
                if (sh == null) sh = Shader.Find("TextMeshPro/Mobile/Bitmap");
                if (sh == null)
                {
                    // Shader.Find 只能命中"打进构建"或当前已加载的 shader。
                    // 以前这个 shader 是从微软雅黑 bundle 里读的, 现在不带 bundle 了, 所以再扫一遍兜底。
                    try
                    {
                        UnityEngine.Object[] allSh = Resources.FindObjectsOfTypeAll(typeof(Shader));
                        for (int i = 0; i < allSh.Length; i++)
                        {
                            Shader s2 = allSh[i] as Shader;
                            if (s2 == null) continue;
                            if (s2.name == "TextMeshPro/Bitmap" || s2.name == "TextMeshPro/Mobile/Bitmap")
                            { sh = s2; LogShaderSource(log, "已加载 shader 中扫到"); break; }
                        }
                    }
                    catch { }
                }
                if (sh == null)
                {
                    log("AtlasFont: 找不到 TextMeshPro/Bitmap 着色器 —— 游戏构建里没有它, 需要随包提供一个。放弃。");
                    return null;
                }
                mat = new Material(sh);
                mat.name = "BTHanHua Atlas Material";
                SetFloatIf(mat, "_ColorMask", 15f);
                SetFloatIf(mat, "_Stencil", 0f);
                SetFloatIf(mat, "_StencilComp", 8f);
                SetFloatIf(mat, "_StencilOp", 0f);
                SetFloatIf(mat, "_StencilReadMask", 255f);
                SetFloatIf(mat, "_StencilWriteMask", 255f);
                SetFloatIf(mat, "_MaskSoftnessX", 0f);
                SetFloatIf(mat, "_MaskSoftnessY", 0f);
                SetFloatIf(mat, "_VertexOffsetX", 0f);
                SetFloatIf(mat, "_VertexOffsetY", 0f);
                SetColorIf(mat, "_FaceColor", Color.white);
                SetColorIf(mat, "_ClipRect", new Color(-32767f, -32767f, 32767f, 32767f));
                mat.mainTexture = tex;
                log("AtlasFont: 材质已自建 shader='" + sh.name + "' _FaceColor="
                    + (mat.HasProperty("_FaceColor") ? mat.GetColor("_FaceColor").ToString() : "?"));
            }
            catch (Exception ex) { log("AtlasFont: 建材质失败: " + ex.Message); return null; }

            // ---------- 6) 组装 TMP_FontAsset ----------
            TMP_FontAsset fa = ScriptableObject.CreateInstance<TMP_FontAsset>();
            fa.name = "BTHanHua Atlas";
            fa.AddFaceInfo(fi);
            fa.AddGlyphInfo(glyphs);
            fa.atlas = tex;
            fa.material = mat;

            // TMP_Asset 的 hashCode / materialHashCode 用于材质引用索引。
            // ScriptableObject.CreateInstance 出来是 0, 会和其它"默认值"资产撞车 —— 用实例 ID 保证唯一非零。
            try { fa.hashCode = tex.GetInstanceID(); fa.materialHashCode = mat.GetInstanceID(); }
            catch (Exception ex) { log("AtlasFont: 写 hashCode 失败: " + ex.Message); }

            CopyStyle(template, fa, log);

            // 诊断: AddGlyphInfo 到底填了什么
            log("AtlasFont: AddGlyphInfo 后 m_glyphInfoList=" + DescribeField(fa, "m_glyphInfoList")
                + " m_characterDictionary=" + DescribeField(fa, "m_characterDictionary"));

            // AddGlyphInfo 理应填好 m_glyphInfoList; 不同 TMP 版本行为可能不同, 没填就补上,
            // 让这个资产在 ReadFontDefinition / mod 自带的字形集导出眼里都是完整的。
            if (GetField(fa, "m_glyphInfoList") == null)
            {
                List<TMP_Glyph> gl = new List<TMP_Glyph>(glyphs);
                SetField(fa, "m_glyphInfoList", gl);
                log("AtlasFont: AddGlyphInfo 未填 m_glyphInfoList, 已手工补 " + gl.Count + " 条");
            }

            // ---- 关键: 自己填 m_characterDictionary, 不要指望 ReadFontDefinition ----
            // TMP 1.2 的 get_characterDictionary() 在 m_characterDictionary 为 null 时会调
            // ReadFontDefinition(), 而后者需要 m_kerningInfo 等字段非空, 否则抛
            // NullReferenceException。实测日志已证实:
            //   AtlasFont 异常: NullReferenceException
            //     at TMPro.TMP_FontAsset.ReadFontDefinition ()
            //     at TMPro.TMP_FontAsset.get_characterDictionary ()
            // 对策: 直接把字典按 m_glyphInfoList 的内容建好塞进去。只要它非空, getter 就会
            //       立刻返回它, 根本不会再触发 ReadFontDefinition。
            Dictionary<int, TMP_Glyph> myDict = new Dictionary<int, TMP_Glyph>(glyphCount * 2);
            for (int i = 0; i < glyphCount; i++) myDict[ids[i]] = glyphs[i];
            if (!SetField(fa, "m_characterDictionary", myDict)) { log("AtlasFont: 写 m_characterDictionary 失败"); return null; }
            SetField(fa, "m_characterSet", ids);

            // kerning: 优先借现役资产的有效空表; 没有现役资产就自己建。
            // 必须有非 null 的 m_kerningInfo —— 否则 ReadFontDefinition 会在访问
            // m_kerningInfo.kerningPairs 时抛 NullReferenceException (实测日志已证实)。
            // 这里用反射构造, 避免依赖这两个类型是否有公开无参构造函数。
            object kt = GetField(template, "m_kerningInfo");
            if (kt == null)
            {
                try { kt = Activator.CreateInstance(typeof(KerningTable)); }
                catch (Exception ex) { log("AtlasFont: 建 KerningTable 失败: " + ex.Message); }
            }
            object kp = GetField(template, "m_kerningPair");
            if (kp == null)
            {
                try { kp = Activator.CreateInstance(typeof(KerningPair)); } catch { }
            }
            SetField(fa, "m_kerningInfo", kt);
            SetField(fa, "m_kerningPair", kp);
            SetField(fa, "m_kerningDictionary", new Dictionary<int, KerningPair>());
            log("AtlasFont: 手工填充 m_characterDictionary=" + myDict.Count
                + " m_characterSet=" + ids.Length
                + " m_kerningDictionary=" + DescribeField(fa, "m_kerningDictionary")
                + " m_kerningInfo=" + DescribeField(fa, "m_kerningInfo")
                + " m_kerningPair=" + DescribeField(fa, "m_kerningPair"));

            // kerning 补齐后 ReadFontDefinition 应该能跑通了; 跑一次让它做内部收尾。
            // 不管成功与否, 随后都把我们的字典重新钉回去 —— 保证 getter 拿到的一定是非空的。
            try { fa.ReadFontDefinition(); log("AtlasFont: ReadFontDefinition 调用成功"); }
            catch (Exception ex) { log("AtlasFont: ReadFontDefinition 调用失败 (已忽略): " + ex.Message); }
            SetField(fa, "m_characterDictionary", myDict);
            SetField(fa, "m_characterSet", ids);

            Dictionary<int, TMP_Glyph> check = GetField(fa, "m_characterDictionary") as Dictionary<int, TMP_Glyph>;
            int dict = (check != null) ? check.Count : -1;
            log("AtlasFont: 最终字典 " + dict + " 条");
            if (dict <= 0) { log("AtlasFont: 字形字典为空, 放弃"); return null; }

            log("AtlasFont: 构建完成 " + (Environment.TickCount - t0) + " ms, 字形 " + dict
                + ", 抽查 HasCharacter: 机=" + Has(fa, '机') + " 眉=" + Has(fa, '眉')
                + " 鸦=" + Has(fa, '鸦') + " 鸣=" + Has(fa, '鸣') + " 渡=" + Has(fa, '渡')
                + " 鸥=" + Has(fa, '鸥') + " 龘=" + Has(fa, '龘'));
            return fa;
        }

        // ---------- 反射小工具 ----------
        static FieldInfo Field(string name)
        {
            return typeof(TMP_FontAsset).GetField(name,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        }

        static object GetField(object obj, string name)
        {
            if (obj == null) return null;
            FieldInfo f = Field(name);
            return (f != null) ? f.GetValue(obj) : null;
        }

        static bool SetField(object obj, string name, object value)
        {
            FieldInfo f = Field(name);
            if (f == null) return false;
            f.SetValue(obj, value);
            return true;
        }

        static string DescribeField(object obj, string name)
        {
            try
            {
                object v = GetField(obj, name);
                if (v == null) return "null";
                System.Collections.ICollection c = v as System.Collections.ICollection;
                if (c != null) return v.GetType().Name + "(" + c.Count + ")";
                return v.GetType().Name;
            }
            catch { return "?"; }
        }

        // 与 build-atlas.py 的 needs_glyph 同口径: 排除 Unicode 大类 C* 与 Z*。
        // 典型: U+001F 官方逗号替身、U+200B 零宽空格、U+3000 全角空格、U+00A0 不换行空格。
        // 这些字符没有字形, TMP 自己处理空白 —— 现役 MSYH 图集里同样没有它们。
        static bool NeedsGlyph(char c)
        {
            switch (char.GetUnicodeCategory(c))
            {
                case UnicodeCategory.Control:
                case UnicodeCategory.Format:
                case UnicodeCategory.Surrogate:
                case UnicodeCategory.OtherNotAssigned:
                case UnicodeCategory.PrivateUse:
                case UnicodeCategory.SpaceSeparator:
                case UnicodeCategory.LineSeparator:
                case UnicodeCategory.ParagraphSeparator:
                    return false;
                default:
                    return true;
            }
        }

        // ---------- 语料覆盖 ----------
        // 统计"需要字形"的字符: 非 ASCII, 且不是控制符/格式符/空白。
        static void Coverage(string csvPath, HashSet<int> ids, out int need, out int got, out List<char> missing)
        {
            need = 0; got = 0;
            missing = new List<char>();
            HashSet<char> seen = new HashSet<char>();
            if (string.IsNullOrEmpty(csvPath) || !File.Exists(csvPath))
                return;
            try
            {
                string[] lines = File.ReadAllLines(csvPath, Encoding.UTF8);
                for (int i = 1; i < lines.Length; i++)
                {
                    string L = lines[i];
                    int j = L.IndexOf(',');
                    if (j <= 0) continue;
                    string v = L.Substring(j + 1);
                    for (int k = 0; k < v.Length; k++)
                    {
                        char c = v[k];
                        if (c < 128) continue;
                        if (!NeedsGlyph(c)) continue;
                        if (!seen.Add(c)) continue;
                        need++;
                        if (ids.Contains(c)) got++;
                        else if (missing.Count < 200) missing.Add(c);
                    }
                }
            }
            catch { }
        }

        static string Has(TMP_FontAsset f, char c)
        {
            try { return f.HasCharacter(c, false) ? "1" : "0"; } catch { return "?"; }
        }

        // ---------- 样式字段 ----------
        // 有现役资产就从它继承; 没有(发行版不再带 bundle)就按实测值显式设定。
        // 这些值都是 dump 现役 MSYH SDF 资产得到的。
        static void CopyStyle(TMP_FontAsset src, TMP_FontAsset dst, Action<string> log)
        {
            int copied = 0;
            if (src != null)
            {
                StringBuilder detail = new StringBuilder();
                for (int i = 0; i < StyleFields.Length; i++)
                {
                    try
                    {
                        FieldInfo f = typeof(TMP_FontAsset).GetField(StyleFields[i],
                            BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                        if (f == null) continue;
                        object v = f.GetValue(src);
                        f.SetValue(dst, v);
                        copied++;
                        if (detail.Length < 150)
                            detail.Append(StyleFields[i]).Append("=")
                                  .Append(v == null ? "null" : v.ToString()).Append(" ");
                    }
                    catch (Exception ex) { log("AtlasFont: 继承 " + StyleFields[i] + " 失败: " + ex.Message); }
                }
                log("AtlasFont: 从现役资产继承样式字段 " + copied + " 个: " + detail.ToString().Trim());
                return;
            }

            log("AtlasFont: 无现役资产可继承样式, 按实测值显式设定");
            SetFieldIfMissing(dst, "normalStyle", 0f, log);
            SetFieldIfMissing(dst, "normalSpacingOffset", 0f, log);
            SetFieldIfMissing(dst, "boldStyle", 0.75f, log);
            SetFieldIfMissing(dst, "boldSpacing", 7f, log);
            SetFieldIfMissing(dst, "italicStyle", (byte)35, log);
            SetFieldIfMissing(dst, "tabSize", (byte)10, log);

            // fontAssetType: 现役资产实测值是枚举成员 Bitmap (=2)。按名字取, 取不到再退回 2。
            try
            {
                FieldInfo ft = Field("fontAssetType");
                if (ft != null)
                {
                    object val = null;
                    if (ft.FieldType.IsEnum)
                    {
                        try { val = Enum.Parse(ft.FieldType, "Bitmap", true); } catch { }
                        if (val == null)
                        {
                            Array names = Enum.GetValues(ft.FieldType);
                            if (names.Length > 2) val = names.GetValue(2);
                        }
                    }
                    if (val == null) val = Convert.ChangeType(2, ft.FieldType);
                    ft.SetValue(dst, val);
                    log("AtlasFont: fontAssetType = " + val);
                }
            }
            catch (Exception ex) { log("AtlasFont: 设 fontAssetType 失败: " + ex.Message); }

            // fontWeights: TMP 在渲染粗体/斜体时会查这张表, null 会 NRE。
            // 现役资产是长度 10、成员全为空引用的数组。这里照建 (类/结构体都兼容)。
            try
            {
                FieldInfo fw = Field("fontWeights");
                if (fw != null && fw.GetValue(dst) == null)
                {
                    Type elem = fw.FieldType.GetElementType();
                    if (elem != null)
                    {
                        Array arr = Array.CreateInstance(elem, 10);
                        if (!elem.IsValueType)
                        {
                            for (int i = 0; i < arr.Length; i++)
                            {
                                try { arr.SetValue(Activator.CreateInstance(elem), i); }
                                catch { arr.SetValue(null, i); }
                            }
                        }
                        fw.SetValue(dst, arr);
                        log("AtlasFont: fontWeights[" + arr.Length + "] 已建 (元素类型 "
                            + elem.Name + ", " + (elem.IsValueType ? "值类型" : "引用类型") + ")");
                    }
                }
            }
            catch (Exception ex) { log("AtlasFont: 建 fontWeights 失败: " + ex.Message); }
        }

        static void SetFieldIfMissing(object obj, string name, object value, Action<string> log)
        {
            try
            {
                FieldInfo f = Field(name);
                if (f == null) { log("AtlasFont: 字段 " + name + " 不存在"); return; }
                f.SetValue(obj, Convert.ChangeType(value, f.FieldType));
            }
            catch (Exception ex) { log("AtlasFont: 设 " + name + " 失败: " + ex.Message); }
        }

        static void LogShaderSource(Action<string> log, string how)
        {
            try { log("AtlasFont: 着色器来源: " + how); } catch { }
        }

        static void SetFloatIf(Material m, string name, float v)
        {
            try { if (m.HasProperty(name)) m.SetFloat(name, v); } catch { }
        }

        static void SetColorIf(Material m, string name, Color c)
        {
            try { if (m.HasProperty(name)) m.SetColor(name, c); } catch { }
        }

        // ---------- CRC32 (与 Python zlib.crc32 一致) ----------
        static uint[] s_crcTable;
        static uint Crc32(byte[] data, int offset, int count)
        {
            if (s_crcTable == null)
            {
                s_crcTable = new uint[256];
                for (uint i = 0; i < 256; i++)
                {
                    uint c = i;
                    for (int k = 0; k < 8; k++)
                        c = ((c & 1) != 0) ? (0xEDB88320u ^ (c >> 1)) : (c >> 1);
                    s_crcTable[i] = c;
                }
            }
            uint crc = 0xFFFFFFFFu;
            for (int i = 0; i < count; i++)
                crc = s_crcTable[(crc ^ data[offset + i]) & 0xFF] ^ (crc >> 8);
            return crc ^ 0xFFFFFFFFu;
        }
    }
}
