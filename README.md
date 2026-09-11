# kole

kole is a Java-inspired, object-oriented programming language. Its working direction is Java+: familiar classes, interfaces, encapsulation, static typing, generics, and exceptions, extended with explicit object relationships, enforced lifecycles, and built-in contracts.

The agreed syntax, full feature roadmap, optional memory management, and Alex Kull Easter egg are recorded in [requirements](docs/requirements.md).

This folder contains the first working kole interpreter. kole has its own lexer, parser, object model, and execution engine. It does not depend on Java, the JVM, or Java libraries, and does not translate programs into Java or JavaScript.

The bootstrap interpreter is implemented in JavaScript and currently requires Node.js 18 or newer as its host. A native implementation can replace this host later without changing the language design. No external packages are required.

## Run kole

Open a terminal in this folder:

```powershell
.\kole.cmd run examples\Hello.k
.\kole.cmd run examples\Point.k
.\kole.cmd run examples\Connection.k
.\kole.cmd run examples\Order.k
```

On any platform with Node.js:

```text
node src/cli.mjs run examples/Hello.k
node src/cli.mjs check examples/Connection.k
node --test
```

`run` checks the complete program, then executes the public static `main` method in the class matching the file name. It accepts `main() -> void` or `main(args: String[]) -> void`. Arguments after the source path are passed to the program.

`check` validates declarations, field initializers, and every method body without executing the program. It catches unknown names/members, incorrect types and arguments, access violations, invalid assignments, and missing return paths. Initialization, null dereferences, lifecycle state, overflow, and index safety still require runtime checks. Errors identify the `.k` source line and column and return a nonzero exit status.

## Implemented in the bootstrap

- `.k` files, multiple classes in one file, constructors, instance and static methods.
- Distinctive `name: Type` declarations and `method() -> ReturnType` signatures.
- Public/private member access, per-instance fields, `this`, and object references.
- Declared `int`, `double`, `boolean`, `String`, class, and local enum types, with static checking and runtime enforcement.
- Arithmetic, comparisons, boolean short circuiting, assignment, strings, and `print(...)`.
- Explicit range loops, nested loops, `while`, `if`/`else`, `break`, `continue`, and `return`.
- Local enums, private lifecycle fields, method state guards, successful state transitions, and `require` preconditions.
- String length/indexing and reading the entrypoint's argument array.

See [the bootstrap specification](docs/bootstrap-spec.md) for exact behavior and limitations. The remaining sections record the broader language direction; they are not claims that all proposed features exist.

## Core identity

- kole source files use the `.k` extension, for example `Point.k`, `Connection.k`, and `Order.k`.
- Objects own their state and expose changes through methods.
- Lifecycles declare valid states, transitions, and when methods are available.
- Relationships express ownership and associations with defined responsibilities.
- Contracts express preconditions, postconditions, and object invariants.
- Familiar OOP principles with kole's own declaration syntax and range loops.

## Planned language features (not yet implemented)

- Non-null types by default, with explicit nullable types.
- Data classes with generated constructors, equality, and readable printing.
- Sealed types and exhaustive pattern matching.
- Properties with controlled access.
- Stronger static analysis for initialization, null safety, and lifecycle checks where possible. Lifecycle guards currently run at runtime.

## Further candidates

- Immutable values by default; distinguish binding immutability from object immutability.
- Ownership and bidirectional relationship rules.
- Structured concurrency with explicit task lifetimes and cancellation.
- Atomic transitions across an object's lifecycle and owned in-memory state. External side effects require separate semantics and cannot be assumed to roll back.
- Automatic memory management by default, with optional scoped ownership, deterministic cleanup, arenas, and potentially explicit unsafe manual memory operations.

## Illustrative syntax

### Range loops

Range loops explicitly declare their counter using `for(i=0:10:+)`. There is no implicit counter variable. The form is `for(counter=start:end:step)`, with `+` for incrementing by one and `-` for decrementing by one.

```text
for(i=0:10:+) {
    print(i);
}

for(i=10:0:-) {
    print(i);
}

for(row=0:3:+) {
    for(col=0:4:+) {
        print(row, col);
    }
}
```

The bootstrap provisionally excludes the endpoint, evaluates both bounds once from left to right, and uses a read-only counter scoped to the loop. Both bounds must fit signed 32-bit integers. Empty or direction-mismatched ranges execute zero times. Only unit `+` and `-` steps are currently supported. These provisional semantics can be revised as the language design develops.

### Classes

This broader sketch uses accepted declaration syntax. Relationship keywords and generic collections below remain planned; runnable examples are in `examples/`.

```java
public class Order {
    public enum State {
        DRAFT, PLACED, SHIPPED, CANCELLED
    }

    private state status: State = DRAFT;
    private belongsTo customer: Customer;
    private owns items: List<OrderItem> = new List<>();

    public add(item: OrderItem) -> void requires DRAFT {
        items.add(item);
    }

    public place() -> void transitions DRAFT -> PLACED {
        require !items.isEmpty();
    }

    public ship() -> void transitions PLACED -> SHIPPED {
        // Arrange shipment.
    }
}
```

## Next design work

1. Refine the runnable Point, Order, Connection, and loop examples against the intended language design.
2. Extend the new semantic analysis pass with definite-assignment and constructor initialization checking.
3. Define ownership and association consistency before implementing relationship keywords.
4. Design interfaces, inheritance/composition, null safety, data classes, properties, and sealed types.
5. Decide on a native runtime/compiler implementation after stabilizing the core semantics.

Java is a design influence only. Java source compatibility, Java interoperability, and JVM targeting are not requirements for kole.
