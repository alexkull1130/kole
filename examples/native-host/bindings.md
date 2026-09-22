# File watcher binding manifest

`FileWatcher.bindings.json` is a concrete host-binding description for a common developer-tool feature. `HostProject` owns an optional `FileWatcher`; the watcher implements `Closeable` and emits an owner-bound `changed` event.

Generate its declarations from the repository root:

```powershell
node scripts/generate-bindings.mjs examples/native-host/FileWatcher.bindings.json .kole-build/file-watcher-binding
```

The generated `bindings.k` records the ownership shape. The generated `bindings.h` exposes `kole_filewatcher_subscribe_changed`, which takes a lifecycle domain so event delivery stops automatically when the project closes or reloads.

A native host implements the platform-specific watcher and connects the generated event function to `kole_domain_subscribe`. This keeps platform details outside the language while preserving Kole's cleanup rules.
