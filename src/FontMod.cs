// BATTLETECH 中文字体注入 - Game Mod (Harmony)  v0.3
// 设计:
//  1) 不修改游戏任何文件; 字体包放在 mod 目录, 运行期加载
//  2) 字体切换是双向的: 文本含 CJK -> 用中文字体; 不含 -> 还原成原字体
//     (语言下拉列表项是复用的, 单向切换会让俄语西里尔字母变成方框)
//  3) 只对"确实像中文"的文本切换: 要求 >=2 个 CJK 字符, 或(1个CJK且总长>=3)
//     避免把图标字体里用 CJK 码位画的图标误判成中文而换成"圣"之类
//  4) 自建日志文件 (游戏把 Info 级日志关了, 且 output_log.txt 不可靠)
//  5) 记录字体图集缺失的字形 (方框来源) 与漏译项
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Text;
using Harmony;
using UnityEngine;
using TMPro;

namespace BTHanHua
{
    public static class FontMod
    {
        const string TAG = "[BTHanHua] ";
        static TMP_FontAsset s_cjk;
        static TMP_FontAsset s_full;
        static bool s_busy;
        static string s_logPath;
        static readonly Dictionary<int, TMP_FontAsset> s_origFont = new Dictionary<int, TMP_FontAsset>();
        static readonly HashSet<char> s_noGlyph = new HashSet<char>();
        static readonly HashSet<string> s_miss = new HashSet<string>();
        static HashSet<string> s_csvKeys;          // CSV 全部 key, 用于运行期判定"未翻译"
        static readonly HashSet<string> s_swapped = new HashSet<string>();
        static readonly HashSet<string> s_shortSeen = new HashSet<string>();

        // 注: 曾经想在这里做"字形探针"(靠 ATLAS_TEST 把几个界面 key 换成含缺字的串),
        // 但实测不生效 —— 主菜单按钮走的是游戏自己的 Localize.* 系统
        // (dump 里有 Localize.FontLocTable / Localize.Text / Localize.FontLocalizationManager),
        // 不经过 BattleTech.Localization.LocalizeKey 这个 hook。
        // 需要做视觉 A/B 时, 直接改部署的 strings_zh-CN.csv 里对应的 key 即可 (那才是真实数据通路)。

        // ---------- 自建日志 ----------
        static void Log(string msg)
        {
            try { Debug.LogError(TAG + msg); } catch { }
            try
            {
                if (s_logPath == null) return;
                File.AppendAllText(s_logPath, DateTime.Now.ToString("HH:mm:ss") + " " + msg + "\r\n", Encoding.UTF8);
            }
            catch { }
        }

