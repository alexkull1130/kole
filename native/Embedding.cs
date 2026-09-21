using System.Runtime.InteropServices;
using System.Text;

namespace Kole;

/// Stable host boundary. The exported functions intentionally use only C ABI types.
public static unsafe class Embedding
{
    sealed class Session
    {
        public Runtime? Runtime;
        public string Error = "";
        public IntPtr ErrorPtr;
        public void SetError(string value)
        {
            Error = value;
            if (ErrorPtr != IntPtr.Zero) Marshal.FreeCoTaskMem(ErrorPtr);
            ErrorPtr = Marshal.StringToCoTaskMemUTF8(value);
        }
    }

    static Session? Get(IntPtr handle) => handle == IntPtr.Zero ? null : GCHandle.FromIntPtr(handle).Target as Session;

    [UnmanagedCallersOnly(EntryPoint = "kole_runtime_create")]
    public static IntPtr Create() => GCHandle.ToIntPtr(GCHandle.Alloc(new Session()));

    [UnmanagedCallersOnly(EntryPoint = "kole_runtime_destroy")]
    public static void Destroy(IntPtr handle)
    {
        if (handle == IntPtr.Zero) return;
        var session = Get(handle);
        if (session is not null && session.ErrorPtr != IntPtr.Zero) Marshal.FreeCoTaskMem(session.ErrorPtr);
        GCHandle.FromIntPtr(handle).Free();
    }

    [UnmanagedCallersOnly(EntryPoint = "kole_runtime_last_error")]
    public static IntPtr LastError(IntPtr handle) => Get(handle)?.ErrorPtr ?? IntPtr.Zero;

    [UnmanagedCallersOnly(EntryPoint = "kole_runtime_load")]
    public static int Load(IntPtr handle, byte* source, byte* file)
    {
        var session = Get(handle);
        if (session is null) return 0;
        try
        {
            var text = Marshal.PtrToStringUTF8((IntPtr)source) ?? "";
            var name = Marshal.PtrToStringUTF8((IntPtr)file) ?? "<embedded>";
            var classes = Parser.Parse(text, name).Classes;
            session.Runtime = new Runtime(Types.Specialize(Standard.With(classes)));
            new Checker(session.Runtime).Check();
            session.SetError("");
            return 1;
        }
        catch (Exception error) { session.SetError(error.Message); session.Runtime = null; return 0; }
    }

    [UnmanagedCallersOnly(EntryPoint = "kole_runtime_run")]
    public static int Run(IntPtr handle, byte* entry)
    {
        var session = Get(handle);
        if (session?.Runtime is null) return 0;
        try { session.Runtime.Run(Marshal.PtrToStringUTF8((IntPtr)entry) ?? "", []); session.SetError(""); return 1; }
        catch (Exception error) { session.SetError(error.Message); return 0; }
    }
}
