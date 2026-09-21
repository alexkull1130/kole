# Kole lifecycle roadmap

This checklist ties the product direction to working artifacts. A checked item has a documented contract, an implementation, and a repeatable verification path.

- [x] **Ownership semantics:** `owns`, `belongsTo`, `Closeable`, `using`, non-null initialization, and reverse cleanup are defined in [lifecycle-domains.md](lifecycle-domains.md) and exercised by `test/lifecycle-domain.test.mjs`.
- [x] **Stable C embedding API (first slice):** `include/kole.h` defines a C ABI for creating, loading/checking, running, reading errors, and destroying a runtime. Exports are implemented in `native/Embedding.cs`.
- [x] **Native binding generator:** `scripts/generate-bindings.mjs` generates Kole declarations and C shims from a host manifest with lifecycle-aware classes.
- [x] **Safe callbacks and event subscriptions:** C host subscriptions are bound to a lifecycle domain; closing the domain cancels them and blocks future event delivery.
- [x] **Structured concurrency:** host tasks are children of a lifecycle domain, driven through `kole_domain_poll`, and cancelled when the domain closes.
- [x] **Hot reload lifecycle policy:** `kole_domain_replace` deliberately closes and replaces a domain; callbacks and tasks never cross the reload boundary.
- [ ] **VS Code ownership diagnostics:** add code actions and diagnostics for escaping owned values, missing `override`, and callbacks that outlive owners.
- [x] **Flagship native-host demonstration (initial):** `examples/LifecycleDomain.k` demonstrates deterministic reverse cleanup and is covered by the lifecycle conformance test.
- [ ] **CLI libraries:** build the first standard library around file/process/network resources and use it as the resource-handling proof case.
- [ ] **Teaching adoption:** publish a tutorial and classroom-sized exercises after the host workflow and CLI libraries are stable.

The unchecked items are sequenced behind the host boundary. The next slices are the binding generator and owner-bound callbacks; both depend on the handle and error conventions in `include/kole.h`.
