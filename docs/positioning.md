# Kole's purpose

Kole is an object-oriented scripting language for native applications. It models ownership and object lifecycles directly, so scripts can work with host resources without silently retaining objects that have already ended or leaving cleanup to convention.

## The problem

Native applications expose objects whose lifetimes are more complicated than the scripts that use them: projects own file watchers, scenes own entities, windows own event handlers, and database connections own cursors. In many scripting systems these relationships exist only in documentation and convention. A script can keep a stale reference, forget cleanup, or run a callback after its host object has closed.

Kole makes those relationships part of the program model. Its ownership fields, non-null types, initialization checks, exceptions, and deterministic `using` cleanup are intended to work together at the boundary between a host application and its scripts.

## Positioning

> **Kole is the lifecycle-safe scripting language for native applications, developer tools, and game engines.**

The shorter promise is:

> **Scripts that understand when objects end.**

Kole is designed for the middle ground between quick-to-embed scripting languages and systems languages. It keeps an edit-run workflow and familiar object-oriented structure while making host-object lifetimes visible and enforceable.

This is a product promise, not a claim that Kole replaces Python, Lua, Rust, or C++. Python and Lua have broader ecosystems; Rust and C++ provide lower-level control. Kole's initial advantage is the native host boundary where scripts need both rapid iteration and lifecycle correctness.

## Who should choose Kole

Kole is aimed first at developers building:

- game and simulation engines;
- editors, IDEs, and creative tools;
- desktop applications with plugins;
- build systems and test harnesses;
- automation that manages files, processes, handles, or subscriptions.

The first showcase should be a small native host that exposes projects, file watchers, background work, event subscriptions, and UI panels to a Kole script. Closing the project should clean up its owned resources in a defined order. A callback for a closed resource should fail clearly. The script should still be editable and rerunnable immediately.

## Guarantees to build toward

1. An owned resource cannot outlive its owner without an explicit, checked transfer.
2. Closing an owner cleans up its dependents in documented reverse ownership order.
3. Required fields are initialized before an object can be used.
4. Nullable host state must be checked before access.
5. Native APIs preserve their ownership, nullability, failure, and cleanup metadata when exposed to scripts.

The current implementation already provides pieces of this model: `owns` and `belongsTo` relationships, initialization checking, nullable types, exceptions, `Closeable`, deterministic `using`, and a standalone interpreter. Long-lived ownership domains, safe callback capture, and host integration are the next work needed to make the promise complete.

## Product direction

The standalone interpreter remains the zero-setup playground, CLI runner, and test environment. The flagship product is an embeddable Kole runtime with a stable C-compatible host API. A host should be able to create a runtime, register native classes and functions, declare ownership rules, load or reload a script, call script functions, receive structured exceptions, and destroy a lifecycle domain deterministically.

The VS Code extension should grow toward ownership and lifetime diagnostics, native API completion, exception stack traces, run/debug support, and a view of cleanup order.

## Roadmap priority

1. Specify ownership domains, borrowing, destruction order, captured references, and callback validity.
2. Build the stable C embedding API.
3. Create a native binding generator that carries ownership and nullability metadata.
4. Add owner-bound callbacks, subscriptions, and background tasks.
5. Define hot reload behavior for lifecycle domains.
6. Build the native-host showcase.
7. Expand CLI libraries as a secondary proof point.

Future features should be judged by one question: do they make scripts that control native objects safer, clearer, or easier to build?
