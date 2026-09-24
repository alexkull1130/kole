# Kole adoption roadmap

Kole's reason to exist is lifecycle-safe scripting for native applications.
This prioritized list records the ten capabilities to build toward. A checked
item requires a runnable implementation and end-to-end verification, not only a
declaration or design.

1. [ ] **Executable native class bindings:** construct and call host objects
   from Kole. The first slice now binds checked static string-to-void methods;
   instance construction, methods, and generated registration remain.
2. [ ] **Typed callbacks and lambdas:** subscribe from Kole, with the
   subscription tied to an owner's lifetime.
3. [ ] **Ownership of collections:** an owner can hold and clean up many
   children through collections such as `owns List<A>`.
4. [ ] **Compile-time lifecycle checks:** report provably invalid calls and
   references escaping their owners before execution.
5. [ ] **Kole-level structured concurrency:** cancellable script tasks belong
   to a project, scene, or other lifecycle owner.
6. [ ] **Explicit hot-reload state migration:** preserve compatible values
   without carrying native handles or old callbacks into the new domain.
7. [ ] **Richer C-boundary values:** typed numbers, booleans, strings,
   collections, objects, and errors in both directions.
8. [ ] **Script capabilities and limits:** hosts grant specific APIs and set
   execution and memory budgets.
9. [ ] **Ownership-aware debugging:** stepping, exception traces, and a view
   of resource owners and subscriptions.
10. [ ] **Cross-platform project workflow:** native builds on Windows, macOS,
    and Linux, plus repeatable dependencies, testing, and distribution.

The first implementation sequence is native methods, then richer boundary
values, then script-defined callbacks. Each step should preserve Kole's
standalone interpreter and lifecycle rules.
