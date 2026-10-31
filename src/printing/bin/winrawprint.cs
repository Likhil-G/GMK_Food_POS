using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using System.Drawing.Printing;

namespace GMK.Printing
{
    class Program
    {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
        public class DOCINFOA
        {
            [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
            [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
            [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
        }

        [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

        [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool ClosePrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

        [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool EndDocPrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool StartPagePrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool EndPagePrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

        static int Main(string[] args)
        {
            if (args.Length == 0 || args[0] == "--help" || args[0] == "-h")
            {
                Console.WriteLine("Usage: winrawprint.exe <command> [options]");
                Console.WriteLine("  winrawprint.exe --list");
                Console.WriteLine("  winrawprint.exe --check \"<Printer Name>\"");
                Console.WriteLine("  winrawprint.exe --print \"<Printer Name>\" [\"<Doc Name>\"] [\"<FilePath>\"]");
                Console.WriteLine("  (If FilePath omitted, reads raw binary from standard input)");
                return 0;
            }

            try
            {
                string command = args[0].ToLowerInvariant();

                if (command == "--list")
                {
                    StringBuilder sb = new StringBuilder();
                    sb.Append("[");
                    bool first = true;
                    foreach (string printer in PrinterSettings.InstalledPrinters)
                    {
                        if (!first) sb.Append(",");
                        first = false;
                        sb.Append("\"" + EscapeJson(printer) + "\"");
                    }
                    sb.Append("]");
                    Console.WriteLine("{\"success\":true,\"printers\":" + sb.ToString() + "}");
                    return 0;
                }

                if (command == "--check")
                {
                    if (args.Length < 2)
                    {
                        Console.WriteLine("{\"success\":false,\"error\":\"Printer name required for --check\"}");
                        return 1;
                    }
                    string printerName = args[1];
                    IntPtr hPrinter = IntPtr.Zero;
                    bool ok = OpenPrinter(printerName, out hPrinter, IntPtr.Zero);
                    if (ok && hPrinter != IntPtr.Zero)
                    {
                        ClosePrinter(hPrinter);
                        Console.WriteLine("{\"success\":true,\"printer\":\"" + EscapeJson(printerName) + "\",\"online\":true}");
                        return 0;
                    }
                    else
                    {
                        int err = Marshal.GetLastWin32Error();
                        Console.WriteLine("{\"success\":false,\"printer\":\"" + EscapeJson(printerName) + "\",\"online\":false,\"errorCode\":" + err + "}");
                        return 1;
                    }
                }

                if (command == "--print")
                {
                    if (args.Length < 2)
                    {
                        Console.WriteLine("{\"success\":false,\"error\":\"Printer name required for --print\"}");
                        return 1;
                    }

                    string printerName = args[1];
                    string docName = (args.Length >= 3 && !string.IsNullOrEmpty(args[2])) ? args[2] : "GMK Receipt";
                    byte[] data = null;

                    if (args.Length >= 4 && File.Exists(args[3]))
                    {
                        data = File.ReadAllBytes(args[3]);
                    }
                    else
                    {
                        using (MemoryStream ms = new MemoryStream())
                        {
                            using (Stream stdin = Console.OpenStandardInput())
                            {
                                stdin.CopyTo(ms);
                            }
                            data = ms.ToArray();
                        }
                    }

                    if (data == null || data.Length == 0)
                    {
                        Console.WriteLine("{\"success\":false,\"error\":\"No print data provided (0 bytes)\"}");
                        return 1;
                    }

                    IntPtr hPrinter = IntPtr.Zero;
                    DOCINFOA di = new DOCINFOA();
                    di.pDocName = docName;
                    di.pDataType = "RAW";

                    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
                    {
                        int err = Marshal.GetLastWin32Error();
                        Console.WriteLine("{\"success\":false,\"error\":\"Failed to open printer: " + EscapeJson(printerName) + "\",\"errorCode\":" + err + "}");
                        return 1;
                    }

                    try
                    {
                        if (!StartDocPrinter(hPrinter, 1, di))
                        {
                            int err = Marshal.GetLastWin32Error();
                            Console.WriteLine("{\"success\":false,\"error\":\"StartDocPrinter failed\",\"errorCode\":" + err + "}");
                            return 2;
                        }

                        try
                        {
                            if (!StartPagePrinter(hPrinter))
                            {
                                int err = Marshal.GetLastWin32Error();
                                Console.WriteLine("{\"success\":false,\"error\":\"StartPagePrinter failed\",\"errorCode\":" + err + "}");
                                return 3;
                            }

                            try
                            {
                                IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(data.Length);
                                Marshal.Copy(data, 0, pUnmanagedBytes, data.Length);
                                int dwWritten = 0;
                                bool ok = WritePrinter(hPrinter, pUnmanagedBytes, data.Length, out dwWritten);
                                Marshal.FreeCoTaskMem(pUnmanagedBytes);

                                if (!ok || dwWritten != data.Length)
                                {
                                    int err = Marshal.GetLastWin32Error();
                                    Console.WriteLine("{\"success\":false,\"error\":\"WritePrinter failed\",\"bytesWritten\":" + dwWritten + ",\"expected\":" + data.Length + ",\"errorCode\":" + err + "}");
                                    return 4;
                                }

                                Console.WriteLine("{\"success\":true,\"printer\":\"" + EscapeJson(printerName) + "\",\"bytesWritten\":" + dwWritten + "}");
                                return 0;
                            }
                            finally
                            {
                                EndPagePrinter(hPrinter);
                            }
                        }
                        finally
                        {
                            EndDocPrinter(hPrinter);
                        }
                    }
                    finally
                    {
                        ClosePrinter(hPrinter);
                    }
                }

                Console.WriteLine("{\"success\":false,\"error\":\"Unknown command: " + EscapeJson(command) + "\"}");
                return 1;
            }
            catch (Exception ex)
            {
                Console.WriteLine("{\"success\":false,\"error\":\"" + EscapeJson(ex.Message) + "\"}");
                return 99;
            }
        }

        static string EscapeJson(string s)
        {
            if (s == null) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r");
        }
    }
}

