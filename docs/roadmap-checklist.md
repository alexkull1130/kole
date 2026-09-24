# Kole lifecycle roadmap

This checklist ties the product direction to working artifacts. A checked item has a documented contract, an implementation, and a repeatable verification path.

- [x] **Ownership semantics:** exact ownership, borrowing, cleanup, and capture rules are defined in [ownership.md](ownership.md), with lifecycle behavior exercised by `test/lifecycle-domain.test.mjs`.
- [x] **Stable C embedding API (first slice):** `include/kole.h` defines a C ABI for creating, loading/checking, running, reading errors, and destroying a runtime. Exports are implemented in `native/Embedding.cs`.
- [x] **Native binding generator:** `scripts/generate-bindings.mjs` generates Kole declarations and C shims from a host manifest with lifecycle-aware classes, ownership fields, and owner-bound event subscriptions.
- [x] **Safe callbacks and event subscriptions:** C host subscriptions are bound to a lifecycle domain; closing the domain cancels them and blocks future event delivery.
- [x] **Structured concurrency:** host tasks are children of a lifecycle domain, driven through `kole_domain_poll`, and cancelled when the domain closes.
- [x] **Hot reload lifecycle policy:** `kole_domain_replace` deliberately closes and replaces a domain; callbacks and tasks never cross the reload boundary.
- [x] **VS Code ownership diagnostics:** relationship failures include editor hints for nullable back-references, matching owners, ambiguity, cycles, and safe ownership updates.
- [x] **Flagship native-host demonstration:** `examples/native-host` is a C host that builds against the NativeAOT shared library, sends polled file changes into a Kole handler, and proves callbacks stop on domain replacement and close.
- [x] **CLI libraries:** `Console`, `File`, and `TextFile` provide the first resource-safe CLI library; `LineCount.k` proves deterministic streaming cleanup with `using`.
- [x] **Teaching adoption:** the first lifecycle lesson, five classroom-sized exercises, and a runnable owned-resource example are published under `docs/teaching`.

The original ten-item checklist is complete. The next host-boundary work is
turning generated native class declarations into executable bindings, with
host methods callable from Kole and checked ownership metadata.
