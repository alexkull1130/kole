# Objects and safety in kole

These rules were introduced in 0.3. Examples now use the 0.4 names bool and string. See [values and collections](values-and-collections.md) for primitives, arrays, and List<A>. The prototype still uses Node.js; standalone native distribution remains separate work.

## Current object: me

```text
class Point {
    private x: int;
    public Point(x: int) { me.x = x; }
    public getX() -> int { return me.x; }
}
```

`me` refers to the current instance. It is unavailable in static methods and cannot be redeclared or assigned. The old `this` spelling is rejected with a migration hint. Bare field and method names still resolve against the current instance when not shadowed by a local.

## 1. Initialization checks

Every local must receive a value before it is read, updated, or passed to a call. A declaration without an initializer is allowed, but a subsequent assignment must be guaranteed on the path to each read.

```text
name: string;
if(short) { name = "kole"; }
else { name = "The kole language"; }
print(name);
```

The analysis tracks lexical scopes, branches, early returns, short-circuit evaluation, loop breaks, and assignment order. Range loops may execute zero times, so assigning only inside a range loop does not initialize a variable after the loop. A guaranteed infinite loop with a break is analyzed using its reachable break paths. Checks apply to unused methods as well as the entrypoint.

Field initializers run in declaration order. Every field must be initialized by an initializer or on every successful constructor exit, including `return;`. Classes without a constructor must initialize their fields at declaration. Nullable fields also need initialization; `belongsTo` back-references are the exception because the runtime initializes them to null.

During construction, direct uses of `me` as a value, and calls to its instance methods, are rejected until all fields are initialized. Individual fields that are already initialized can be read; assignment to `me.field` is allowed. Initialization through helper methods is deliberately not inferred: assign fields directly in this first version.

This is intraprocedural analysis, not a proof over arbitrary aliases, callbacks, or external code. Runtime uninitialized-read checks remain a backstop, including for aliases exposed through relationships during construction.

Try `kole run examples/Initialization.k`.

## 2. Interfaces

```text
interface Printable {
    public describe() -> string;
}

class Label implements Printable {
    public describe() -> string { return "kole"; }
}
```

Interfaces contain public instance method signatures ending in `;`. They have no fields, constructors, static methods, default method bodies, or lifecycle restrictions. Classes opt in nominally with `implements I` or `implements I, J`. Having matching methods without declaring `implements` does not establish compatibility.

Each required method must be public and nonstatic, with exactly matching parameter and return types. Parameter names need not match. Implementations cannot add lifecycle guards to an unrestricted interface method. Missing, incompatible, and conflicting requirements are errors before execution.

Interface types are accepted for variables, parameters, fields, returns, and nullable references. Calls dispatch to the object's concrete implementation. An interface-typed reference exposes only the interface's declared methods. Interfaces cannot be instantiated. Class inheritance is implemented; see [inheritance](inheritance.md). Interface inheritance remains planned.

Try `kole run examples/Interfaces.k`.

## 3. Null safety

Types are non-null by default. Add `?` to allow null: `string?`, `Customer?`, `Printable?`, and `int?` are valid. Null is rejected when assigned or passed to a non-null type. There is no implicit default initialization of nullable locals or ordinary fields.

```text
public greet(name: string?) -> void {
    if(name == null) { print("Hello, stranger"); return; }
    print(name.length);
}
```

The checker narrows local variables and parameters after null checks in `if`, `while`, `require`, short-circuit `&&`/`||`, and early-return guards. Assignments and branch/loop joins invalidate facts that no longer hold. Assigning a known non-null value to a nullable local also permits non-null use until that fact is invalidated.

Field references are not smart-cast: aliases or methods can change a field. Read a nullable field into a local snapshot, then check that local:

```text
owner: Notebook? = me.notebook;
if(owner != null) { print(owner.name); }
```

Nullable values cannot be dereferenced, indexed, or used in numeric/bool operations until narrowed. Printing null and comparing to null are allowed. string[]? means a nullable array of non-null strings; string?[] means a non-null array with nullable elements. Arrays and Lists support typed construction and mutation in 0.4. There is no non-null assertion, optional chaining, or null-coalescing operator yet.

Runtime type checks enforce these null rules too. Overflow, bounds errors, and lifecycle guards remain separate runtime concerns.

Try `kole run examples/NullSafety.k`.

## 4. Ownership and relationships

```text
class Page {
    public belongsTo notebook: Notebook?;
}

class Notebook {
    private owns page: Page? = null;
    public attach(page: Page) -> void { me.page = page; }
    public detach() -> void { me.page = null; }
}
```

This first version supports single-object fields with concrete class types. Ownership of collections, interface-typed ownership, and named inverse selection are not implemented.

- `owns` marks an owning field. It may be non-null or nullable, and normal initialization and access rules apply.
- An object has at most one owning field across all owners and slots. Ordinary aliases remain legal.
- `belongsTo` is a runtime-maintained back-reference. Its type must be nullable, and it must have no initializer. Source code cannot assign to it, even from the declaring class.
- A back-reference must have a matching `owns` field in the declared owner class. An owning field may omit a back-reference entirely. More than one candidate back-reference for an owner type is rejected as ambiguous.
- Assigning an owner field updates the matching back-reference automatically. Replacing or clearing it detaches the previous child. Assigning the same child back to the same slot is allowed.
- An already-owned child must be detached before transfer. Two fields of the same parent cannot own the same child. Self-ownership and indirect ownership cycles are rejected.
- Each assignment validates types, ownership, and cycles before changing either link. Rejected assignments preserve existing links.
- Objects still running their constructors cannot be taken as owned children. If an owner's construction fails, its current outgoing ownership links are released and their back-references cleared. This does not roll back unrelated field mutations or side effects.

Ownership here describes exclusive parentage, not exclusive references, manual memory management, or immediate destruction. An ordinary alias remains usable after detachment; the detached child is not freed. The host still manages memory. Arenas, deterministic cleanup, raw pointers, and `unsafe` remain planned.

Try `kole run examples/Relationships.k`.

On Windows from the project folder, use `.\kole.cmd` in place of `kole` in these commands.
