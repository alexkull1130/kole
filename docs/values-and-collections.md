# Values and collections in kole 0.4

## Built-in types

| Type | Definition | Example |
| --- | --- | --- |
| `byte` | Signed 8-bit integer, -128 to 127 | `small: byte = 12;` |
| `short` | Signed 16-bit integer, -32768 to 32767 | `medium: short = 300;` |
| `int` | Signed 32-bit integer | `count: int = 7;` |
| `long` | Exact signed 64-bit integer | `large: long = 9007199254740993L;` |
| `float` | Finite IEEE 754 binary32 value | `price: float = 19.99;` |
| `char` | One Unicode scalar value | `initial: char = 'A';` |
| `bool` | `true` or `false` | `ready: bool = true;` |
| `string` | Immutable text | `name: string = "Alex";` |

`boolean`, `String`, and `double` are removed. Replace them with `bool`, `string`, and `float` respectively. Float is the only floating-point type. All types remain non-null by default; `Type?` permits null. The entrypoint accepts `args: string[]`.

Integer literals fitting int have that type. Larger unsuffixed integers use long; an `L` suffix explicitly selects long. Its range is -9223372036854775808 through 9223372036854775807. Out-of-range literals are source errors. Decimals, exponents, and an optional `f` suffix select float: `1.5`, `1e-3`, `2f`. Signed literals include the minimum signed values.

## Arithmetic and conversions

Integer arithmetic is exact. byte/short arithmetic promotes to int; long wins over other integers; float wins if either operand is float. Float operations round operands and results to binary32. Converting large integers to float may lose precision; underflow may produce zero. Float printing uses a short decimal that round-trips to the same binary32 value.

Every arithmetic result is range-checked, including intermediate results. Overflow raises a source-located error instead of wrapping; non-finite float results are errors. `2147483647 + 1 - 1` fails at the addition. `byte(127) + 1` produces int 128 because byte arithmetic promotes to int.

Integer division truncates toward zero: `7 / 2` is 3; `-7 / 2` is -3. Remainder follows the dividend's sign. Float division is fractional: `7.0 / 2` or `float(7) / 2` is 3.5. Division/remainder by zero and minimum-integer division by -1 are checked errors. Mixed numeric comparisons apply the same promotions; keep both operands integral for exact long comparison.

Implicit widening follows `byte -> short -> int -> long -> float` across assignments, arguments, and returns. Narrowing variables requires conversion. As a convenience, int literals fitting byte or short may be assigned/passed as those types. General constant-expression folding is not implemented.

```text
count: int = 12;
small: byte = byte(count);
whole: int = int(-3.9);       // -3
ratio: float = float(count) / 5;
```

Numeric conversions accept one number or char. Float-to-integer conversion truncates toward zero and checks the destination range. Numeric strings are not parsed. Compound updates `+=`, `-=`, `++`, and `--` convert back to the destination type with checks; integral `+=`/`-=` with float includes truncation. Failed updates leave their destination unchanged.

## Characters and strings

Single quotes create char values; double quotes create strings. A char is one Unicode scalar, not a UTF-16 unit or an entire grapheme cluster. `'😀'` is valid; empty/multiple-scalar chars and surrogate code points are rejected. Both literals support escaped whitespace, quotes, backslash, `\0`, and Unicode scalar escapes such as `\u{1F600}`.

String length and indexing count Unicode scalars. `"A😀B"` has length 3; index 1 is char `'😀'`. Strings are immutable. `int('A')` is 65; `char(65)` and `char("A")` are `'A'`. Char conversion rejects invalid code points and multi-scalar strings. Char ordering compares code points; arithmetic requires numeric conversion.

`string(value)` formats values, including null and collections. `bool(value)` accepts only bool; there is no numeric or string truthiness. `+` concatenates if either operand is string.

## Arrays

```text
scores: int[] = [10, 20, 30];
scores[1] += 5;
for(i=0:scores.length:+) { print(scores[i]); }
empty: int[] = [];
grid: int[][] = [[1, 2], [3, 4]];
```

Arrays have fixed length and mutable elements. Literals use a declared element type from assignment/field/argument/return context when available; otherwise they infer a common element type. Empty and all-null literals need a declared type. Elements evaluate once, left to right. Contextual numeric widening and interface adoption apply during literal construction.

`new int[3]` creates `[0, 0, 0]`. Numeric elements default to zero, bool to false, char to the null character, string to empty text, and nullable elements to null. Non-null object/interface/enum/nested-array/List elements have no default: use initialized literals or nullable elements.

Arrays are invariant: an existing int[] cannot be assigned to long[], and a concrete-class array cannot become an interface array through an alias. Aliases share mutations. Indices must fit int; reads, writes, and updates check bounds. Length is read-only. Nullable containers must be narrowed before access; nullable elements need local snapshots before dereference.

## List<A>

**A** is the generic parameter name. Use concrete types such as `List<int>` or `List<string>` in programs. User-defined generic classes/functions remain future work.

```text
names: List<string> = new List<string>();
names.add("Alex");
names.add("Kull");
print(names.get(0), names[1], names.length);
```

| Member | Behavior |
| --- | --- |
| `length: int` | Read-only element count |
| `add(value: A) -> void` | Append |
| `get(index: int) -> A` | Read |
| `set(index: int, value: A) -> void` | Replace |
| `removeAt(index: int) -> A` | Remove/return an element and shift later indices |
| `clear() -> void` | Remove all elements |
| `isEmpty() -> bool` | Test whether empty |

List indexing supports reads, assignments, and numeric updates. Its constructor takes no arguments. Lists are invariant and can contain nullable/interface values, arrays, or nested Lists. Compact declarations such as `items: List<int>=new List<int>();` are accepted.

Indexed assignment resolves the receiver and index before evaluating the right-hand side, then rechecks bounds before writing in case that evaluation changed the List. Every write checks its element type. Arrays and Lists are capped at 100000 elements in this prototype.

Collections do not imply ownership of their elements. `owns`/`belongsTo` still apply only to single concrete objects. Maps, sets, iterators, resizing arrays, user-defined generics, and ownership of collections remain planned.

## Try it

```powershell
.\kole.cmd run examples\Primitives.k
.\kole.cmd run examples\Collections.k
```

The interpreter still uses Node.js. Standalone native distribution remains separate work.