        public static void Init()
        {
            try
            {
                // 日志路径必须独立于字体包 —— 发行版已经不带微软雅黑 bundle 了,
                // 若仍从 bundle 路径推导, 没有 bundle 时就会一个字都不记。
                string modDir = FindModDir();
                s_logPath = (modDir != null) ? Path.Combine(modDir, "BTHanHuaFont.log") : null;
                if (s_logPath != null) { try { File.WriteAllText(s_logPath, "=== BTHanHua FontMod v0.8 ===\r\n", Encoding.UTF8); } catch { } }

                string path = FindBundle(modDir);
                Log("Init 开始; modDir=" + (modDir ?? "<未找到>") + " bundle=" + (path ?? "<未找到>"));

                // 字体包是可选的: 它现在只用作"材质/样式模板 + 回退"。
                // 发行版不再带它 (那是微软雅黑的衍生图集, 授权不明确; 而且 16 MB 压不动)。
                if (path == null)
                {
                    Log("字体包: 未提供 (正常 —— 离线字形图集会负责渲染, 材质自行构建)");
                }
                else
                {
                    AssetBundle bundle = AssetBundle.LoadFromFile(path);
                    if (bundle == null) Log("字体包: AssetBundle.LoadFromFile 返回 null, 忽略");
                    else
                    {
                        UnityEngine.Object[] objs = bundle.LoadAllAssets(typeof(TMP_FontAsset));
                        int n = (objs == null) ? 0 : objs.Length;
                        Log("字体包: 内 TMP_FontAsset 数量 " + n);
                        for (int i = 0; i < n; i++)
                        {
                            TMP_FontAsset f = objs[i] as TMP_FontAsset;
                            if (f == null) continue;
                            Log("  asset: '" + f.name + "'");
                            if (s_cjk == null) s_cjk = f;
                        }
                        if (s_cjk != null)
                        {
                            int gl = (s_cjk.characterDictionary != null) ? s_cjk.characterDictionary.Count : -1;
                            string at = (s_cjk.atlas != null) ? (s_cjk.atlas.width + "x" + s_cjk.atlas.height) : "null";
                            Log("字体包: 选定 '" + s_cjk.name + "' glyphs=" + gl + " atlas=" + at
                                + " mat=" + (s_cjk.material != null ? s_cjk.material.name : "null"));
                        }
                        else Log("字体包: 内没有 TMP_FontAsset, 忽略");
                    }
                }

                ApplyPatches();

                string csv = FindCsv(path, modDir);
                Log("CSV = " + (csv ?? "<未找到>"));
                LoadCsvKeys(csv);

                // v0.8: 优先用离线字形图集 (AtlasFont)。数据源是离线文件, 不依赖任何系统字体。
                try
                {
                    bool atlasOff = modDir != null && File.Exists(Path.Combine(modDir, "ATLAS_OFF"));
                    bool atlasForce = modDir != null && File.Exists(Path.Combine(modDir, "ATLAS_FORCE"));
                    string atlasDir = FindAtlasDir(modDir);
                    if (atlasOff)
                        Log("AtlasFont: 检测到 ATLAS_OFF 开关, 跳过离线图集");
                    else if (atlasDir == null)
                        Log("AtlasFont: 没找到 atlas/atlas.bin, 跳过 (继续用 MSYH SDF)");
                    else
                    {
                        Log("AtlasFont: 图集目录 = " + atlasDir + (atlasForce ? "   [ATLAS_FORCE 已开]" : ""));
                        TMP_FontAsset full = AtlasFont.Build(atlasDir, csv, s_cjk, atlasForce, Log);
                        if (full != null)
                        {
                            s_full = full;
                            EnsureFallback(s_full);
                            Log("AtlasFont: 已启用离线字形图集 (中文将使用它渲染)");
                        }
                        else Log("AtlasFont: 构建失败, 继续使用 MSYH SDF");
                    }
                }
                catch (Exception ex) { Log("AtlasFont 阶段异常: " + ex.Message); }

                // 两条路都没成 -> 中文没法渲染, 明确报出来
                if (s_full == null && s_cjk == null)
                {
                    Log("ERROR 既没有离线图集也没有字体包, 中文将无法渲染 (请检查 atlas/ 目录)");
                    return;
                }

                // 全局回退表注入必须放在这里: 此时 ActiveFont() 才是最终结果。
                // (放在图集构建之前的话, 没有字体包时 ActiveFont() 还是 null, 注入会静默失效)
                SweepExistingFonts();

                // v0.7 的"运行时从系统字体自建图集"已证实走不通 (Unity 动态字体纹理上限 1024/2048,
                // 覆盖率卡在 90.1%)。改为默认关闭, 只有显式放 FULLFONT_ON 才跑 —— 顺便省掉每次启动的 14 秒。
                try
                {
                    bool ffOn = modDir != null && File.Exists(Path.Combine(modDir, "FULLFONT_ON"));
                    if (s_full != null) { /* 离线图集已生效, 不需要 */ }
                    else if (!ffOn) Log("FullFont: 未启用 (该路线覆盖率上限不够; 需要 FULLFONT_ON 才会尝试)");
                    else
                    {
                        TMP_FontAsset full = FullFont.Build(csv, Log);
                        if (full != null)
                        {
                            s_full = full;
                            EnsureFallback(s_full);
                            Log("FullFont: 已启用全字库 (中文将使用它渲染)");
                        }
                        else Log("FullFont: 构建失败, 继续使用 MSYH SDF");
                    }
                }
                catch (Exception ex) { Log("FullFont 阶段异常: " + ex.Message); }

                // 汉字比拉丁字母高, 游戏不少面板行高是按拉丁字母设计的 -> 整体缩一点, 避免上下行相压。
                // 必须作用在"实际用来渲染的那个字体"上 (s_full 优先): 原来只缩 s_cjk,
                // 而渲染走 s_full, 于是全字库的字形会大 10%、行距也会变。
                try
                {
                    string noShrink = (modDir != null) ? Path.Combine(modDir, "FONT_NOSHRINK") : null;
                    if (noShrink != null && File.Exists(noShrink)) Log("字号缩放: 检测到 FONT_NOSHRINK, 保持原字号");
                    else ShrinkFont((s_full != null) ? s_full : s_cjk, 1.10f, (s_full != null) ? "ATLAS" : "MSYH");
                }
                catch (Exception ex) { Log("字号缩放异常: " + ex.Message); }

                // 在图集/字号都定下来之后导出"实际生效"的字形集, 供 tools/glyph-scan.mjs 校验
                DumpGlyphs();

                Log("Init 结束");
            }
            catch (Exception ex) { Log("Init 异常: " + ex); }
        }

