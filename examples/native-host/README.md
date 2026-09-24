# Native host demonstration

This example is a small C host for Kole's embedding API. It loads and runs a Kole entry class and receives the script's output through a host callback.

Build the native shared library on Windows:

```powershell
dotnet publish native/Kole.Embedding.csproj -c Release -r win-x64
```

NativeAOT publishing requires Visual Studio's **Desktop development with C++** workload (including the Windows SDK). The project itself can be compiled with `dotnet build` without that workload; the C++ linker is only needed to produce the distributable native library.

The repository's Windows CI workflow publishes the library, compiles this host, and runs it against the resulting DLL.

Then compile `host.c` with your C compiler, including `include/kole.h`. The host loads `kole_embedding.dll` at runtime, so no import library is needed. Running it prints:

```text
script: Kole is hosted: native-host
```

The public boundary is [include/kole.h](../../include/kole.h). Host programs should create a domain for each script-owned resource graph and close or replace it when that graph ends or reloads.

Before using other functions, a host compares `kole_api_version()` with `KOLE_API_VERSION`. A mismatch means the host should stop rather than make assumptions about ABI compatibility.

For script output, pass a `kole_output` callback to `kole_runtime_set_output`. Kole sends each output line to that callback as UTF-8, letting an editor, game console, or application log own the presentation.

Use `kole_runtime_run_with_args` when the entry class declares `main(args: string[])`. The host demo passes its own `native-host` argument into the script.

When `kole_runtime_load` or `kole_runtime_run` returns zero, read both `kole_runtime_last_error_code` and `kole_runtime_last_error`. Program errors are safe script failures; internal errors should be reported to the host's diagnostics. The example shows that error path before it creates the lifecycle domain.

The lifecycle domain functions remain available through the same C API; see [the ownership contract](../../docs/ownership.md) for their cleanup rules.

For a concrete binding description of a closeable, event-driven host resource, see [the file watcher manifest](bindings.md).
