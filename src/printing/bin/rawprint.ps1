param (
    [Parameter(Mandatory=$true)]
    [string]$Action, # "list", "check", "print"
    [string]$PrinterName = "",
    [string]$DocName = "GMK Receipt",
    [string]$InputFile = ""
)

$signature = @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Drawing.Printing;
using System.Text;

public class RawSpooler {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
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

    public static bool PrintBytes(string printer, byte[] bytes, string docName, out string error) {
        error = "";
        IntPtr hPrinter = IntPtr.Zero;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = docName ?? "GMK Receipt";
        di.pDataType = "RAW";

        if (!OpenPrinter(printer, out hPrinter, IntPtr.Zero)) {
            error = "Cannot open printer: " + printer;
            return false;
        }

        try {
            if (!StartDocPrinter(hPrinter, 1, di)) {
                error = "StartDocPrinter failed";
                return false;
            }
            try {
                if (!StartPagePrinter(hPrinter)) {
                    error = "StartPagePrinter failed";
                    return false;
                }
                try {
                    IntPtr pBytes = Marshal.AllocCoTaskMem(bytes.Length);
                    Marshal.Copy(bytes, 0, pBytes, bytes.Length);
                    int written = 0;
                    bool ok = WritePrinter(hPrinter, pBytes, bytes.Length, out written);
                    Marshal.FreeCoTaskMem(pBytes);
                    if (!ok || written != bytes.Length) {
                        error = "WritePrinter failed to write all bytes (" + written + "/" + bytes.Length + ")";
                        return false;
                    }
                    return true;
                } finally {
                    EndPagePrinter(hPrinter);
                }
            } finally {
                EndDocPrinter(hPrinter);
            }
        } finally {
            ClosePrinter(hPrinter);
        }
    }

    public static bool Check(string printer) {
        IntPtr h = IntPtr.Zero;
        bool ok = OpenPrinter(printer, out h, IntPtr.Zero);
        if (ok && h != IntPtr.Zero) {
            ClosePrinter(h);
            return true;
        }
        return false;
    }
}
'@

try {
    Add-Type -TypeDefinition $signature -Language CSharp
} catch {
    # Type might already be loaded in current session
}

if ($Action -eq "list") {
    $printers = [System.Drawing.Printing.PrinterSettings]::InstalledPrinters
    $arr = @()
    foreach ($p in $printers) {
        $arr += "`"$([System.Web.HttpUtility]::JavaScriptStringEncode($p))`""
    }
    Write-Output ("{`"success`":true,`"printers`":[" + ($arr -join ",") + "]}")
    exit 0
}

if ($Action -eq "check") {
    $ok = [RawSpooler]::Check($PrinterName)
    Write-Output "{`"success`":$($ok.ToString().ToLower()),`"printer`":`"$PrinterName`",`"online`":$($ok.ToString().ToLower())}"
    exit 0
}

if ($Action -eq "print") {
    if (-not [System.IO.File]::Exists($InputFile)) {
        Write-Output "{`"success`":false,`"error`":`"Input file not found: $InputFile`"}"
        exit 1
    }
    $bytes = [System.IO.File]::ReadAllBytes($InputFile)
    $err = ""
    $ok = [RawSpooler]::PrintBytes($PrinterName, $bytes, $DocName, [ref]$err)
    if ($ok) {
        Write-Output "{`"success`":true,`"printer`":`"$PrinterName`",`"bytesWritten`":$($bytes.Length)}"
        exit 0
    } else {
        Write-Output "{`"success`":false,`"error`":`"$err`"}"
        exit 1
    }
}

