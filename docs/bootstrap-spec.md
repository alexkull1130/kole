# kole bootstrap specification

Status: executable prototype, version 0.3.0. This document distinguishes implemented behavior from future language goals. `.k`, `name: Type`, `method() -> Type`, `me`, and the explicit `for(i=0:10:+)` form are settled requirements; endpoint and counter rules below are provisional implementation decisions. See [requirements](requirements.md) for the full roadmap and [objects and safety](objects-and-safety.md) for the four new milestones.

## Execution model

The lexer produces tokens with source locations. The parser builds an abstract syntax tree. A declaration-validation pass registers classes, checks duplicate members and declared field/parameter/return types, and validates lifecycle signatures. A static checker then validates every field initializer and method body, including uncalled methods and unreachable statements. The interpreter evaluates the checked tree using kole scopes, instances, calls, and control flow. There is no source translation, Java toolchain, or JVM dependency.

The implementation is hosted by Node.js for bootstrapping. It is not yet a native executable or a machine-code compiler. It does not use JavaScript `eval` or `Function` to execute source programs.

Each source file is self-contained and may contain multiple classes. The entry class matches the file's base name and provides `public static main() -> void` or `public static main(args: String[]) -> void`. Omitted member visibility defaults to public. Classes have one optional constructor named after the class, such as `Point(x: int, y: int) { ... }`, without a return arrow. Constructor and method overloading are not supported. Fields, locals, and parameters use `name: Type`. Legacy type-first declarations remain temporarily accepted for bootstrap compatibility.

## Objects and values

Fields belong to individual objects. Methods can access their own private fields and private methods, including those on other instances of the same class. External classes cannot. `me` names the current object; static methods have no `me`, and `this` is rejected. Nominal interfaces are declared with `interface` and adopted with `implements`. Static fields, inheritance, imports, and packages are not implemented yet.

Variables, fields, parameters, and returns carry declared types. The checker validates names, member access, assignments, call arguments, operators, condition types, and return types and paths before execution. Enum types retain their declaring class identity. Definite assignment checks local reads and requires fields to be initialized on all successful constructor paths. Runtime type and uninitialized-read checks remain as a backstop, including for aliases outside the intraprocedural analysis.

Supported value types are signed 32-bit `int`, finite numeric `double`, `boolean`, `String`, declared classes, interfaces, and enums declared within a class. Array type annotations are parsed, but array creation and mutation are not implemented; the command-line argument array can be read. All types are non-null by default. `Type?` explicitly permits null. Locals and parameters narrow after null guards; nullable field values must be copied to a local snapshot before narrowing. Nullable declarations still require initialization.

Single-object `owns` fields enforce at most one owning slot per child. Matching `belongsTo` references are nullable, read-only, automatically initialized, and maintained on attach, detach, replacement, and transfer. Cycles and duplicate ownership are runtime errors. See [relationship rules](objects-and-safety.md#4-ownership-and-relationships) for validation and construction-failure behavior. Ownership does not free objects or prohibit ordinary aliases.

Arithmetic uses the host's finite numeric representation. Integer literals have static type `int`; decimal literals such as `2.0` have type `double`. `int` can widen to `double`; implicit narrowing is rejected. `/` has static type `double` and performs fractional division, so even assigning `4 / 2` to an `int` is rejected statically. Integer range checks occur at runtime on typed assignment, argument passing, return, and loop bounds; intermediate numeric expressions are not a final specification of integer overflow behavior. Division by zero is an error. Boolean operators require booleans and short circuit at runtime, although the checker inspects both operands. Equality compares compatible scalar values and object identity. String concatenation uses `+` when either operand has type String.

`print(a, b)` writes one line with arguments separated by spaces. String literals support `\n`, `\r`, `\t`, `\"`, and `\\`. Comments use `//` or `/* ... */`.

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
    public send(message: String) -> void requires OPEN {
        require message.length > 0;
        print(message);
    }
}
```

One lifecycle field is permitted per class. It must be private, initialized, and typed as an enum declared in that class. Bare lifecycle enum values such as `CLOSED` are available inside the class; `State.CLOSED` is also accepted.

`requires STATE` checks the receiver's state before the method body. `transitions FROM -> TO` checks the starting state and commits the target state only after successful completion, including a normal `return;`. Transition methods must return void. Static methods and constructors cannot have lifecycle clauses.

Direct assignment to a lifecycle field is forbidden, even within its class. Reentrant transitions on the same object are rejected. Separate aliases refer to the same instance and see the same state.

`require condition;` raises a source-located error if the boolean condition is false. A failed method does not commit its target lifecycle state. Earlier ordinary field mutations and printed output are not rolled back. These are not atomic transactions, and there is no concurrency support yet.

## Diagnostics and limits

CLI language errors use `file.k:line:column: message` and exit with status 1. Usage errors exit with status 2. A default execution budget of one million evaluation steps and a bounded call depth prevent common runaway programs during prototyping. The interpreter is not a security sandbox for hostile input.

`check` validates all initializers and bodies without executing user code. It reports the first error and does not require an entrypoint, allowing library-style source files to be checked. `run` performs the same checks before running the entrypoint. Return-path and definite-assignment analysis are conservative for range loops, which may be empty. Alias-related initialization, ownership conflicts/cycles, arithmetic/index safety, and lifecycle correctness retain runtime checks. Direct low-level `Runtime` use is available for interpreter testing; callers that want preflight checking should use the public `run` helper or call `check` explicitly.

## Not implemented

Ownership collections and explicit inverse selection, atomic blocks, type inference, interprocedural initialization analysis, static lifecycle analysis, immutable-by-default values, data classes, properties, sealed types/pattern matching, generics, inheritance, interface default methods/inheritance, exceptions with user-defined throw/catch, modules, collection libraries, custom loop steps, concurrency, optional memory control, and native code generation. They must not be inferred from the broader design sketches in the README.
