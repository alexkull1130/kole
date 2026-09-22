# Ownership, borrowing, and cleanup

This document defines the ownership contract for Kole 0.11.

## Ownership

An `owns` field holds at most one concrete object. A child can occupy only one `owns` field at a time. Assigning it to another owner fails until the previous owner detaches it by assigning `null` or replacing it. Kole updates a matching `belongsTo` field automatically. Programs cannot assign a `belongsTo` field directly.

Ownership graphs cannot contain a cycle. Construction also cannot transfer an object that is still running its constructor.

## Borrowing

Any ordinary variable, parameter, or returned reference to an object is a borrow: it can read or call the object but does not change its owner. A borrow remains a valid reference after the object is detached. Kole does not make an object unusable merely because it has no owner; explicit resource cleanup controls that boundary.

## Destruction and cleanup

Kole objects are garbage-collected by their host runtime. Resources use deterministic cleanup through `Closeable` and `using`. A `using` block calls `close()` on every exit path. An owner that holds several closeable resources must make `close()` idempotent and close them in reverse acquisition order.

At the native boundary, a lifecycle domain owns callbacks, poll-driven tasks, and registered close actions. `kole_domain_close` first prevents later callback or task execution, then invokes close actions once in reverse registration order. Hosts register native resource cleanup with `kole_domain_on_close`. `kole_domain_replace` applies the same closure rule before returning a replacement domain.

## Captures

Kole language references are normal borrows. Native callback captures are different: subscriptions are registered against a lifecycle domain. Once that domain closes, publishes are a safe no-op and the callback cannot be called again. Hosts must not carry live callback, task, or native-resource handles into a replacement domain.
