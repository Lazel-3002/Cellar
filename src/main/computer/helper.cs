// Cellar's computer-use helper: screenshots, UI Automation and mouse/keyboard input for the agent.
// Compiled on first use with the C# compiler that ships with Windows (.NET Framework 4, C# 5 syntax),
// then driven over stdio with one JSON request per line and one JSON reply per line.
// Every coordinate here is in physical screen pixels: the process is per-monitor DPI aware.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Automation;

namespace CellarComputer
{
    static class Native
    {
        [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
        [DllImport("shcore.dll")] public static extern int SetProcessDpiAwareness(int value);
        [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
        [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder name, int count);
        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
        [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint cmd);
        [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
        [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int index);
        [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc proc, IntPtr lParam);
        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
        [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
        [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
        [DllImport("user32.dll", SetLastError = true)] public static extern uint SendInput(uint count, INPUT[] inputs, int size);
        [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr w, IntPtr l);
        [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint code, uint mapType);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern short VkKeyScanEx(char ch, IntPtr layout);
        [DllImport("user32.dll")] public static extern IntPtr GetKeyboardLayout(uint thread);
        [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
        [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint attach, uint to, bool on);
        [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
        [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out int value, int size);
        public delegate IntPtr LowLevelProc(int code, IntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr SetWindowsHookEx(int id, LowLevelProc proc, IntPtr module, uint thread);
        [DllImport("user32.dll")] public static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll")] public static extern int GetMessage(out MSG msg, IntPtr hWnd, uint min, uint max);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr GetModuleHandle(string name);
        [StructLayout(LayoutKind.Sequential)] public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public POINT pt; }
        [StructLayout(LayoutKind.Sequential)] public struct MSLLHOOKSTRUCT { public POINT pt; public uint mouseData, flags, time; public IntPtr dwExtraInfo; }

        [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
        [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
        [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public InputUnion u; }
        [StructLayout(LayoutKind.Explicit)] public struct InputUnion
        {
            [FieldOffset(0)] public MOUSEINPUT mi;
            [FieldOffset(0)] public KEYBDINPUT ki;
        }
        [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
        [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }
    }

    class HelperError : Exception
    {
        public HelperError(string message) : base(message) { }
    }

    static class Program
    {
        static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue, RecursionLimit = 64 };
        static readonly IntPtr Marker = new IntPtr(0xCE11A5);
        /** Processes whose windows are never looked at or acted on (Cellar itself). */
        static HashSet<uint> excluded = new HashSet<uint>();
        /** Elements from the latest observation, by number, for acting on them later. */
        static List<AutomationElement> lastElements = new List<AutomationElement>();

        /** Mouse events that came from a real mouse (not injected by Cellar or any other program). */
        static long physicalMouse = 0;
        static bool mouseWatch = false;
        static Native.LowLevelProc mouseProc;

        /**
         * A low-level mouse hook on its own thread, counting only events Windows did not flag as
         * injected: that is the user taking the mouse, never Cellar's own moves or a window that
         * moved the pointer.
         */
        static void WatchMouse()
        {
            var ready = new ManualResetEvent(false);
            var thread = new Thread(() =>
            {
                mouseProc = (code, wParam, lParam) =>
                {
                    if (code >= 0)
                    {
                        var info = (Native.MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(Native.MSLLHOOKSTRUCT));
                        if ((info.flags & 1) == 0) Interlocked.Increment(ref physicalMouse);
                    }
                    return Native.CallNextHookEx(IntPtr.Zero, code, wParam, lParam);
                };
                var hook = Native.SetWindowsHookEx(14, mouseProc, Native.GetModuleHandle(null), 0);
                mouseWatch = hook != IntPtr.Zero;
                ready.Set();
                if (!mouseWatch) return;
                Native.MSG msg;
                while (Native.GetMessage(out msg, IntPtr.Zero, 0, 0) > 0) { }
            });
            thread.IsBackground = true;
            thread.Start();
            ready.WaitOne(2000);
        }

        static int Main(string[] args)
        {
            try { if (!Native.SetProcessDpiAwarenessContext(new IntPtr(-4))) Native.SetProcessDpiAwareness(2); }
            catch { try { Native.SetProcessDPIAware(); } catch { } }
            WatchMouse();
            var stdin = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
            var stdout = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
            stdout.AutoFlush = false;
            string line;
            while ((line = stdin.ReadLine()) != null)
            {
                if (line.Trim().Length == 0) continue;
                object id = null;
                string reply;
                try
                {
                    var request = Json.Deserialize<Dictionary<string, object>>(line);
                    id = request.ContainsKey("id") ? request["id"] : null;
                    var result = Dispatch(Str(request, "cmd", ""), request);
                    reply = Json.Serialize(new Dictionary<string, object> { { "id", id }, { "ok", true }, { "result", result } });
                }
                catch (Exception err)
                {
                    var inner = err is System.Reflection.TargetInvocationException && err.InnerException != null ? err.InnerException : err;
                    reply = Json.Serialize(new Dictionary<string, object> { { "id", id }, { "ok", false }, { "error", inner.Message }, { "kind", inner is HelperError ? "user" : inner.GetType().Name } });
                }
                stdout.WriteLine(reply);
                stdout.Flush();
            }
            return 0;
        }

        static object Dispatch(string cmd, Dictionary<string, object> r)
        {
            if (r.ContainsKey("exclude"))
            {
                excluded = new HashSet<uint>();
                foreach (var pid in (IEnumerable)r["exclude"]) excluded.Add(Convert.ToUInt32(pid));
            }
            switch (cmd)
            {
                case "ping": return new Dictionary<string, object> { { "pid", Process.GetCurrentProcess().Id } };
                case "displays": return Displays();
                case "observe": return Observe(r);
                case "cursor": { var p = Cursor(); return Point(p.X, p.Y); }
                case "userInput": return new Dictionary<string, object> { { "watching", mouseWatch }, { "mouse", Interlocked.Read(ref physicalMouse) } };
                case "move": MoveSmooth(Int(r, "x"), Int(r, "y"), Int(r, "ms", 120)); return true;
                case "click": Click(Int(r, "x"), Int(r, "y"), Str(r, "button", "left"), Int(r, "count", 1), Int(r, "ms", 120), Keys(r, "hold")); return true;
                case "drag": Drag(Int(r, "x1"), Int(r, "y1"), Int(r, "x2"), Int(r, "y2")); return true;
                case "scroll": Scroll(Int(r, "x"), Int(r, "y"), Int(r, "dx", 0), Int(r, "dy", 0)); return true;
                case "type": TypeText(Str(r, "text", ""), Int(r, "delay", 6)); return true;
                case "keys": PressCombo(Keys(r, "keys"), Int(r, "repeat", 1)); return true;
                case "element": return ElementInfo(Int(r, "n"));
                case "focusElement": FocusElement(Int(r, "n")); return true;
                case "pointInfo": return PointInfo(Int(r, "x"), Int(r, "y"));
                case "focused": return FocusedInfo();
                case "windows": return Windows(Int(r, "limit", 30));
                case "window": return WindowAction(new IntPtr(Long(r, "hwnd")), Str(r, "action", "focus"));
                case "read": return ReadText(new IntPtr(Long(r, "hwnd", 0)), Int(r, "maxChars", 8000), Bool(r, "all", false), Int(r, "timeout", 4000));
                case "apps": return Apps();
                default: throw new HelperError("Unknown command: " + cmd);
            }
        }

        // ---------- request helpers ----------

        static string Str(Dictionary<string, object> r, string key, string fallback)
        {
            object v;
            return r.TryGetValue(key, out v) && v != null ? Convert.ToString(v) : fallback;
        }

        static int Int(Dictionary<string, object> r, string key)
        {
            object v;
            if (!r.TryGetValue(key, out v) || v == null) throw new HelperError("Missing " + key);
            return (int)Math.Round(Convert.ToDouble(v));
        }

        static int Int(Dictionary<string, object> r, string key, int fallback)
        {
            object v;
            return r.TryGetValue(key, out v) && v != null ? (int)Math.Round(Convert.ToDouble(v)) : fallback;
        }

        static long Long(Dictionary<string, object> r, string key, long fallback = long.MinValue)
        {
            object v;
            if (r.TryGetValue(key, out v) && v != null) return Convert.ToInt64(v);
            if (fallback == long.MinValue) throw new HelperError("Missing " + key);
            return fallback;
        }

        static bool Bool(Dictionary<string, object> r, string key, bool fallback)
        {
            object v;
            return r.TryGetValue(key, out v) && v != null ? Convert.ToBoolean(v) : fallback;
        }

        /**
         * Key presses as [{vk, ext}] (named keys, parsed on the Node side) or [{ch}] (a character, mapped
         * with the foreground window's keyboard layout, so "ctrl+." works on a Turkish keyboard too).
         */
        static List<KeyValuePair<ushort, bool>> Keys(Dictionary<string, object> r, string key)
        {
            var list = new List<KeyValuePair<ushort, bool>>();
            object v;
            if (!r.TryGetValue(key, out v) || v == null) return list;
            foreach (var item in (IEnumerable)v)
            {
                var d = (Dictionary<string, object>)item;
                if (d.ContainsKey("ch"))
                {
                    var ch = Convert.ToString(d["ch"]);
                    if (string.IsNullOrEmpty(ch)) continue;
                    uint pid;
                    var layout = Native.GetKeyboardLayout(Native.GetWindowThreadProcessId(Native.GetForegroundWindow(), out pid));
                    var scan = Native.VkKeyScanEx(ch[0], layout);
                    if (scan == -1) throw new HelperError("The keyboard has no key for \"" + ch + "\". Type it with computer_type instead.");
                    var shifts = (scan >> 8) & 0xff;
                    if ((shifts & 2) != 0 && !list.Any(k => k.Key == 0x11)) list.Add(new KeyValuePair<ushort, bool>(0x11, false));
                    if ((shifts & 4) != 0 && !list.Any(k => k.Key == 0x12)) list.Add(new KeyValuePair<ushort, bool>(0x12, false));
                    if ((shifts & 1) != 0 && !list.Any(k => k.Key == 0x10)) list.Add(new KeyValuePair<ushort, bool>(0x10, false));
                    list.Add(new KeyValuePair<ushort, bool>((ushort)(scan & 0xff), false));
                    continue;
                }
                list.Add(new KeyValuePair<ushort, bool>(Convert.ToUInt16(d["vk"]), d.ContainsKey("ext") && Convert.ToBoolean(d["ext"])));
            }
            return list;
        }

        static Dictionary<string, object> Point(int x, int y)
        {
            return new Dictionary<string, object> { { "x", x }, { "y", y } };
        }

        static Dictionary<string, object> RectObj(int x, int y, int w, int h)
        {
            return new Dictionary<string, object> { { "x", x }, { "y", y }, { "w", w }, { "h", h } };
        }

        // ---------- windows ----------

        static string WindowTitle(IntPtr h)
        {
            var sb = new StringBuilder(512);
            Native.GetWindowText(h, sb, sb.Capacity);
            return sb.ToString();
        }

        static string WindowClass(IntPtr h)
        {
            var sb = new StringBuilder(256);
            Native.GetClassName(h, sb, sb.Capacity);
            return sb.ToString();
        }

        static uint WindowPid(IntPtr h)
        {
            uint pid;
            Native.GetWindowThreadProcessId(h, out pid);
            return pid;
        }

        static readonly Dictionary<uint, string> processNames = new Dictionary<uint, string>();

        static string ProcessName(uint pid)
        {
            string name;
            if (processNames.TryGetValue(pid, out name)) return name;
            try { name = Process.GetProcessById((int)pid).ProcessName; } catch { name = ""; }
            processNames[pid] = name;
            return name;
        }

        static bool Cloaked(IntPtr h)
        {
            int value;
            try { return Native.DwmGetWindowAttribute(h, 14, out value, 4) == 0 && value != 0; } catch { return false; }
        }

        static Rectangle WindowRect(IntPtr h)
        {
            Native.RECT r;
            if (!Native.GetWindowRect(h, out r)) return Rectangle.Empty;
            return new Rectangle(r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top);
        }

        const int GWL_EXSTYLE = -20, GWL_STYLE = -16;
        const int WS_EX_TOOLWINDOW = 0x80, WS_EX_APPWINDOW = 0x40000, WS_EX_TRANSPARENT = 0x20, WS_EX_NOACTIVATE = 0x08000000;

        static bool IsShellWindow(string cls)
        {
            return cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd" || cls == "Progman" || cls == "WorkerW";
        }

        /** Top-level windows from the top of the z-order down. */
        static List<IntPtr> ZOrder()
        {
            var list = new List<IntPtr>();
            Native.EnumWindows(delegate (IntPtr h, IntPtr l) { list.Add(h); return true; }, IntPtr.Zero);
            return list;
        }

        /** Windows a person would pick in Alt+Tab: visible, titled, unowned, not tool windows, not Cellar. */
        static bool IsAppWindow(IntPtr h)
        {
            if (!Native.IsWindowVisible(h) || Cloaked(h)) return false;
            if (excluded.Contains(WindowPid(h))) return false;
            if (WindowTitle(h).Length == 0) return false;
            var ex = Native.GetWindowLong(h, GWL_EXSTYLE);
            if ((ex & WS_EX_TOOLWINDOW) != 0 && (ex & WS_EX_APPWINDOW) == 0) return false;
            if (Native.GetWindow(h, 4) != IntPtr.Zero && (ex & WS_EX_APPWINDOW) == 0) return false;
            if (IsShellWindow(WindowClass(h))) return false;
            return true;
        }

        static Dictionary<string, object> WindowObj(IntPtr h, IntPtr foreground)
        {
            var rect = WindowRect(h);
            var pid = WindowPid(h);
            return new Dictionary<string, object> {
                { "hwnd", h.ToInt64() }, { "title", WindowTitle(h) }, { "process", ProcessName(pid) }, { "pid", pid },
                { "minimized", Native.IsIconic(h) }, { "maximized", Native.IsZoomed(h) }, { "foreground", h == foreground },
                { "rect", RectObj(rect.X, rect.Y, rect.Width, rect.Height) }, { "cls", WindowClass(h) },
            };
        }

        static List<object> Windows(int limit)
        {
            var fg = Native.GetForegroundWindow();
            var list = new List<object>();
            foreach (var h in ZOrder())
            {
                if (list.Count >= limit) break;
                if (IsAppWindow(h)) list.Add(WindowObj(h, fg));
            }
            return list;
        }

        /** The topmost window under a point that takes mouse input (skips click-through overlays). */
        static IntPtr TopWindowAt(int x, int y)
        {
            foreach (var h in ZOrder())
            {
                if (!Native.IsWindowVisible(h) || Cloaked(h) || Native.IsIconic(h)) continue;
                var ex = Native.GetWindowLong(h, GWL_EXSTYLE);
                if ((ex & WS_EX_TRANSPARENT) != 0) continue;
                if (WindowRect(h).Contains(x, y)) return h;
            }
            return IntPtr.Zero;
        }

        static object WindowAction(IntPtr h, string action)
        {
            if (!Native.IsWindow(h)) throw new HelperError("That window is gone.");
            if (excluded.Contains(WindowPid(h))) throw new HelperError("That is Cellar's own window.");
            switch (action)
            {
                case "focus": Focus(h); break;
                case "minimize": Native.ShowWindow(h, 6); break;
                case "maximize": Native.ShowWindow(h, 3); Focus(h); break;
                case "restore": Native.ShowWindow(h, 9); Focus(h); break;
                case "close": Native.PostMessage(h, 0x0010, IntPtr.Zero, IntPtr.Zero); break;
                default: throw new HelperError("Unknown window action: " + action);
            }
            Thread.Sleep(150);
            return WindowObj(h, Native.GetForegroundWindow());
        }

        static void Focus(IntPtr h)
        {
            if (Native.IsIconic(h)) Native.ShowWindow(h, 9);
            // Any input from this process lifts the foreground lock; a key-up of an unassigned key does nothing else.
            SendKey(0x88, false, false);
            Native.SetForegroundWindow(h);
            if (Native.GetForegroundWindow() != h)
            {
                uint pid;
                var fgThread = Native.GetWindowThreadProcessId(Native.GetForegroundWindow(), out pid);
                var me = Native.GetCurrentThreadId();
                Native.AttachThreadInput(me, fgThread, true);
                Native.BringWindowToTop(h);
                Native.SetForegroundWindow(h);
                Native.AttachThreadInput(me, fgThread, false);
            }
        }

        // ---------- displays and screenshots ----------

        static List<object> Displays()
        {
            var list = new List<object>();
            var screens = System.Windows.Forms.Screen.AllScreens;
            for (int i = 0; i < screens.Length; i++)
            {
                var b = screens[i].Bounds;
                var w = screens[i].WorkingArea;
                list.Add(new Dictionary<string, object> {
                    { "index", i }, { "primary", screens[i].Primary }, { "name", screens[i].DeviceName },
                    { "bounds", RectObj(b.X, b.Y, b.Width, b.Height) }, { "work", RectObj(w.X, w.Y, w.Width, w.Height) },
                });
            }
            return list;
        }

        static Rectangle DisplayBounds(int index)
        {
            var screens = System.Windows.Forms.Screen.AllScreens;
            var screen = index >= 0 && index < screens.Length ? screens[index] : System.Windows.Forms.Screen.PrimaryScreen;
            return screen.Bounds;
        }

        static readonly Color[] Palette = {
            Color.FromArgb(229, 72, 77), Color.FromArgb(62, 99, 221), Color.FromArgb(48, 164, 108), Color.FromArgb(247, 107, 21),
            Color.FromArgb(142, 78, 198), Color.FromArgb(0, 144, 255), Color.FromArgb(214, 64, 159), Color.FromArgb(18, 165, 148),
        };

        static ImageCodecInfo jpegCodec;

        static string Encode(Bitmap bmp, string format, int quality, out string mime)
        {
            using (var ms = new MemoryStream())
            {
                if (format == "png")
                {
                    bmp.Save(ms, ImageFormat.Png);
                    mime = "image/png";
                }
                else
                {
                    if (jpegCodec == null) jpegCodec = ImageCodecInfo.GetImageEncoders().First(c => c.MimeType == "image/jpeg");
                    var p = new EncoderParameters(1);
                    p.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)quality);
                    bmp.Save(ms, jpegCodec, p);
                    mime = "image/jpeg";
                }
                return Convert.ToBase64String(ms.ToArray());
            }
        }

        // ---------- UI Automation ----------

        static readonly ControlType[] InteractiveTypes = {
            ControlType.Button, ControlType.CheckBox, ControlType.ComboBox, ControlType.Edit, ControlType.Hyperlink,
            ControlType.ListItem, ControlType.MenuItem, ControlType.RadioButton, ControlType.Slider, ControlType.Spinner,
            ControlType.SplitButton, ControlType.TabItem, ControlType.TreeItem, ControlType.DataItem, ControlType.Document,
            ControlType.HeaderItem,
        };

        static Condition interactiveCondition;

        static Condition InteractiveCondition()
        {
            if (interactiveCondition != null) return interactiveCondition;
            var any = new List<Condition>();
            foreach (var t in InteractiveTypes) any.Add(new PropertyCondition(AutomationElement.ControlTypeProperty, t));
            any.Add(new PropertyCondition(AutomationElement.IsInvokePatternAvailableProperty, true));
            // Static text too: a calculator's display, a dialog's message. Listed apart, never numbered.
            any.Add(new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Text));
            interactiveCondition = new AndCondition(new PropertyCondition(AutomationElement.IsOffscreenProperty, false), new OrCondition(any.ToArray()));
            return interactiveCondition;
        }

        static CacheRequest ElementCache()
        {
            var cr = new CacheRequest();
            cr.AutomationElementMode = AutomationElementMode.Full;
            cr.TreeScope = TreeScope.Element;
            cr.Add(AutomationElement.NameProperty);
            cr.Add(AutomationElement.ControlTypeProperty);
            cr.Add(AutomationElement.LocalizedControlTypeProperty);
            cr.Add(AutomationElement.BoundingRectangleProperty);
            cr.Add(AutomationElement.IsEnabledProperty);
            cr.Add(AutomationElement.HasKeyboardFocusProperty);
            cr.Add(AutomationElement.IsPasswordProperty);
            cr.Add(AutomationElement.HelpTextProperty);
            cr.Add(ValuePattern.ValueProperty);
            cr.Add(ValuePattern.IsReadOnlyProperty);
            cr.Add(TogglePattern.ToggleStateProperty);
            cr.Add(SelectionItemPattern.IsSelectedProperty);
            cr.Add(ExpandCollapsePattern.ExpandCollapseStateProperty);
            return cr;
        }

        static object Cached(AutomationElement e, AutomationProperty p)
        {
            try
            {
                var v = e.GetCachedPropertyValue(p, true);
                return v == AutomationElement.NotSupported ? null : v;
            }
            catch { return null; }
        }

        static string RoleName(ControlType t)
        {
            if (t == null) return "element";
            var name = t.ProgrammaticName.Replace("ControlType.", "");
            switch (name)
            {
                case "Edit": return "text field";
                case "Hyperlink": return "link";
                case "ListItem": return "list item";
                case "MenuItem": return "menu item";
                case "RadioButton": return "radio button";
                case "CheckBox": return "checkbox";
                case "ComboBox": return "dropdown";
                case "SplitButton": return "split button";
                case "TabItem": return "tab";
                case "TreeItem": return "tree item";
                case "DataItem": return "cell";
                case "HeaderItem": return "column header";
                default: return name.ToLowerInvariant();
            }
        }

        /** Runs UI Automation work on its own thread so a hung provider cannot block the helper forever. */
        static T WithTimeout<T>(Func<T> work, int ms, out bool timedOut)
        {
            T result = default(T);
            Exception error = null;
            var thread = new Thread(() => { try { result = work(); } catch (Exception e) { error = e; } });
            thread.IsBackground = true;
            thread.SetApartmentState(ApartmentState.MTA);
            thread.Start();
            timedOut = !thread.Join(ms);
            if (timedOut) return default(T);
            if (error != null) throw error;
            return result;
        }

        class Found
        {
            public AutomationElement Element;
            public Rectangle Rect;
            public string Role;
            public string Name;
            public string Value;
            public bool Focused, Enabled, Password, Big;
            public string State;
            public long Window;
        }

        static List<Found> FindElements(IntPtr window, Rectangle clip, int budget, List<KeyValuePair<Rectangle, string>> texts)
        {
            var list = new List<Found>();
            AutomationElement root;
            try { root = AutomationElement.FromHandle(window); } catch { return list; }
            AutomationElementCollection all;
            using (ElementCache().Activate()) all = root.FindAll(TreeScope.Descendants, InteractiveCondition());
            var winRect = WindowRect(window);
            var visible = Rectangle.Intersect(winRect, clip);
            foreach (AutomationElement e in all)
            {
                if (list.Count >= budget) break;
                var rv = Cached(e, AutomationElement.BoundingRectangleProperty);
                if (rv == null) continue;
                var br = (System.Windows.Rect)rv;
                if (br.IsEmpty || double.IsInfinity(br.Width) || br.Width < 3 || br.Height < 3) continue;
                var rect = new Rectangle((int)Math.Round(br.X), (int)Math.Round(br.Y), (int)Math.Round(br.Width), (int)Math.Round(br.Height));
                var shown = Rectangle.Intersect(rect, visible);
                if (shown.Width < 3 || shown.Height < 3) continue;
                var type = Cached(e, AutomationElement.ControlTypeProperty) as ControlType;
                if (type == ControlType.Text)
                {
                    var words = (Convert.ToString(Cached(e, AutomationElement.NameProperty)) ?? "").Trim();
                    if (words.Length > 0 && words.Length <= 200 && texts.Count < 80) texts.Add(new KeyValuePair<Rectangle, string>(shown, words));
                    continue;
                }
                var f = new Found();
                f.Element = e;
                f.Rect = shown;
                f.Role = RoleName(type);
                f.Name = (Convert.ToString(Cached(e, AutomationElement.NameProperty)) ?? "").Trim();
                if (f.Name.Length == 0) f.Name = (Convert.ToString(Cached(e, AutomationElement.HelpTextProperty)) ?? "").Trim();
                var value = Cached(e, ValuePattern.ValueProperty);
                f.Value = value == null ? null : Convert.ToString(value);
                f.Focused = Convert.ToBoolean(Cached(e, AutomationElement.HasKeyboardFocusProperty) ?? false);
                f.Enabled = Convert.ToBoolean(Cached(e, AutomationElement.IsEnabledProperty) ?? true);
                f.Password = Convert.ToBoolean(Cached(e, AutomationElement.IsPasswordProperty) ?? false);
                if (f.Password) f.Value = null;
                var states = new List<string>();
                var toggle = Cached(e, TogglePattern.ToggleStateProperty);
                if (toggle != null) states.Add((ToggleState)toggle == ToggleState.On ? "checked" : (ToggleState)toggle == ToggleState.Off ? "unchecked" : "mixed");
                var selected = Cached(e, SelectionItemPattern.IsSelectedProperty);
                if (selected != null && Convert.ToBoolean(selected)) states.Add("selected");
                var expand = Cached(e, ExpandCollapsePattern.ExpandCollapseStateProperty);
                if (expand != null && (ExpandCollapseState)expand == ExpandCollapseState.Expanded) states.Add("expanded");
                else if (expand != null && (ExpandCollapseState)expand == ExpandCollapseState.Collapsed) states.Add("collapsed");
                f.State = string.Join(", ", states.ToArray());
                // A box around a whole page or editor hides more than it shows; those get only a number.
                f.Big = (long)shown.Width * shown.Height > (long)visible.Width * visible.Height * 0.4;
                f.Window = window.ToInt64();
                list.Add(f);
            }
            return list;
        }

        /** Popups, menus and dialogs above the foreground window (same app, or menus of any app). */
        static List<IntPtr> PopupsAbove(IntPtr fg, Rectangle clip)
        {
            var list = new List<IntPtr>();
            if (fg == IntPtr.Zero) return list;
            var fgPid = WindowPid(fg);
            foreach (var h in ZOrder())
            {
                if (h == fg || list.Count >= 3) break;
                if (!Native.IsWindowVisible(h) || Cloaked(h) || Native.IsIconic(h)) continue;
                var pid = WindowPid(h);
                if (excluded.Contains(pid)) continue;
                var cls = WindowClass(h);
                if (IsShellWindow(cls) || cls == "tooltips_class32") continue;
                var ex = Native.GetWindowLong(h, GWL_EXSTYLE);
                if ((ex & WS_EX_TRANSPARENT) != 0) continue;
                var rect = WindowRect(h);
                if (rect.Width < 8 || rect.Height < 8 || !rect.IntersectsWith(clip)) continue;
                if (pid == fgPid || cls == "#32768" || cls.Contains("Popup") || cls.Contains("Menu")) list.Add(h);
            }
            return list;
        }

        static object Observe(Dictionary<string, object> r)
        {
            var timer = Stopwatch.StartNew();
            var display = DisplayBounds(Int(r, "display", -1));
            var region = display;
            if (r.ContainsKey("region") && r["region"] != null)
            {
                var g = (Dictionary<string, object>)r["region"];
                region = Rectangle.Intersect(display, new Rectangle(Int(g, "x"), Int(g, "y"), Math.Max(8, Int(g, "w")), Math.Max(8, Int(g, "h"))));
                if (region.Width < 8 || region.Height < 8) throw new HelperError("That area is outside the screen.");
            }
            var maxW = Int(r, "maxWidth", 1280);
            var maxH = Int(r, "maxHeight", 800);
            var maxUpscale = region == display ? 1.0 : 2.0;
            var scale = Math.Min(maxUpscale, Math.Min((double)maxW / region.Width, (double)maxH / region.Height));
            var outW = Math.Max(1, (int)Math.Round(region.Width * scale));
            var outH = Math.Max(1, (int)Math.Round(region.Height * scale));

            var fg = Native.GetForegroundWindow();
            var fgUsable = fg != IntPtr.Zero && !excluded.Contains(WindowPid(fg));
            var elements = new List<Found>();
            var texts = new List<KeyValuePair<Rectangle, string>>();
            var timedOut = false;
            if (Bool(r, "elements", true) && fgUsable)
            {
                var budget = Int(r, "maxElements", 150);
                var popups = PopupsAbove(fg, display);
                elements = WithTimeout(() =>
                {
                    var found = new List<Found>();
                    foreach (var p in popups) found.AddRange(FindElements(p, display, budget - found.Count, texts));
                    if (!IsShellWindow(WindowClass(fg)) || found.Count == 0) found.AddRange(FindElements(fg, display, budget - found.Count, texts));
                    return found;
                }, Int(r, "timeout", 3500), out timedOut) ?? new List<Found>();
            }
            // Reading order: rows about a line tall, then left to right; exact duplicates (a list item and its link) once.
            elements = elements.OrderBy(e => e.Rect.Top / 14).ThenBy(e => e.Rect.Left).ToList();
            var unique = new List<Found>();
            foreach (var e in elements)
            {
                var twin = unique.FirstOrDefault(u => u.Rect == e.Rect);
                if (twin == null) { unique.Add(e); continue; }
                if (twin.Name.Length == 0 && e.Name.Length > 0) unique[unique.IndexOf(twin)] = e;
            }
            elements = unique;
            if (Bool(r, "elements", true)) lastElements = elements.Select(e => e.Element).ToList();
            // Words on screen that are not a control's own label, in reading order, each once.
            var labels = new HashSet<string>(elements.Select(e => e.Name));
            var seenText = new HashSet<string>();
            var screenText = new List<string>();
            // A timed-out search may still be filling `texts` on its own thread: leave it alone then.
            if (!timedOut)
            {
                foreach (var t in texts.OrderBy(t => t.Key.Top / 14).ThenBy(t => t.Key.Left))
                {
                    if (screenText.Count >= 40) break;
                    if (labels.Contains(t.Value) || !seenText.Add(t.Value)) continue;
                    screenText.Add(t.Value);
                }
            }
            var uiaMs = timer.ElapsedMilliseconds;

            string image = null, mime = null;
            if (Bool(r, "image", true))
            {
                using (var shot = new Bitmap(region.Width, region.Height, PixelFormat.Format24bppRgb))
                {
                    using (var g = Graphics.FromImage(shot)) g.CopyFromScreen(region.X, region.Y, 0, 0, region.Size, CopyPixelOperation.SourceCopy);
                    using (var scaled = new Bitmap(outW, outH, PixelFormat.Format24bppRgb))
                    {
                        using (var g = Graphics.FromImage(scaled))
                        {
                            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                            g.DrawImage(shot, new Rectangle(0, 0, outW, outH));
                            if (Bool(r, "marks", true)) DrawMarks(g, elements, region, scale, outW, outH);
                            if (r.ContainsKey("pointer") && r["pointer"] != null)
                            {
                                var p = (Dictionary<string, object>)r["pointer"];
                                DrawPointer(g, (float)((Int(p, "x") - region.X) * scale), (float)((Int(p, "y") - region.Y) * scale));
                            }
                        }
                        image = Encode(scaled, Str(r, "format", "jpeg"), Int(r, "quality", 82), out mime);
                    }
                }
            }

            var list = new List<object>();
            for (int i = 0; i < elements.Count; i++)
            {
                var e = elements[i];
                var item = new Dictionary<string, object> {
                    { "n", i + 1 }, { "role", e.Role }, { "name", e.Name }, { "rect", RectObj(e.Rect.X, e.Rect.Y, e.Rect.Width, e.Rect.Height) },
                    { "focused", e.Focused }, { "enabled", e.Enabled }, { "password", e.Password }, { "window", e.Window },
                };
                if (e.Value != null) item["value"] = e.Value.Length > 300 ? e.Value.Substring(0, 300) : e.Value;
                if (e.State.Length > 0) item["state"] = e.State;
                list.Add(item);
            }
            var cursor = Cursor();
            return new Dictionary<string, object> {
                { "image", image }, { "mime", mime }, { "imageWidth", outW }, { "imageHeight", outH },
                { "region", RectObj(region.X, region.Y, region.Width, region.Height) },
                { "display", RectObj(display.X, display.Y, display.Width, display.Height) },
                { "foreground", fgUsable ? WindowObj(fg, fg) : null },
                { "cellarForeground", fg != IntPtr.Zero && !fgUsable },
                { "windows", Windows(20) },
                { "elements", list }, { "texts", screenText }, { "elementsTimedOut", timedOut },
                { "cursor", Point(cursor.X, cursor.Y) },
                { "uiaMs", uiaMs }, { "totalMs", timer.ElapsedMilliseconds },
            };
        }

        static void DrawMarks(Graphics g, List<Found> elements, Rectangle region, double scale, int outW, int outH)
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
            using (var font = new Font("Segoe UI", 11f, FontStyle.Bold, GraphicsUnit.Pixel))
            {
                for (int i = 0; i < elements.Count; i++)
                {
                    var e = elements[i];
                    var color = Palette[i % Palette.Length];
                    var x = (float)((e.Rect.X - region.X) * scale);
                    var y = (float)((e.Rect.Y - region.Y) * scale);
                    var w = (float)(e.Rect.Width * scale);
                    var h = (float)(e.Rect.Height * scale);
                    if (!e.Big)
                        using (var pen = new Pen(Color.FromArgb(215, color), 1.5f)) g.DrawRectangle(pen, x, y, w, h);
                    var label = (i + 1).ToString();
                    var size = g.MeasureString(label, font);
                    var tw = size.Width + 2;
                    var th = size.Height - 1;
                    // The number sits just above the box's top-left corner, or inside it when there is no room.
                    var tx = Math.Max(0, Math.Min(x, outW - tw));
                    var ty = y - th >= 0 && !e.Big ? y - th : Math.Max(0, Math.Min(y, outH - th));
                    using (var brush = new SolidBrush(color)) g.FillRectangle(brush, tx, ty, tw, th);
                    g.DrawString(label, font, Brushes.White, tx + 1, ty - 1);
                }
            }
        }

        static void DrawPointer(Graphics g, float x, float y)
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using (var pen = new Pen(Color.FromArgb(230, 217, 119, 87), 2.5f))
            {
                g.DrawEllipse(pen, x - 10, y - 10, 20, 20);
                g.DrawLine(pen, x - 15, y, x - 5, y);
                g.DrawLine(pen, x + 5, y, x + 15, y);
                g.DrawLine(pen, x, y - 15, x, y - 5);
                g.DrawLine(pen, x, y + 5, x, y + 15);
            }
        }

        static AutomationElement ElementAt(int n)
        {
            if (n < 1 || n > lastElements.Count) throw new HelperError("There is no element " + n + " on the latest screenshot. Take a new look at the screen.");
            return lastElements[n - 1];
        }

        static object ElementInfo(int n)
        {
            var e = ElementAt(n);
            try
            {
                var br = e.Current.BoundingRectangle;
                if (br.IsEmpty) throw new HelperError("Element " + n + " is no longer on screen. Take a new look at the screen.");
                System.Windows.Point clickable;
                int x, y;
                if (e.TryGetClickablePoint(out clickable) && br.Contains(clickable))
                {
                    x = (int)Math.Round(clickable.X);
                    y = (int)Math.Round(clickable.Y);
                }
                else
                {
                    x = (int)Math.Round(br.X + br.Width / 2);
                    y = (int)Math.Round(br.Y + br.Height / 2);
                }
                var pid = (uint)e.Current.ProcessId;
                return new Dictionary<string, object> {
                    { "x", x }, { "y", y }, { "rect", RectObj((int)br.X, (int)br.Y, (int)br.Width, (int)br.Height) },
                    { "name", e.Current.Name ?? "" }, { "role", RoleName(e.Current.ControlType) }, { "enabled", e.Current.IsEnabled },
                    { "password", e.Current.IsPassword }, { "pid", pid }, { "process", ProcessName(pid) },
                };
            }
            catch (ElementNotAvailableException)
            {
                throw new HelperError("Element " + n + " is gone (the screen changed). Take a new look at the screen.");
            }
        }

        static void FocusElement(int n)
        {
            try { ElementAt(n).SetFocus(); }
            catch (ElementNotAvailableException) { throw new HelperError("Element " + n + " is gone (the screen changed). Take a new look at the screen."); }
            catch (InvalidOperationException) { }
        }

        static object PointInfo(int x, int y)
        {
            var top = TopWindowAt(x, y);
            var root = top == IntPtr.Zero ? IntPtr.Zero : Native.GetAncestor(top, 2);
            if (root == IntPtr.Zero) root = top;
            var pid = root == IntPtr.Zero ? 0u : WindowPid(root);
            var info = new Dictionary<string, object> {
                { "hwnd", root.ToInt64() }, { "pid", pid }, { "process", pid == 0 ? "" : ProcessName(pid) },
                { "title", root == IntPtr.Zero ? "" : WindowTitle(root) }, { "cellar", excluded.Contains(pid) },
            };
            bool timedOut;
            var element = WithTimeout(() =>
            {
                var e = AutomationElement.FromPoint(new System.Windows.Point(x, y));
                return new Dictionary<string, object> { { "name", e.Current.Name ?? "" }, { "role", RoleName(e.Current.ControlType) }, { "password", e.Current.IsPassword } };
            }, 1500, out timedOut);
            if (element != null) info["element"] = element;
            return info;
        }

        static object FocusedInfo()
        {
            var fg = Native.GetForegroundWindow();
            var pid = fg == IntPtr.Zero ? 0u : WindowPid(fg);
            var info = new Dictionary<string, object> {
                { "hwnd", fg.ToInt64() }, { "pid", pid }, { "process", pid == 0 ? "" : ProcessName(pid) },
                { "title", fg == IntPtr.Zero ? "" : WindowTitle(fg) }, { "cellar", excluded.Contains(pid) },
            };
            bool timedOut;
            var element = WithTimeout(() =>
            {
                var e = AutomationElement.FocusedElement;
                if (e == null) return null;
                return new Dictionary<string, object> { { "name", e.Current.Name ?? "" }, { "role", RoleName(e.Current.ControlType) }, { "password", e.Current.IsPassword } };
            }, 1500, out timedOut);
            if (element != null) info["element"] = element;
            return info;
        }

        /** The words on screen in a window: the visible part of its documents, then labels and list text. */
        static object ReadText(IntPtr hwnd, int maxChars, bool all, int timeout)
        {
            if (hwnd == IntPtr.Zero) hwnd = Native.GetForegroundWindow();
            if (hwnd == IntPtr.Zero || excluded.Contains(WindowPid(hwnd))) throw new HelperError("No window to read.");
            bool timedOut;
            var text = WithTimeout(() =>
            {
                var root = AutomationElement.FromHandle(hwnd);
                var sb = new StringBuilder();
                var docs = root.FindAll(TreeScope.Subtree, new AndCondition(
                    new PropertyCondition(AutomationElement.IsTextPatternAvailableProperty, true),
                    new PropertyCondition(AutomationElement.IsOffscreenProperty, false)));
                foreach (AutomationElement d in docs)
                {
                    if (sb.Length >= maxChars) break;
                    try
                    {
                        if (d.Current.IsPassword) continue;
                        var tp = (TextPattern)d.GetCurrentPattern(TextPattern.Pattern);
                        if (all) sb.AppendLine(tp.DocumentRange.GetText(maxChars - sb.Length));
                        else foreach (var range in tp.GetVisibleRanges()) sb.AppendLine(range.GetText(maxChars - sb.Length));
                    }
                    catch { }
                }
                if (sb.Length < maxChars / 2)
                {
                    var cr = new CacheRequest();
                    cr.Add(AutomationElement.NameProperty);
                    cr.Add(AutomationElement.IsPasswordProperty);
                    cr.Add(ValuePattern.ValueProperty);
                    cr.Add(AutomationElement.BoundingRectangleProperty);
                    AutomationElementCollection labels;
                    using (cr.Activate())
                        labels = root.FindAll(TreeScope.Descendants, new AndCondition(
                            new PropertyCondition(AutomationElement.IsOffscreenProperty, false),
                            new OrCondition(
                                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Text),
                                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.ListItem),
                                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.DataItem),
                                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit),
                                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Hyperlink),
                                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Header))));
                    var seen = new HashSet<string>();
                    var rows = new List<KeyValuePair<System.Windows.Rect, string>>();
                    foreach (AutomationElement l in labels)
                    {
                        var name = (Convert.ToString(Cached(l, AutomationElement.NameProperty)) ?? "").Trim();
                        var value = Convert.ToBoolean(Cached(l, AutomationElement.IsPasswordProperty) ?? false) ? null : Convert.ToString(Cached(l, ValuePattern.ValueProperty));
                        var line = value != null && value.Length > 0 && value != name ? (name.Length > 0 ? name + ": " + value : value) : name;
                        if (line.Length == 0 || !seen.Add(line)) continue;
                        var rv = Cached(l, AutomationElement.BoundingRectangleProperty);
                        rows.Add(new KeyValuePair<System.Windows.Rect, string>(rv == null ? System.Windows.Rect.Empty : (System.Windows.Rect)rv, line));
                    }
                    foreach (var row in rows.OrderBy(p => p.Key.IsEmpty ? double.MaxValue : Math.Round(p.Key.Top / 12)).ThenBy(p => p.Key.IsEmpty ? 0 : p.Key.Left))
                    {
                        if (sb.Length >= maxChars) break;
                        sb.AppendLine(row.Value);
                    }
                }
                return sb.ToString();
            }, timeout, out timedOut);
            return new Dictionary<string, object> { { "text", text ?? "" }, { "timedOut", timedOut }, { "title", WindowTitle(hwnd) }, { "process", ProcessName(WindowPid(hwnd)) } };
        }

        // ---------- apps ----------

        static object Apps()
        {
            var list = new List<object>();
            Exception error = null;
            var thread = new Thread(() =>
            {
                try
                {
                    var type = Type.GetTypeFromProgID("Shell.Application");
                    dynamic shell = Activator.CreateInstance(type);
                    dynamic folder = shell.NameSpace("shell:AppsFolder");
                    foreach (dynamic item in folder.Items())
                    {
                        string name = item.Name;
                        string path = item.Path;
                        if (!string.IsNullOrEmpty(name) && !string.IsNullOrEmpty(path)) list.Add(new Dictionary<string, object> { { "name", name }, { "id", path } });
                    }
                }
                catch (Exception e) { error = e; }
            });
            thread.SetApartmentState(ApartmentState.STA);
            thread.Start();
            if (!thread.Join(15000)) throw new HelperError("Listing installed apps took too long.");
            if (error != null) throw error;
            return list;
        }

        // ---------- input ----------

        static Native.POINT Cursor()
        {
            Native.POINT p;
            Native.GetCursorPos(out p);
            return p;
        }

        static void Send(Native.INPUT input)
        {
            Native.SendInput(1, new[] { input }, Marshal.SizeOf(typeof(Native.INPUT)));
        }

        static void MouseFlags(uint flags, uint data = 0)
        {
            var input = new Native.INPUT { type = 0 };
            input.u.mi = new Native.MOUSEINPUT { dwFlags = flags, mouseData = data, dwExtraInfo = Marker };
            Send(input);
        }

        static void MoveAbsolute(int x, int y)
        {
            int vx = Native.GetSystemMetrics(76), vy = Native.GetSystemMetrics(77), vw = Native.GetSystemMetrics(78), vh = Native.GetSystemMetrics(79);
            var input = new Native.INPUT { type = 0 };
            input.u.mi = new Native.MOUSEINPUT {
                dx = (int)Math.Round((x - vx) * 65535.0 / Math.Max(1, vw - 1)),
                dy = (int)Math.Round((y - vy) * 65535.0 / Math.Max(1, vh - 1)),
                dwFlags = 0x0001 | 0x8000 | 0x4000, dwExtraInfo = Marker,
            };
            Send(input);
        }

        /** Glides the pointer there (eased, ~ms long) so the person watching can follow it, and hover effects fire. */
        static void MoveSmooth(int x, int y, int ms)
        {
            var start = Cursor();
            var distance = Math.Sqrt(Math.Pow(x - start.X, 2) + Math.Pow(y - start.Y, 2));
            var steps = distance < 4 ? 1 : Math.Max(4, Math.Min(30, ms / 8));
            for (int i = 1; i <= steps; i++)
            {
                var t = (double)i / steps;
                var e = t < 0.5 ? 2 * t * t : 1 - Math.Pow(-2 * t + 2, 2) / 2;
                MoveAbsolute((int)Math.Round(start.X + (x - start.X) * e), (int)Math.Round(start.Y + (y - start.Y) * e));
                if (steps > 1) Thread.Sleep(8);
            }
            Native.SetCursorPos(x, y);
        }

        static void Button(string button, bool down)
        {
            uint flags;
            switch (button)
            {
                case "right": flags = down ? 0x0008u : 0x0010u; break;
                case "middle": flags = down ? 0x0020u : 0x0040u; break;
                default: flags = down ? 0x0002u : 0x0004u; break;
            }
            MouseFlags(flags);
        }

        static void Click(int x, int y, string button, int count, int ms, List<KeyValuePair<ushort, bool>> hold)
        {
            MoveSmooth(x, y, ms);
            Thread.Sleep(40);
            foreach (var k in hold) SendKey(k.Key, true, k.Value);
            for (int i = 0; i < Math.Max(1, Math.Min(3, count)); i++)
            {
                Button(button, true);
                Thread.Sleep(30);
                Button(button, false);
                if (i < count - 1) Thread.Sleep(60);
            }
            for (int i = hold.Count - 1; i >= 0; i--) SendKey(hold[i].Key, false, hold[i].Value);
        }

        static void Drag(int x1, int y1, int x2, int y2)
        {
            MoveSmooth(x1, y1, 120);
            Thread.Sleep(60);
            Button("left", true);
            Thread.Sleep(80);
            MoveSmooth(x2, y2, 400);
            Thread.Sleep(80);
            Button("left", false);
        }

        static void Scroll(int x, int y, int dx, int dy)
        {
            MoveSmooth(x, y, 100);
            Thread.Sleep(30);
            // One notch at a time, like a wheel turned by hand, so smooth-scrolling views keep up.
            for (int i = 0; i < Math.Abs(dy); i++) { MouseFlags(0x0800, (uint)(dy > 0 ? 120 : -120)); Thread.Sleep(25); }
            for (int i = 0; i < Math.Abs(dx); i++) { MouseFlags(0x01000, (uint)(dx > 0 ? 120 : -120)); Thread.Sleep(25); }
        }

        static void SendKey(ushort vk, bool down, bool extended)
        {
            var input = new Native.INPUT { type = 1 };
            input.u.ki = new Native.KEYBDINPUT {
                wVk = vk, wScan = (ushort)Native.MapVirtualKey(vk, 0),
                dwFlags = (down ? 0u : 0x0002u) | (extended ? 0x0001u : 0u), dwExtraInfo = Marker,
            };
            Send(input);
        }

        static void SendUnicode(char c, bool down)
        {
            var input = new Native.INPUT { type = 1 };
            input.u.ki = new Native.KEYBDINPUT { wVk = 0, wScan = c, dwFlags = 0x0004u | (down ? 0u : 0x0002u), dwExtraInfo = Marker };
            Send(input);
        }

        static void TypeText(string text, int delay)
        {
            foreach (var c in text)
            {
                if (c == '\r') continue;
                if (c == '\n') { SendKey(0x0D, true, false); SendKey(0x0D, false, false); }
                else if (c == '\t') { SendKey(0x09, true, false); SendKey(0x09, false, false); }
                else { SendUnicode(c, true); SendUnicode(c, false); }
                if (delay > 0) Thread.Sleep(delay);
            }
        }

        static void PressCombo(List<KeyValuePair<ushort, bool>> keys, int repeat)
        {
            if (keys.Count == 0) throw new HelperError("No keys to press.");
            for (int r = 0; r < Math.Max(1, Math.Min(50, repeat)); r++)
            {
                foreach (var k in keys) { SendKey(k.Key, true, k.Value); Thread.Sleep(12); }
                for (int i = keys.Count - 1; i >= 0; i--) { SendKey(keys[i].Key, false, keys[i].Value); Thread.Sleep(8); }
                if (repeat > 1) Thread.Sleep(40);
            }
        }
    }
}