        static void ApplyPatches()
        {
            HarmonyInstance h = HarmonyInstance.Create("BTHanHua.font");
            TryPatch(h, "BattleTech.UI.TMProWrapper.LocalizableText", "SetLocalizedFont", "PostfixAfterLocalize");
            TryPatch(h, "BattleTech.UI.TMProWrapper.LocalizableText", "RefreshText", "PostfixAfterRefresh");
            TryPatch(h, typeof(TMP_Text), "LoadFontAsset", "PostfixLoadFontAsset");
            TryPatch(h, "BattleTech.Localization", "LocalizeKey", "PostfixLocalizeKey");
            // 漏译检测必须挂到"真正的取值路径"上。
            // 实测: BattleTech.Localization.LocalizeKey 只覆盖极少数调用点 —— 主菜单按钮走的是
            // Localize.Text / LocalizableText 这条 HBS 自建的路 (dump 里有 Localize.Text、
            // Localize.InterpolatedText、Localize.NonLocalizableText、LocalizableText.getLocalizableTextValue),
            // 所以原来只挂 LocalizeKey 的话, MISS 日志形同虚设。
            TryPatch(h, "BattleTech.UI.TMProWrapper.LocalizableText", "getLocalizableTextValue", "PostfixLocalizedValue");
            TryPatch(h, "Localize.Text", "ToString", new Type[] { typeof(bool) }, "PostfixLocalizedValue");
            TryPatch(h, "Localize.InterpolatedText", "ToString", new Type[] { typeof(bool) }, "PostfixLocalizedValue");
            TryPatch(h, "Localize.NonLocalizableText", "ToString", new Type[] { typeof(bool) }, "PostfixLocalizedValue");
        }

        static void TryPatch(HarmonyInstance h, string typeName, string methodName, string postfixName)
        {
            Type t = FindType(typeName);
            if (t == null) { Log("警告 未找到类型 " + typeName); return; }
            TryPatch(h, t, methodName, postfixName);
        }

        static void TryPatch(HarmonyInstance h, Type t, string methodName, string postfixName)
        {
            try
            {
                MethodInfo m = t.GetMethod(methodName, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static);
                if (m == null) { Log("警告 未找到方法 " + t.Name + "." + methodName); return; }
                MethodInfo p = typeof(FontMod).GetMethod(postfixName, BindingFlags.Static | BindingFlags.NonPublic);
                h.Patch(m, null, new HarmonyMethod(p), null);
                Log("已挂钩 " + t.Name + "." + methodName);
            }
            catch (Exception ex) { Log("挂钩 " + t.Name + "." + methodName + " 失败: " + ex.Message); }
        }

        // 指定参数类型, 用于方法有重载的情况 (如 ToString() / ToString(Boolean))
        static void TryPatch(HarmonyInstance h, string typeName, string methodName, Type[] paramTypes, string postfixName)
        {
            Type t = FindType(typeName);
            if (t == null) { Log("警告 未找到类型 " + typeName); return; }
            try
            {
                MethodInfo m = t.GetMethod(methodName,
                    BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static,
                    null, paramTypes, null);
                if (m == null) { Log("警告 未找到方法 " + typeName + "." + methodName); return; }
                MethodInfo p = typeof(FontMod).GetMethod(postfixName, BindingFlags.Static | BindingFlags.NonPublic);
                h.Patch(m, null, new HarmonyMethod(p), null);
                Log("已挂钩 " + t.Name + "." + methodName);
            }
            catch (Exception ex) { Log("挂钩 " + typeName + "." + methodName + " 失败: " + ex.Message); }
        }

        // ---------- 补丁实现 ----------
        static void PostfixAfterLocalize(object __instance) { Sync(__instance); }
        static void PostfixAfterRefresh(object __instance) { Sync(__instance); SweepFor(); }

