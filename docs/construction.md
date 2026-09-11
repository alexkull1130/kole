# Construction

Declare and construct in one expression:

```kole
names: List<string>();
person: Person("Alex");
box: Box<int>(42);
```

The colon declares the binding and its type. Constructor arguments immediately follow that type. This works for local variables and instance fields.

Reassignment uses an ordinary constructor expression:

```kole
names = List<string>();
person = Person("Kull");
```

Constructor expressions also work as arguments, return values, and initializers with a different declared type, such as `animal: Animal = Dog();`. Class names are resolved by scope, without capitalization rules. A local or method with the same name takes precedence in ordinary calls. Generic constructor expressions use explicit type arguments.

Constructors retain their existing type, visibility, initialization, and abstract-class checks. Primitive values still use ordinary initializers, such as `count: int = 0;`; primitive conversion calls such as `int(value)` retain their meaning. Arrays use literals or the existing `new int[3]` allocation syntax.

Existing `new Person(...)` and `new List<string>()` remain accepted for compatibility.
