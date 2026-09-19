# Standalone interpreter

The native implementation is in `native/`, written in C#. It contains Kole's lexer, parser, module loader, generic specialization, type checker, initialization analysis, object runtime, standard library, and CLI. It does not embed JavaScript or launch Node. The shared standard declarations are in `stdlib/core.k`.

Windows releases are built with .NET Native AOT to produce `kole.exe`. Users need only the executable and their `.k` files; the SDK and C++ tools are build-time requirements. The executable interprets Kole programs; compiling individual `.k` applications into separate machine-code executables remains future work.

## Build and verify

Developers can build and run the implementation with the .NET 10 SDK:

```powershell
dotnet build native/Kole.csproj
dotnet native/bin/Debug/net10.0/kole.dll run examples/Generics.k
```

On Windows with the Native AOT prerequisites installed:

```powershell
dotnet publish native/Kole.csproj -c Release -r win-x64 -p:PublishAot=true -o dist
.\dist\kole.exe run examples\tasks\TaskManager.k tasks.txt
```

The Native Windows GitHub workflow builds and tests the native executable and uploads the `kole-windows-x64` artifact. Actions are pinned to verified commits. It runs the checked-in 441-case corpus of accepted/rejected programs and runtime outputs, plus native task persistence, console input, modules, and file cleanup tests. This corpus was captured from the bootstrap tests; new language features must update both implementations and extend conformance coverage.

The JavaScript bootstrap remains available for development and regression testing. Its test suite uses Node, but the shipped native interpreter does not.