        // 漏译检测: 判据是"最终输出恰好等于 CSV 里的某个 key"。
        // 比原来那条 __result == localizationKey 更可靠 —— 不依赖调用方把 key 传成什么样。
        static void PostfixLocalizedValue(ref string __result)
        {
            try
            {
                if (s_csvKeys == null || __result == null) return;
                if (s_miss.Count >= 6000) return;
                int n = __result.Length;
                if (n < 3 || n > 120) return;
                // 含中文/空白就一定已经翻译过了; 中文串在这里第 1~3 个字符就会跳出, 开销极小
                for (int i = 0; i < n; i++)
                {
                    char c = __result[i];
                    if (c <= 32 || c > 126) return;
                }
                if (!s_csvKeys.Contains(__result)) return;
                if (s_miss.Add(__result)) Log("MISS " + __result);
            }
            catch { }
        }

        // 载入 CSV 的全部 key
        static void LoadCsvKeys(string csvPath)
        {
            try
            {
                if (string.IsNullOrEmpty(csvPath) || !File.Exists(csvPath)) return;
                HashSet<string> set = new HashSet<string>();
                string[] lines = File.ReadAllLines(csvPath, Encoding.UTF8);
                for (int i = 1; i < lines.Length; i++)
                {
                    int j = lines[i].IndexOf(',');
                    if (j > 0) set.Add(lines[i].Substring(0, j));
                }
                s_csvKeys = set;
                Log("已载入 CSV key 表: " + set.Count + " 个 (运行期漏译判定用)");
            }
            catch (Exception ex) { Log("载入 CSV key 表失败: " + ex.Message); }
        }

        // 主动扫描: 找出含特定字符的文本及其字体 (徽标/图标通常不是 LocalizableText, 挂钩看不到)
        static float s_nextSweep;
        static readonly HashSet<string> s_hitSeen = new HashSet<string>();
        static void SweepFor()
        {
            try
            {
                if (Time.realtimeSinceStartup < s_nextSweep) return;
                s_nextSweep = Time.realtimeSinceStartup + 2.5f;
                UnityEngine.Object[] all = Resources.FindObjectsOfTypeAll(typeof(TMP_Text));
                if (all == null) return;
                for (int i = 0; i < all.Length; i++)
                {
                    TMP_Text t = all[i] as TMP_Text;
                    if (t == null) continue;
                    string s = t.text;
                    if (string.IsNullOrEmpty(s) || s.Length > 8) continue;
                    if (s.IndexOf('\u5723') < 0 && s.IndexOf('\u9E23') < 0) continue;   // 圣 / 鸣
                    string nm = ((UnityEngine.Object)t).name;
                    string key = nm + "|" + s;
                    if (s_hitSeen.Count >= 40 || !s_hitSeen.Add(key)) continue;
                    StringBuilder cps = new StringBuilder();
                    for (int k = 0; k < s.Length; k++) cps.Append("U+" + ((int)s[k]).ToString("X4") + " ");
                    Log("SWEEP '" + nm + "' font='" + (t.font != null ? t.font.name : "?") + "' text='" + s + "' cp=" + cps.ToString().Trim()
                        + " fontHasChar=" + (t.font != null ? SafeHas(t.font, s) : "?"));
                }
            }
            catch { }
        }

        static string SafeHas(TMP_FontAsset f, string s)
        {
            try
            {
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < s.Length; i++)
                {
                    bool h;
                    try { h = f.HasCharacter(s[i], false); } catch { h = false; }
                    sb.Append(h ? "1" : "0");
                }
                return sb.ToString();
            }
            catch { return "?"; }
        }

        static void PostfixLoadFontAsset(TMP_Text __instance)
        {
            try
            {
                if (__instance == null) return;
                EnsureFallback(__instance.font);
                // 诊断: 记录很短的 CJK 文本 (<=4 字) 及其原始字体, 用于定位图标字体上的怪字符(如"圣")
                string s = __instance.text;
                if (string.IsNullOrEmpty(s) || s.Length > 4) return;
                bool hasCjk = false;
                for (int i = 0; i < s.Length; i++) if (IsCjk(s[i])) { hasCjk = true; break; }
                if (!hasCjk) return;
                if (s_shortSeen.Count >= 120) return;
                string key = ((UnityEngine.Object)__instance).name + "|" + s + "|" + (__instance.font != null ? __instance.font.name : "?");
                if (s_shortSeen.Add(key))
                {
                    StringBuilder cps = new StringBuilder();
                    for (int i = 0; i < s.Length; i++) cps.Append("U+" + ((int)s[i]).ToString("X4") + " ");
                    Log("SHORT '" + ((UnityEngine.Object)__instance).name + "' font='" + (__instance.font != null ? __instance.font.name : "?") + "' text='" + s + "' cp=" + cps.ToString().Trim());
                }
            }
            catch { }
        }

