# kole requirements

This is the working record of the language direction agreed with Alex Kull. Features marked planned are requirements for the language's evolution, not implemented guarantees.

## Identity and implementation

- Name: **kole**. Source extension: **`.k`**.
- An independent, object-oriented language inspired by Java's principles.
- Its own grammar, type system, object model, and runtime; no Java or JVM dependency.
- Standalone native distribution without a separate Node/Java/Python installation is a requirement. Implemented on Windows with the Native AOT executable; the JavaScript reference implementation remains for development.
- Familiar classes and encapsulation, combined with distinctive syntax, explicit relationships, lifecycles, and contracts.

## Accepted syntax

```text
public class Connection {
    public enum State { CLOSED, OPEN }
    private state status: State = CLOSED;

    public open() -> void transitions CLOSED -> OPEN { }

    public send(message: string) -> void requires OPEN {
        require message.length > 0;
        print(message);
    }

    public static main() -> void {
        connection: Connection();
        connection.open();
        for(i=0:10:+) { connection.send("hello"); }
    }
}
```

- Fields, local variables, and parameters use **`name: Type`**.
- Methods use **`method(parameters) -> ReturnType`**, including `-> void`.
- Constructors retain the class name, use `name: Type` parameters, and have no return arrow.
- Range loops use **`for(i=0:10:+)`** and **`for(i=10:0:-)`**. Counters are explicit; there is no implicit `i`.
- Words such as `requires` and `transitions` describe lifecycle behavior.
- **`me`** refers to the current object; `this` is no longer accepted.
- Primitive names are **byte, short, int, long, float, char, bool, and string**. Do not introduce double; boolean and String are removed names.
- Use **A** as the generic parameter name, as in **List<A>**.
- Endpoint exclusion, read-only loop counters, and unit steps are current provisional rules; custom steps remain a design question.
- Construction: `names: List<string>();` declares and constructs; `names = List<string>();` reassigns. The same forms apply to user classes.
- Earlier type-first bootstrap syntax is temporarily accepted for compatibility. All maintained examples use the new syntax.

## Feature roadmap

| Requirement | Current status |
| --- | --- |
| Classes, constructors, instance/static methods, encapsulation | Implemented for the bootstrap subset |
| Static typing | Initial checker implemented: all bodies, names, members, calls, assignments, returns, access, and operators; runtime checks retained |
| Interfaces | Implemented: nominal adoption, multiple contracts, exact signature checks, and dynamic dispatch |
| Inheritance | Implemented: one parent, required override, abstract classes/methods, super constructors and parent calls |
| Packages and imports | Implemented: qualified type identity, explicit imports, file loading, and source diagnostics |
| Initialization checking | Implemented for local control flow, field initialization order, and successful constructor paths; runtime alias checks retained |
| Primitive numeric system | Implemented: checked widths, exact long, binary32 float, conversions, and integral division |
| Arrays and first collection | Implemented: fixed-length mutable arrays, List<A>, and expressive string/container methods |
| User-defined generics | Implemented for classes/interfaces using A, nested arguments, inheritance, and imports; bounds and generic methods remain planned |
| User-defined exceptions | Implemented: Error subclasses, throw, try/catch/finally, stack traces |
| Lifecycles and valid state transitions | Runtime guards and transitions implemented; compile-time state analysis planned |
| Ownership and object relationships | Implemented for single concrete objects: one owning slot, optional managed back-reference, duplicate/cycle checks, detach/transfer |
| Contracts | `require` preconditions implemented; postconditions and invariants planned |
| Non-null types by default and `Type?` | Implemented, with local/parameter narrowing; fields require local snapshots |
| Immutable values by default | Const local bindings and initialized instance fields implemented; immutability by default remains planned |
| Data classes | Planned constructors, equality, and readable printing |
| Properties with controlled access | Planned |
| Sealed types and exhaustive pattern matching | Planned |
| Structured concurrency | Planned task ownership, lifetimes, and cancellation |
| Atomic transitions | Planned rollback for lifecycle and owned in-memory changes; not arbitrary external side effects |
| Optional memory control | Deterministic using/Closeable resource cleanup implemented; arenas and manual allocation planned |

## Optional memory management

Automatic memory management should be the default for ordinary code, with opt-in explicit control when needed:

1. Scoped ownership and deterministic cleanup for predictable resource lifetimes.
2. Optional arenas to allocate and release groups of objects together.
3. Potential raw pointers and manual allocation/free confined to explicit `unsafe` blocks, if those features are introduced.

References crossing managed, owned, and arena boundaries must have defined lifetime rules. An automatically managed object must not retain a usable reference to freed memory. Ownership and arenas take priority over unrestricted manual allocation. No syntax for these features has been finalized. The current interpreter relies on its host's automatic memory management.

## Alex Kull Easter egg

The hidden command `kole alex` prints:

```text
Every language starts with a name.
This one started with Alex Kull.
```

It is implemented and intentionally omitted from ordinary CLI usage text. It requires no source file and does not change program semantics.

## Implementation milestones

1. **Done:** first direct interpreter, examples, runtime guards, and loop behavior.
2. **Done:** accepted syntax, Easter egg, and initial static checking before `check` and `run`.
3. **Done:** definite-assignment analysis and constructor initialization checking.
4. **Done:** interfaces.
5. **Done:** null safety followed by single-object ownership and automatic back-references.
6. **Done:** renamed types, expanded primitives, defined arithmetic/conversions, and added arrays plus List<A>.
7. **Done:** expressive string, List, and array methods.
8. **Done:** inheritance, required overrides, abstract classes, and super.
9. **Done:** packages/imports and user-defined generic classes/interfaces.
10. **Done:** exceptions, console/files/math, scoped cleanup, and a persistent task manager.
11. **Done:** standalone Windows executable, VS Code support, and concise construction syntax.
12. **Done:** Map/Set, collection loops, switch expressions, const bindings, and improved diagnostics.
13. Expand contracts, value features, optional memory control, and concurrency after their interaction rules are specified.

The precise rules are in [objects and safety](objects-and-safety.md) and [values and collections](values-and-collections.md). Lifecycle correctness, ownership conflicts/cycles, initialization through arbitrary aliases/callbacks, overflow, and index safety retain runtime checks. Static checks do not execute user code and report the first error with a .k source location.
