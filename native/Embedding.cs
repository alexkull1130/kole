using System.Runtime.InteropServices;
using System.Text;

namespace Kole;

/// Stable host boundary. The exported functions intentionally use only C ABI types.
public static unsafe class Embedding
{
    const int ApiVersion = 2;
    sealed class Domain
    {
        public bool Open = true;
        public List<Subscription> Subscriptions = [];
        public List<HostTask> Tasks = [];
        public List<CloseAction> CloseActions = [];
    }
    sealed class Subscription
    {
        public required Domain Owner;
        public IntPtr Callback;
        public IntPtr Context;
        public bool Active = true;
    }
    sealed class HostTask
    {
        public required Domain Owner;
        public IntPtr Work;
        public IntPtr Context;
        public bool Active = true;
    }
    sealed class CloseAction
    {
        public required Domain Owner;
        public IntPtr Callback;
        public IntPtr Context;
        public bool Active = true;
    }
    sealed class Session
    {
        public Runtime? Runtime;
        public string Error = "";
        public IntPtr ErrorPtr;
        public int ErrorCode;
        public IntPtr Output;
        public IntPtr OutputContext;
        public void SetError(string value, int code = 0)
        {
            Error = value;
            ErrorCode = code;
            if (ErrorPtr != IntPtr.Zero) Marshal.FreeCoTaskMem(ErrorPtr);
            ErrorPtr = Marshal.StringToCoTaskMemUTF8(value);
        }
    }

    static Session? Get(IntPtr handle) => handle == IntPtr.Zero ? null : GCHandle.FromIntPtr(handle).Target as Session;
    static Domain? GetDomain(IntPtr handle) => handle == IntPtr.Zero ? null : GCHandle.FromIntPtr(handle).Target as Domain;
    static Subscription? GetSubscription(IntPtr handle) => handle == IntPtr.Zero ? null : GCHandle.FromIntPtr(handle).Target as Subscription;
    static HostTask? GetTask(IntPtr handle) => handle == IntPtr.Zero ? null : GCHandle.FromIntPtr(handle).Target as HostTask;
    static CloseAction? GetCloseAction(IntPtr handle) => handle == IntPtr.Zero ? null : GCHandle.FromIntPtr(handle).Target as CloseAction;
    static IntPtr NewDomain() => GCHandle.ToIntPtr(GCHandle.Alloc(new Domain()));
    static void Close(Domain? domain)
    {
        if (domain is null || !domain.Open) return;
        domain.Open = false;
        foreach (var subscription in domain.Subscriptions) subscription.Active = false;
        domain.Subscriptions.Clear();
        foreach (var task in domain.Tasks) task.Active = false;
        domain.Tasks.Clear();
        for (var i = domain.CloseActions.Count - 1; i >= 0; i--)
        {
            var action = domain.CloseActions[i];
            if (!action.Active) continue;
            action.Active = false;
            ((delegate* unmanaged<IntPtr, void>)action.Callback)(action.Context);
        }
        domain.CloseActions.Clear();
    }
    static void Cancel(Subscription? subscription)
    {
        if (subscription is null) return;
        subscription.Active = false;
        subscription.Owner.Subscriptions.Remove(subscription);
    }

    [UnmanagedCallersOnly(EntryPoint = "kole_runtime_create")]
    public static IntPtr Create() => GCHandle.ToIntPtr(GCHandle.Alloc(new Session()));

    [UnmanagedCallersOnly(EntryPoint = "kole_api_version")]
    public static int Version() => ApiVersion;

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