        static void PostfixLocalizeKey(string localizationKey, ref string __result)
        {
            try
            {
                // 修正 .NET 格式串: CSV 里不能出现半角逗号, 所以格式符里的逗号在 CSV 中写成全角，
                // 这里在运行期换回半角 —— 否则 string.Format 会把格式模式原样吐出来
                // (机甲图标上那串橙色乱数字就是这么来的: {0:0，，.00}M -> 2530000，，.00M)
                if (__result != null && __result.IndexOf('{') >= 0) __result = FixFormatSpecifiers(__result);

                if (localizationKey == null || __result == null) return;
                if (__result != localizationKey) return;
                if (localizationKey.Length < 2) return;
                int letters = 0;
                for (int i = 0; i < localizationKey.Length; i++) if (char.IsLetter(localizationKey[i])) letters++;
                if (letters < 2) return;
                if (s_miss.Count >= 6000) return;
                if (s_miss.Add(localizationKey)) Log("MISS " + localizationKey);
            }
            catch { }
        }

        // 把格式模式里的全角逗号换回半角 (CSV 里禁半角逗号, 所以只能运行期换回去)
        static string FixFormatSpecifiers(string s)
        {
            // 情形1: 裸格式模式, 如 "0，，.00M" (机甲造价那种, 直接交给 ToString 用的) -> 含连续两个全角逗号即判定
            if (s.IndexOf("\uFF0C\uFF0C") >= 0)
            {
                string bare = s.Replace('\uFF0C', ',');
                if (s_fmtFixed < 5) { s_fmtFixed++; Log("格式串修正(裸): '" + s + "' -> '" + bare + "'"); }
                return bare;
            }
            // 情形2: 复合格式串 {0:0，，.00}M -> 只改花括号内部的
            StringBuilder sb = null;
            int depth = 0;
            for (int i = 0; i < s.Length; i++)
            {
                char c = s[i];
                if (c == '{') depth++;
                else if (c == '}') { if (depth > 0) depth--; }
                else if (depth > 0 && c == '\uFF0C')
                {
                    if (sb == null) sb = new StringBuilder(s);
                    sb[i] = ',';
                }
            }
            if (sb == null) return s;
            if (s_fmtFixed < 5) { s_fmtFixed++; Log("格式串修正: '" + s + "' -> '" + sb.ToString() + "'"); }
            return sb.ToString();
        }
        static int s_fmtFixed;

