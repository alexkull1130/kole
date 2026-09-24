# Native host demonstration

This example is a small C host for Kole's embedding API. It loads
[HostDemo.k](HostDemo.k), runs its entry point, and receives output through a
host callback. A native, polled `FileWatcher` reads a local file and publishes
content changes through a lifecycle domain. Each event calls the script's
public static `onChanged(path: string) -> void` handler.
The script starts the watcher by calling its host-implemented
`FileWatcher.start(path: string)` method.

Build the native shared library on Windows:

```powershell
dotnet publish native/Kole.Embedding.csproj -c Release -r win-x64
```

NativeAOT publishing requires Visual Studio's **Desktop development with C++** workload (including the Windows SDK). The project itself can be compiled with `dotnet build` without that workload; the C++ linker is only needed to produce the distributable native library.

The repository's Windows CI workflow publishes the library, compiles this host, and runs it against the resulting DLL.

Then compile `host.c` with your C compiler, including `include/kole.h`.
The host loads `kole_embedding.dll` at runtime, so no import library is
needed. Run `native-host.exe` from the repository root. It prints:

```text
script: Kole is hosted: native-host
script: changed: native-host-watch.txt
script: changed: native-host-watch.txt
```

The public boundary is [include/kole.h](../../include/kole.h). Host programs should create a domain for each script-owned resource graph and close or replace it when that graph ends or reloads.

Before using other functions, a host compares `kole_api_version()` with `KOLE_API_VERSION`. A mismatch means the host should stop rather than make assumptions about ABI compatibility.

For script output, pass a `kole_output` callback to `kole_runtime_set_output`. Kole sends each output line to that callback as UTF-8, letting an editor, game console, or application log own the presentation.

Use `kole_runtime_run_with_args` when the entry class declares `main(args: string[])`. The host demo passes its own `native-host` argument into the script.

When `kole_runtime_load` or `kole_runtime_run` returns zero, read both `kole_runtime_last_error_code` and `kole_runtime_last_error`. Program errors are safe script failures; internal errors should be reported to the host's diagnostics. The example shows that error path before it creates the lifecycle domain.

The host changes the file five times. Only the second and fourth contents
trigger a Kole callback. Replacing the first domain closes its watcher and
subscriptions; closing the replacement stops its watcher too. The host checks
the exact output and exits nonzero if an event arrives after either closure.
Content polling makes this test deterministic in CI; the example does not use
OS file notifications. It removes its temporary file on exit.

`kole_runtime_call_string` is the bridge from a native event to
Kole. It accepts a public static `void` method with exactly one `string`
parameter. A missing or incompatible handler returns zero and sets
`kole_runtime_last_error_code` to `KOLE_ERROR_PROGRAM`. The host owns the
watcher and its domain; the script receives events. See
[the ownership contract](../../docs/ownership.md) for cleanup rules.

`static native start(path: string) -> void;` is implemented by the C host
through `kole_runtime_bind_string_void` after loading the script. The host
creates the watcher in the current lifecycle domain when Kole calls it. See
[host-implemented methods](../../docs/native-methods.md) for the ABI contract
and present signature limits.

For a proposed script-facing class declaration generated from a manifest,
see [the file watcher manifest](bindings.md). Generated declarations are not
yet executable native class bindings; this sample demonstrates the working
static native method and event callback boundary.
