# Native host demonstration

This example is a small C host for Kole's lifecycle API. It creates a domain, subscribes a callback, publishes one event, closes the domain, then publishes again. The second publish is a safe no-op because close cancels every domain-owned subscription.

Build the native shared library on Windows:

```powershell
dotnet publish native/Kole.Embedding.csproj -c Release -r win-x64
```

NativeAOT publishing requires Visual Studio's **Desktop development with C++** workload (including the Windows SDK). The project itself can be compiled with `dotnet build` without that workload; the C++ linker is only needed to produce the distributable native library.

Then compile `host.c` with your C compiler, including `include/kole.h` and linking against the generated `kole_embedding.lib`. Running it prints:

```text
callbacks: 1
```

The public boundary is [include/kole.h](../../include/kole.h). Host programs should create a domain for each script-owned resource graph and close or replace it when that graph ends or reloads.

Before using other functions, a host compares `kole_api_version()` with `KOLE_API_VERSION`. A mismatch means the host should stop rather than make assumptions about ABI compatibility.

For script output, pass a `kole_output` callback to `kole_runtime_set_output`. Kole sends each output line to that callback as UTF-8, letting an editor, game console, or application log own the presentation.
