# User-defined generics

Declare a generic class with `class Box<A>` or an interface with `interface Value<A>`. A is the standard first type parameter; additional parameters can use B, C, and so on, as in `Pair<A,B>`. Type arguments are explicit: `Box<int>`, `Box<string>`, and `Box<int>(42)`. Constructor names remain `Box(...)`, without a type argument list in the declaration.

```text
interface Value<A> { get() -> A; }
class Box<A> implements Value<A> {
    private item: A;
    Box(item: A) { me.item = item; }
    get() -> A { return item; }
    set(item: A) -> void { me.item = item; }
}
```

Parameters may appear in fields, constructor and method signatures, arrays, Lists, nullable types, nested generic arguments, `extends`, and `implements`. Generic classes can be abstract and use `override` and `super` normally. Import a generic declaration by its simple class name (`import models.Box;`), then supply type arguments at each use.

Type arguments retain their identities: `Box<int>` is distinct from `Box<long>` and assignments between them are rejected. The ordinary inheritance and implemented-interface relationships still apply—for example, `Box<int>` above implements `Value<int>`. Collections remain invariant too. Nullable arguments such as `Box<string?>` are supported.

Generic bodies are checked even when never used, with an opaque type representing each parameter. An unconstrained A supports storing/passing/returning values, compatible equality, string formatting, and use in other generic containers. Numeric operations and arbitrary member calls on A are rejected. You cannot construct `A()` or default-initialize non-null `new A[n]`; use constructor arguments, initialized literals, or nullable element arrays.

The interpreter creates distinct checked specializations of generic declarations. Recursive references such as `Link<A>?` are supported; expanding recursion such as `Grow<List<A>>` is bounded. Prototype limits are 256 specializations and 32 levels of nested type resolution, including the opaque forms used for checking. Errors retain the declaration's source location.

Generic method-specific parameters, bounds/constraints, variance, wildcards, type-argument inference, and qualified generic static calls are not implemented. Generic class instance methods can use their class's parameters.

Try `.\kole.cmd run examples\Generics.k`.