        // 双向切换
        static void Sync(object instance)
        {
            TMP_FontAsset target = (s_full != null) ? s_full : s_cjk;
            if (target == null || s_busy || instance == null) return;
            TMP_Text t = instance as TMP_Text;
            if (t == null) return;
            try
            {
                EnsureFallback(t.font);
                string txt = t.text;
                int id = ((UnityEngine.Object)t).GetInstanceID();
                TMP_FontAsset orig = s_origFont.ContainsKey(id) ? s_origFont[id] : t.font;
                // 图标字体常把 CJK 码位当图标用: 若原字体对这些字符本来就有字形, 就不该换
                bool want = LooksChinese(txt) && !OrigFontCovers(orig, txt);

                if (want)
                {
                    if (t.font != target)
                    {
                        if (!s_origFont.ContainsKey(id)) s_origFont[id] = t.font;
                        s_busy = true;
                        try
                        {
                            MethodInfo setter = instance.GetType().GetMethod("SetFont", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
                            if (setter != null) setter.Invoke(instance, new object[] { target });
                            else t.font = target;
                        }
                        finally { s_busy = false; }
                        string key = ((UnityEngine.Object)t).name + "|" + (s_origFont[id] != null ? s_origFont[id].name : "?");
                        if (s_swapped.Add(key) && s_swapped.Count <= 60)
                            Log("切换 '" + ((UnityEngine.Object)t).name + "' 原字体='" + (s_origFont[id] != null ? s_origFont[id].name : "?") + "' 目标='" + target.name + "' 文本=" + Trunc(txt, 50));
                        CheckGlyphs(txt);
                    }
                }
                else if (t.font == target && s_origFont.ContainsKey(id))
                {
                    s_busy = true;
                    try { t.font = s_origFont[id]; }
                    finally { s_busy = false; }
                }
            }
            catch (Exception ex) { Log("Sync 失败: " + ex.Message); }
        }

        // 像中文: >=2 个 CJK, 或 1 个 CJK 且总长>=3 (排除单字符图标)
        static bool LooksChinese(string s)
        {
            if (string.IsNullOrEmpty(s)) return false;
            int cjk = 0;
            for (int i = 0; i < s.Length; i++) if (IsCjk(s[i])) cjk++;
            if (cjk >= 2) return true;
            return cjk == 1 && s.Length >= 3;
        }

        static bool IsCjk(char c)
        {
            return (c >= 0x2E80 && c <= 0x9FFF) || (c >= 0xF900 && c <= 0xFAFF)
                || (c >= 0xFE30 && c <= 0xFE4F) || (c >= 0xFF00 && c <= 0xFFEF);
        }

        // 原字体是否"本来就覆盖"文本里所有 CJK 字符 (是 -> 大概率是图标字体, 不换)
        static bool OrigFontCovers(TMP_FontAsset f, string s)
        {
            if (f == null || string.IsNullOrEmpty(s)) return false;
            int cjk = 0, cov = 0;
            for (int i = 0; i < s.Length; i++)
            {
                char c = s[i];
                if (!IsCjk(c)) continue;
                cjk++;
                bool has;
                try { has = f.HasCharacter(c, false); } catch { has = false; }
                if (has) cov++;
            }
            return cjk > 0 && cov == cjk;
        }

        // 记录字体图集里没有的字形 -> 这些就是显示成方框的原因
        // 实际用来渲染中文的那个字体资产 (离线图集优先; 没有才退回字体包里的 MSYH)
        static TMP_FontAsset ActiveFont()
        {
            return (s_full != null) ? s_full : s_cjk;
        }

        static void CheckGlyphs(string s)
        {
            TMP_FontAsset af = ActiveFont();
            if (string.IsNullOrEmpty(s) || af == null) return;
            for (int i = 0; i < s.Length; i++)
            {
                char c = s[i];
                if (!IsCjk(c)) continue;
                if (s_noGlyph.Contains(c)) continue;
                bool has;
                try { has = af.HasCharacter(c, false); } catch { has = true; }
                if (!has)
                {
                    if (s_noGlyph.Count < 800) { s_noGlyph.Add(c); Log("NOGLYPH '" + c + "' U+" + ((int)c).ToString("X4")); }
                }
            }
        }

        static string Trunc(string s, int n)
        {
            if (s == null) return "";
            return s.Length <= n ? s : s.Substring(0, n) + "...";
        }

        static void EnsureFallback(TMP_FontAsset f)
        {
            TMP_FontAsset af = ActiveFont();
            if (f == null || af == null || f == af) return;
            try
            {
                if (f.fallbackFontAssets == null) f.fallbackFontAssets = new List<TMP_FontAsset>();
                if (!f.fallbackFontAssets.Contains(af)) f.fallbackFontAssets.Add(af);
            }
            catch { }
        }

        // 导出字体图集覆盖的所有码位 -> 离线即可查出哪些译文字符会变方框
        // 注意: characterDictionary 在 OnEnable 后可能尚未由 m_glyphInfoList 重建完整,
        //       必须先调 ReadFontDefinition(), 并合并三个来源取并集, 否则会漏报大量字形。
        static void DumpGlyphs()
        {
            try
            {
                if (s_logPath == null) return;
                // 导出"实际生效"的那个字体: 离线图集优先。
                // 否则 glyph-scan.mjs 会拿旧 MSYH 图集的覆盖表去校验新译文, 结论就错了。
                TMP_FontAsset fa = (s_full != null) ? s_full : s_cjk;
                if (fa == null) return;
                Log("导出字形集的目标字体: '" + fa.name + "' (s_full " + (s_full != null ? "已启用" : "未启用") + ")");
                int before = (fa.characterDictionary != null) ? fa.characterDictionary.Count : -1;
                // ReadFontDefinition 只对 bundle 里加载的资产用; 对运行时新建的资产它会重建字典,
                // 有清空我们刚填好的数据的风险, 所以跳过。
                if (fa == s_cjk)
                {
                    try { fa.ReadFontDefinition(); } catch (Exception ex) { Log("ReadFontDefinition 失败: " + ex.Message); }
                }
                int after = (fa.characterDictionary != null) ? fa.characterDictionary.Count : -1;
                Log("characterDictionary 数量: 处理前 " + before + " -> 后 " + after);

                SortedSet<int> set = new SortedSet<int>();
                int srcArr = 0, srcDict = 0, srcList = 0;
                try
                {
                    int[] arr = TMP_FontAsset.GetCharactersArray(fa);
                    if (arr != null) for (int i = 0; i < arr.Length; i++) if (arr[i] > 0 && arr[i] <= 0xFFFF) { if (set.Add(arr[i])) srcArr++; }
                }
                catch (Exception ex) { Log("GetCharactersArray 失败: " + ex.Message); }
                if (fa.characterDictionary != null)
                    foreach (int c in fa.characterDictionary.Keys) if (c > 0 && c <= 0xFFFF) { if (set.Add(c)) srcDict++; }
                try
                {
                    FieldInfo fi = typeof(TMP_FontAsset).GetField("m_glyphInfoList", BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
                    if (fi != null)
                    {
                        System.Collections.IEnumerable list = fi.GetValue(fa) as System.Collections.IEnumerable;
                        if (list != null)
                            foreach (object o in list)
                            {
                                if (o == null) continue;
                                FieldInfo idf = o.GetType().GetField("id", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                                if (idf == null)
                                {
                                    FieldInfo[] ffs = o.GetType().GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                                    for (int k = 0; k < ffs.Length; k++) if (ffs[k].FieldType == typeof(int)) { idf = ffs[k]; break; }
                                }
                                if (idf == null) continue;
                                int code = (int)idf.GetValue(o);
                                if (code > 0 && code <= 0xFFFF) { if (set.Add(code)) srcList++; }
                            }
                    }
                }
                catch (Exception ex) { Log("读 m_glyphInfoList 失败: " + ex.Message); }

                StringBuilder sb = new StringBuilder();
                foreach (int c in set) sb.Append((char)c);
                File.WriteAllText(Path.Combine(Path.GetDirectoryName(s_logPath), "BTHanHuaFont.glyphs.txt"), sb.ToString(), Encoding.UTF8);
                Log("字形集导出: 并集 " + set.Count + " (GetCharactersArray +" + srcArr + ", dictionary +" + srcDict + ", glyphInfoList +" + srcList + ")");
            }
            catch (Exception ex) { Log("导出字形集失败: " + ex.Message); }
        }

        // 通过放大 PointSize 让 TMP 以更大的分母做缩放 -> 同一 fontSize 下渲染更小
        static void ShrinkFont(TMP_FontAsset fa, float factor, string tag)
        {
            if (fa == null || factor <= 0f) return;
            try
            {
                FaceInfo fi = fa.fontInfo;
                if (fi == null || fi.PointSize <= 0f) { Log("字号缩放: " + tag + " PointSize 无效, 跳过"); return; }
                float old = fi.PointSize;
                fi.PointSize = old * factor;
                Log("字号缩放: " + tag + " PointSize " + old.ToString("0.#") + " -> " + fi.PointSize.ToString("0.#") + " (字形缩小 " + ((1f - 1f / factor) * 100f).ToString("0.#") + "%)");
            }
            catch (Exception ex) { Log("字号缩放失败: " + ex.Message); }
        }

        static void SweepExistingFonts()
        {
            int cnt = 0;
            try
            {
                UnityEngine.Object[] all = Resources.FindObjectsOfTypeAll(typeof(TMP_FontAsset));
                if (all != null) for (int i = 0; i < all.Length; i++) { TMP_FontAsset f = all[i] as TMP_FontAsset; if (f != null) { EnsureFallback(f); cnt++; } }
            }
            catch (Exception ex) { Log("扫描字体资产失败: " + ex.Message); }
            try
            {
                List<TMP_FontAsset> g = TMP_Settings.fallbackFontAssets;
                TMP_FontAsset af = ActiveFont();
                if (g != null && af != null && !g.Contains(af)) { g.Add(af); Log("已加入 TMP_Settings 全局回退表: " + af.name); }
                else if (g == null) Log("TMP_Settings.fallbackFontAssets 为 null");
            }
            catch (Exception ex) { Log("全局回退失败: " + ex.Message); }
            Log("已加载字体资产 " + cnt + " 个, fallback 注入完成");
        }

        static Type FindType(string fullName)
        {
            try
            {
                Assembly[] asms = AppDomain.CurrentDomain.GetAssemblies();
                for (int i = 0; i < asms.Length; i++)
                {
                    try { Type t = asms[i].GetType(fullName, false); if (t != null) return t; }
                    catch { }
                }
            }
            catch { }
            try { return Assembly.Load("Assembly-CSharp").GetType(fullName, false); }
            catch { return null; }
        }

        // 找离线字形图集目录 (含 atlas.bin 的那个目录)
        static string FindAtlasDir(string modDir)
        {
            try
            {
                if (modDir != null)
                {
                    string p = Path.Combine(modDir, "atlas");
                    if (File.Exists(Path.Combine(p, "atlas.bin"))) return p;
                    if (File.Exists(Path.Combine(modDir, "atlas.bin"))) return modDir;   // 兼容直接放根目录
                }
                string loc = Assembly.GetExecutingAssembly().Location;
                if (!string.IsNullOrEmpty(loc))
                {
                    string d = Path.GetDirectoryName(loc);
                    string p = Path.Combine(d, "atlas");
                    if (File.Exists(Path.Combine(p, "atlas.bin"))) return p;
                    if (File.Exists(Path.Combine(d, "atlas.bin"))) return d;
                }
                string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Personal), "My Games", "BattleTech", "mods");
                string p2 = Path.Combine(Path.Combine(root, "BTHanHuaFont"), "atlas");
                if (File.Exists(Path.Combine(p2, "atlas.bin"))) return p2;
            }
            catch { }
            return null;
        }

        // mod 目录: 优先 DLL 所在目录 (不论 Game Mod 还是 System Mod, DLL 都放在 mod 文件夹里)
        static string FindModDir()
        {
            try
            {
                string loc = Assembly.GetExecutingAssembly().Location;
                if (!string.IsNullOrEmpty(loc))
                {
                    string d = Path.GetDirectoryName(loc);
                    if (!string.IsNullOrEmpty(d) && Directory.Exists(d)) return d;
                }
            }
            catch { }
            try
            {
                string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Personal), "My Games", "BattleTech", "mods");
                string p = Path.Combine(root, "BTHanHuaFont");
                if (Directory.Exists(p)) return p;
            }
            catch { }
            return null;
        }

        // 字体包 (可选: 只作材质/样式模板与回退)
        static string FindBundle(string modDir)
        {
            try
            {
                if (modDir != null)
                {
                    string p = Path.Combine(modDir, "font");
                    if (File.Exists(p)) return p;
                }
            }
            catch { }
            try
            {
                string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Personal), "My Games", "BattleTech", "mods");
                string p2 = Path.Combine(root, "BTHanHuaFont", "font");
                if (File.Exists(p2)) return p2;
                string[] dirs = Directory.GetDirectories(root);
                for (int i = 0; i < dirs.Length; i++)
                {
                    string p3 = Path.Combine(dirs[i], "font");
                    if (File.Exists(p3)) return p3;
                }
            }
            catch { }
            return null;
        }

        // 找文本 CSV (在兄弟 mod 目录 BTHanHua 里)
        static string FindCsv(string bundlePath, string modDir)
        {
            try
            {
                string dir = (bundlePath != null) ? Path.GetDirectoryName(bundlePath) : modDir;
                string mods = (dir != null) ? Path.GetDirectoryName(dir) : null;
                if (mods != null)
                {
                    string p1 = Path.Combine(Path.Combine(mods, "BTHanHua"), "strings_zh-CN.csv");
                    if (File.Exists(p1)) return p1;
                    if (Directory.Exists(mods))
                    {
                        string[] ds = Directory.GetDirectories(mods);
                        for (int i = 0; i < ds.Length; i++)
                        {
                            string p = Path.Combine(ds[i], "strings_zh-CN.csv");
                            if (File.Exists(p)) return p;
                        }
                    }
                }
                if (dir != null)
                {
                    string p2 = Path.Combine(dir, "strings_zh-CN.csv");
                    if (File.Exists(p2)) return p2;
                }
            }
            catch { }
            return null;
        }
    }
}