    [UnmanagedCallersOnly(EntryPoint = "kole_runtime_last_error_code")]
    public static int LastErrorCode(IntPtr handle) => Get(handle)?.ErrorCode ?? 3;

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
            // Runtime adds the standard library and specializes generics once.
            session.Runtime = new Runtime(classes);
            ApplyOutput(session);
            new Checker(session.Runtime).Check();
            session.SetError("");
            return 1;
        }
        catch (Fault error) { session.SetError(error.Message, 1); session.Runtime = null; return 0; }
        catch (Exception error) { session.SetError(error.Message, 2); session.Runtime = null; return 0; }
    }

    [UnmanagedCallersOnly(EntryPoint = "kole_runtime_set_output")]
    public static void SetOutput(IntPtr handle, IntPtr callback, IntPtr context)
    {
        var session = Get(handle);
        if (session is null) return;
        session.Output = callback;
        session.OutputContext = context;
        ApplyOutput(session);
    }

    [UnmanagedCallersOnly(EntryPoint = "kole_runtime_run")]
    public static int Run(IntPtr handle, byte* entry)
        => RunProgram(Get(handle), Marshal.PtrToStringUTF8((IntPtr)entry) ?? "", []);

    [UnmanagedCallersOnly(EntryPoint = "kole_runtime_run_with_args")]
    public static int RunWithArgs(IntPtr handle, byte* entry, int argc, IntPtr* argv)
    {
        var session = Get(handle);
        if (session is null || argc < 0 || argc > 4096) return 0;
        var args = new string[argc];
        for (var i = 0; i < argc; i++) args[i] = Marshal.PtrToStringUTF8(argv[i]) ?? "";
        return RunProgram(session, Marshal.PtrToStringUTF8((IntPtr)entry) ?? "", args);
    }

    [UnmanagedCallersOnly(EntryPoint = "kole_runtime_call_string")]
    public static int CallString(IntPtr handle, byte* className, byte* methodName, byte* value)
    {
        var session = Get(handle);
        if (session?.Runtime is null || className is null || methodName is null || value is null) return 0;
        try
        {
            var name = Marshal.PtrToStringUTF8((IntPtr)className) ?? "";
            var member = Marshal.PtrToStringUTF8((IntPtr)methodName) ?? "";
            if (!session.Runtime.Classes.TryGetValue(name, out var cls) ||
                !cls.Methods.TryGetValue(member, out var method) ||
                !method.Static || method.Access != "public" || method.Type != "void" ||
                method.Params.Count != 1 || method.Params[0].Type != "string")
                throw new Fault($"Host callback requires public static {name}.{member}(value: string) -> void");
            session.Runtime.Invoke(new Method(cls, null, method),
                [Marshal.PtrToStringUTF8((IntPtr)value) ?? ""], method);
            session.SetError("");
            return 1;
        }
        catch (Fault error) { session.SetError(error.Message, 1); return 0; }
        catch (Exception error) { session.SetError(error.Message, 2); return 0; }
    }

    static int RunProgram(Session? session, string entry, string[] args)
    {
        if (session?.Runtime is null) return 0;
        try { session.Runtime.Run(entry, args); session.SetError(""); return 1; }
        catch (Fault error) { session.SetError(error.Message, 1); return 0; }
        catch (Exception error) { session.SetError(error.Message, 2); return 0; }
    }

    // A domain owns its subscriptions. Closing it is idempotent and prevents every later callback.
    [UnmanagedCallersOnly(EntryPoint = "kole_domain_create")]
    public static IntPtr CreateDomain() => NewDomain();

    // Reload replacement is explicit: the old domain is closed before a fresh one is returned.
    // Hosts may migrate compatible state themselves before destroying the old handle.
    [UnmanagedCallersOnly(EntryPoint = "kole_domain_replace")]
    public static IntPtr ReplaceDomain(IntPtr handle)
    {
        if (GetDomain(handle) is null) return IntPtr.Zero;
        Close(GetDomain(handle));
        return NewDomain();
    }

    [UnmanagedCallersOnly(EntryPoint = "kole_domain_close")]
    public static void CloseDomain(IntPtr handle)
    {
        Close(GetDomain(handle));
    }

    [UnmanagedCallersOnly(EntryPoint = "kole_domain_destroy")]
    public static void DestroyDomain(IntPtr handle)
    {
        if (handle == IntPtr.Zero) return;
        Close(GetDomain(handle));
        GCHandle.FromIntPtr(handle).Free();
    }

    // callback and payload are opaque host pointers. Callbacks only run while their owner is open.
    [UnmanagedCallersOnly(EntryPoint = "kole_domain_subscribe")]
    public static IntPtr Subscribe(IntPtr handle, IntPtr callback, IntPtr context)
    {
        var domain = GetDomain(handle);
        if (domain is null || !domain.Open || callback == IntPtr.Zero) return IntPtr.Zero;
        var subscription = new Subscription { Owner = domain, Callback = callback, Context = context };
        domain.Subscriptions.Add(subscription);
        return GCHandle.ToIntPtr(GCHandle.Alloc(subscription));
    }

    [UnmanagedCallersOnly(EntryPoint = "kole_subscription_cancel")]
    public static void CancelSubscription(IntPtr handle)
    {
        Cancel(GetSubscription(handle));
    }

    [UnmanagedCallersOnly(EntryPoint = "kole_subscription_destroy")]
    public static void DestroySubscription(IntPtr handle)
    {
        if (handle == IntPtr.Zero) return;
        Cancel(GetSubscription(handle));
        GCHandle.FromIntPtr(handle).Free();
    }

    [UnmanagedCallersOnly(EntryPoint = "kole_domain_publish")]
    public static void Publish(IntPtr handle, IntPtr payload)
    {
        var domain = GetDomain(handle);
        if (domain is null || !domain.Open) return;
        foreach (var subscription in domain.Subscriptions.ToArray())
            if (subscription.Active)
                ((delegate* unmanaged<IntPtr, IntPtr, void>)subscription.Callback)(subscription.Context, payload);
    }

    // Work returns nonzero when finished. The host drives work with poll, avoiding detached tasks.
    [UnmanagedCallersOnly(EntryPoint = "kole_domain_start_task")]
    public static IntPtr StartTask(IntPtr handle, IntPtr work, IntPtr context)
    {
        var domain = GetDomain(handle);
        if (domain is null || !domain.Open || work == IntPtr.Zero) return IntPtr.Zero;
        var task = new HostTask { Owner = domain, Work = work, Context = context };
        domain.Tasks.Add(task);
        return GCHandle.ToIntPtr(GCHandle.Alloc(task));
    }

    [UnmanagedCallersOnly(EntryPoint = "kole_domain_poll")]
    public static void Poll(IntPtr handle)
    {
        var domain = GetDomain(handle);
        if (domain is null || !domain.Open) return;
        foreach (var task in domain.Tasks.ToArray())
            if (task.Active && ((delegate* unmanaged<IntPtr, int>)task.Work)(task.Context) != 0)
            {
                task.Active = false;
                domain.Tasks.Remove(task);
            }
    }

    [UnmanagedCallersOnly(EntryPoint = "kole_task_cancel")]
    public static void CancelTask(IntPtr handle)
    {
        var task = GetTask(handle);
        if (task is null) return;
        task.Active = false;
        task.Owner.Tasks.Remove(task);
    }

    [UnmanagedCallersOnly(EntryPoint = "kole_task_destroy")]
    public static void DestroyTask(IntPtr handle)
    {
        if (handle == IntPtr.Zero) return;
        CancelTaskInternal(GetTask(handle));
        GCHandle.FromIntPtr(handle).Free();
    }
    static void CancelTaskInternal(HostTask? task)
    {
        if (task is null) return;
        task.Active = false;
        task.Owner.Tasks.Remove(task);
    }

    // Close actions are resource finalizers owned by the domain and execute in reverse registration order.
    [UnmanagedCallersOnly(EntryPoint = "kole_domain_on_close")]
    public static IntPtr OnClose(IntPtr handle, IntPtr callback, IntPtr context)
    {
        var domain = GetDomain(handle);
        if (domain is null || !domain.Open || callback == IntPtr.Zero) return IntPtr.Zero;
        var action = new CloseAction { Owner = domain, Callback = callback, Context = context };
        domain.CloseActions.Add(action);
        return GCHandle.ToIntPtr(GCHandle.Alloc(action));
    }

    [UnmanagedCallersOnly(EntryPoint = "kole_close_action_cancel")]
    public static void CancelCloseAction(IntPtr handle)
    {
        var action = GetCloseAction(handle);
        if (action is null) return;
        action.Active = false;
        action.Owner.CloseActions.Remove(action);
    }

    [UnmanagedCallersOnly(EntryPoint = "kole_close_action_destroy")]
    public static void DestroyCloseAction(IntPtr handle)
    {
        if (handle == IntPtr.Zero) return;
        CancelCloseActionInternal(GetCloseAction(handle));
        GCHandle.FromIntPtr(handle).Free();
    }
    static void CancelCloseActionInternal(CloseAction? action)
    {
        if (action is null) return;
        action.Active = false;
        action.Owner.CloseActions.Remove(action);
    }

    static void ApplyOutput(Session session)
    {
        if (session.Runtime is null) return;
        if (session.Output == IntPtr.Zero) { session.Runtime.Print = Console.WriteLine; return; }
        session.Runtime.Print = text =>
        {
            var utf8 = Marshal.StringToCoTaskMemUTF8(text);
            try { ((delegate* unmanaged<IntPtr, IntPtr, void>)session.Output)(session.OutputContext, utf8); }
            finally { Marshal.FreeCoTaskMem(utf8); }
        };
    }
}
