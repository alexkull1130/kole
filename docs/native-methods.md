# Host-implemented methods: first slice

Kole can declare a public static method implemented by an embedding host:

```kole
class FileWatcher {
    static native start(path: string) -> void;
}

class App {
    static main() -> void {
        FileWatcher.start("project.k");
    }
}
```

The current native method shape is exactly one `string` parameter and a
`void` return. The parser and checker validate calls normally. Running this
program with the standalone interpreter reports that an embedding host is
required.

An embedding host loads the source, then calls
`kole_runtime_bind_string_void(runtime, "FileWatcher", "start", callback,
context)` before running it. Binding fails with a program error if the named
declaration is missing or has an incompatible signature. The callback receives
a borrowed UTF-8 string, valid only for the duration of that call. A nonzero
return means success; zero raises a Kole program error with the method name.
Bindings are cleared by the next `kole_runtime_load`. This API is version 3.

The [native host example](../examples/native-host/README.md) uses this method
to let Kole start a domain-owned file watcher. The host still manages the
watcher's storage, polling, close action, and event subscription. Kole receives
file-change events through `kole_runtime_call_string`. Native instance
construction, instance methods, richer parameters and returns, typed callback
values, and generated executable bindings remain future work.
