# Kole 0.11 language additions

## Map<A, B> and Set<A>

```kole
scores: Map<string,int>();
scores.set("Alex", 42);
print(scores.get("Alex"));
print(scores.getOrDefault("missing", 0));

tags: Set<string>();
tags.add("coal");
tags.add("coal"); // Already present; returns false.
```

Map methods: `size()`, `isEmpty()`, `containsKey(key)`, `set(key,value)`, `get(key)`, `getOrDefault(key,fallback)`, `remove(key)`, `clear()`, `keys()`, and `values()`. Missing-key `get` throws a catchable Error. `set` returns void; `remove` returns whether a key existed. Keys and values have independent declared types.

Set methods: `size()`, `isEmpty()`, `contains(item)`, `add(item)`, `remove(item)`, `clear()`, `toList()`, and `toArray()`. `add` returns whether the item was new; `remove` returns whether it existed.

Both preserve insertion order. Replacing a map value retains its position; removing and reinserting a key moves it to the end. Equality follows Kole's existing equality rules: values for primitives, identity for objects and collections. Nullable keys, values, or members require nullable type arguments. Generic types remain invariant.

These collections are implemented in Kole's standard library using lists. Lookup, uniqueness checks, and removal are **O(n)**; they are not hash tables. Returned keys, values, lists, and arrays are independent shallow snapshots: modifying the returned container does not modify the original, but contained object references are shared.

## Collection loops

```kole
for(name: names) { print(name); }
for(key: scores) { print(key, scores.get(key)); }
for(tag: tags) { print(tag); }
for(letter: "A😀") { print(letter); }
```

Supported sources are non-null arrays, List, Set, Map, and string. Maps yield keys; strings yield Unicode scalar `char` values. The item type is inferred and the binding cannot be reassigned. The binding is scoped to the loop body. Existing range loops such as `for(i=0:10:+)` remain unchanged.

The source is evaluated once, then copied into a shallow snapshot before iteration. Mutating the source does not alter the current loop's sequence. Object mutations remain visible through shared references. A map key removed during iteration remains in the snapshot; a subsequent `get(key)` will throw. Break, continue, nesting, and return work normally. A loop can execute zero times, so assigning a variable only inside it does not guarantee initialization afterward.

## Switch expressions

```kole
message: string = switch(command) {
    case "look" -> "You see coal.";
    case "quit" -> "Goodbye.";
    default -> "Unknown command.";
};
```

The selector is evaluated once. Cases use literals or enum values and must be unique and comparable to the selector. Exactly one final `default` arm is required, even for bool and enum selectors. This makes every expression produce a value without fallthrough.

Only the selected result expression runs. Every arm is type-checked and must produce a compatible non-void result. A declared target type provides context for literals and arrays; otherwise Kole infers a common assignable type, including numeric widening and nullability. Definite assignment and null facts must hold across all possible arms. Blocks, statement-style switches, patterns, guards, and automatic enum exhaustiveness are not part of this version.

## Const bindings

```kole
const limit: int = 10;
const names: List<string>();
names.add("Alex"); // Allowed: the list contents can change.
```

Const supports local bindings and instance fields, requires an initializer at the declaration, and rejects reassignment, compound assignment, and increment/decrement. It preserves the declared type and does not make referenced objects or collection contents immutable. Const fields are initialized separately for each instance and remain protected through inherited access.

Const is not a method, enum, parameter, lifecycle, or relationship modifier. Delayed initialization in constructors and static fields remain unsupported.

## Diagnostics and editor support

Both CLIs now show the source line and a caret under the reported location, plus an actionable hint for common errors. Imported-file errors show the imported source. Missing or embedded files omit the excerpt. Existing stack traces and nonzero error exit status remain intact.

VS Code 0.11 adds keyword highlighting, Map/Set completion, collection-loop binding completion and definitions, new snippets, and the same fixing hints. The checker still reports the first error per program; multi-error recovery is future work.
