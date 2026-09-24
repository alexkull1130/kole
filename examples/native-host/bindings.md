# File watcher binding manifest

`FileWatcher.bindings.json` is a concrete host-binding description for a common developer-tool feature. `HostProject` owns an optional `FileWatcher`; the watcher implements `Closeable` and emits an owner-bound `changed` event.

Generate its declarations from the repository root:

```powershell
node scripts/generate-bindings.mjs examples/native-host/FileWatcher.bindings.json .kole-build/file-watcher-binding
```

The generated `bindings.k` records the ownership shape. The generated `bindings.h` exposes `kole_filewatcher_subscribe_changed`, which takes a lifecycle domain so event delivery stops automatically when the project closes or reloads.

The generator currently writes declarations and C headers, not executable
native class registrations. The [working host demo](README.md) uses a native
polled watcher, `kole_domain_subscribe`, and `kole_runtime_call_string` to
deliver changes to a Kole method. Making `FileWatcher` directly constructible
and callable from Kole is the next binding-generator step.
