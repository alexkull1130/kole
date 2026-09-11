# kole bootstrap specification

Status: executable prototype, version 0.4.0. This document distinguishes implemented behavior from future goals. `.k`, `name: Type`, `method() -> Type`, `me`, and `for(i=0:10:+)` are settled requirements; loop endpoint/counter rules remain provisional. See [requirements](requirements.md), [objects and safety](objects-and-safety.md), and [values and collections](values-and-collections.md).

## Execution model

The lexer produces tokens with source locations. The parser builds an abstract syntax tree. A declaration-validation pass registers classes, checks duplicate members and declared field/parameter/return types, and validates lifecycle signatures. A static checker then validates every field initializer and method body, including uncalled methods and unreachable statements. The interpreter evaluates the checked tree using kole scopes, instances, calls, and control flow. There is no source translation, Java toolchain, or JVM dependency.

The implementation is hosted by Node.js for bootstrapping. It is not yet a native executable or a machine-code compiler. It does not use JavaScript `eval` or `Function` to execute source programs.

Each source file is self-contained and may contain multiple classes. The entry class matches the file's base name and provides `public static main() -> void` or `public static main(args: string[]) -> void`. Omitted member visibility defaults to public. Classes have one optional constructor named after the class, such as `Point(x: int, y: int) { ... }`, without a return arrow. Constructor and method overloading are not supported. Fields, locals, and parameters use `name: Type`. Legacy type-first declarations remain temporarily accepted for bootstrap compatibility.

## Objects and values

Fields belong to individual objects. Methods can access their own private fields and private methods, including those on other instances of the same class. External classes cannot. `me` names the current object; static methods have no `me`, and `this` is rejected. Nominal interfaces are declared with `interface` and adopted with `implements`. Static fields, inheritance, imports, and packages are not implemented yet.

Variables, fields, parameters, and returns carry declared types. The checker validates names, member access, assignments, call arguments, operators, condition types, and return types and paths before execution. Enum types retain their declaring class identity. Definite assignment checks local reads and requires fields to be initialized on all successful constructor paths. Runtime type and uninitialized-read checks remain as a backstop, including for aliases outside the intraprocedural analysis.

Supported types include signed integer widths byte/short/int/long, binary32 float, Unicode scalar char, bool, string, classes, interfaces, enums, mutable fixed-length arrays, and List<A>. The old names boolean, String, and double are rejected. All types are non-null by default; Type? permits null. Locals and parameters narrow after null guards; nullable fields need local snapshots. Nullable declarations still require initialization.

Single-object `owns` fields enforce at most one owning slot per child. Matching `belongsTo` references are nullable, read-only, automatically initialized, and maintained on attach, detach, replacement, and transfer. Cycles and duplicate ownership are runtime errors. See [relationship rules](objects-and-safety.md#4-ownership-and-relationships) for validation and construction-failure behavior. Ownership does not free objects or prohibit ordinary aliases.

Integer arithmetic is exact and range-checked on every intermediate result. byte/short arithmetic promotes to int; long and float take precedence as defined in the numeric specification. Integer division truncates toward zero; float division is fractional. Division by zero and overflow are errors. Explicit conversions and checked compound updates handle narrowing. Float arithmetic rounds to binary32. Boolean operators require bool and short circuit at runtime; the checker inspects both operands. Equality compares compatible scalar values and object identity. String concatenation uses + when either operand is string.

`print(a, b)` writes one line with arguments separated by spaces. String and char literals support escaped whitespace, quotes, backslash, null characters, and Unicode scalar escapes. String indices count Unicode scalars and return char. Comments use // or /* ... */.

## Range loops

```text
for(i=0:10:+) { print(i); }
for(i=10:0:-) { print(i); }
```

- Syntax: `for(counter=start:end:step) { body }`.
- Counter name is explicitly declared; there is no implicit `i`.
- `+` steps by one and `-` steps by negative one. Custom steps are not implemented.
- Start and end expressions are evaluated exactly once, left to right, in the surrounding scope.
- Both bounds must be signed 32-bit integers.
- The endpoint is excluded: the examples visit 0 through 9 and 10 through 1 respectively.
- Equal bounds and directions pointing away from the endpoint produce an empty range.
- The counter is a read-only local binding whose lifetime is the loop. It may shadow an outer binding. Nested loops may use independent names.
- Each iteration receives a fresh body scope. `break`, `continue`, and method `return` work through nested blocks.
- Braces are required. Traditional Java for headers are not supported.

## Lifecycles and contracts

```text
class Connection {
    enum State { CLOSED, OPEN }
    private state status: State = CLOSED;

    public open() -> void transitions CLOSED -> OPEN { }
    public send(message: string) -> void requires OPEN {
        require message.length > 0;
        print(message);
    }
}
```

One lifecycle field is permitted per class. It must be private, initialized, and typed as an enum declared in that class. Bare lifecycle enum values such as `CLOSED` are available inside the class; `State.CLOSED` is also accepted.

`requires STATE` checks the receiver's state before the method body. `transitions FROM -> TO` checks the starting state and commits the target state only after successful completion, including a normal `return;`. Transition methods must return void. Static methods and constructors cannot have lifecycle clauses.

Direct assignment to a lifecycle field is forbidden, even within its class. Reentrant transitions on the same object are rejected. Separate aliases refer to the same instance and see the same state.

`require condition;` raises a source-located error if the bool condition is false. A failed method does not commit its target lifecycle state. Earlier ordinary field mutations and printed output are not rolled back. These are not atomic transactions, and there is no concurrency support yet.

## Diagnostics and limits

CLI language errors use `file.k:line:column: message` and exit with status 1. Usage errors exit with status 2. A default execution budget of one million evaluation steps and a bounded call depth prevent common runaway programs during prototyping. The interpreter is not a security sandbox for hostile input.

`check` validates all initializers and bodies without executing user code. It reports the first error and does not require an entrypoint, allowing library-style source files to be checked. `run` performs the same checks before running the entrypoint. Return-path and definite-assignment analysis are conservative for range loops, which may be empty. Alias-related initialization, ownership conflicts/cycles, arithmetic/index safety, and lifecycle correctness retain runtime checks. Direct low-level `Runtime` use is available for interpreter testing; callers that want preflight checking should use the public `run` helper or call `check` explicitly.

## Not implemented

Ownership collections and explicit inverse selection, atomic blocks, general variable type inference, interprocedural initialization analysis, static lifecycle analysis, immutable-by-default values, data classes, properties, sealed types/pattern matching, user-defined generics, inheritance, interface default methods/inheritance, user-defined exceptions, modules, maps/sets/iterators, custom loop steps, concurrency, optional memory control, and native code generation. Array-literal element inference and built-in List<A> are implemented.
