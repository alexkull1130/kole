# Lifecycle domains

This is the first implementation contract for Kole's native-host direction. A lifecycle domain is an object together with the resources it owns. The owner is responsible for making those resources unusable and closing them in reverse ownership order.

The current language already provides the pieces used by the contract:

- `owns` and `belongsTo` express an object relationship;
- `Closeable` gives a resource a deterministic cleanup operation;
- `using` closes a temporary resource on every exit path;
- non-null types and initialization checking prevent partially initialized objects from being exposed;
- exceptions preserve the original failure and any cleanup failure.

The first host integration rule is intentionally conservative: a host must keep a resource inside its owning object or inside a `using` scope. A callback may capture a resource only while its owner is alive. After cleanup, calls fail with a typed `IOError` or host-specific error rather than operating on a stale handle.

The native embedding API now provides an explicit lifecycle domain and owner-bound callback registration. `kole_domain_close` is idempotent, cancels every subscription owned by the domain, and guarantees that a later `kole_domain_publish` cannot invoke those callbacks. Native bindings expose the same rule through a stable C-compatible host API instead of asking each script to remember cleanup conventions.

## Example boundary

```kole
class Project implements Closeable {
    owns watcher: FileWatcher;
    private closed: bool = false;

    close() -> void {
        if(closed) { return; }
        closed = true;
        watcher.close();
    }
}
```

This example describes the intended host binding shape. `FileWatcher` is a native class supplied by the embedding host; its binding must declare that it is `Closeable` and owned by `Project`. The host must reject a callback that runs after `Project.close()`.

## Planned conformance cases

The implementation will cover construction failure, reverse cleanup order, repeated close, close during exception unwinding, callback use after owner close, ownership transfer, and hot reload replacement of a domain. Each case must be tested in the reference interpreter, native interpreter, and embedding API.
