# Inheritance and abstract classes

Kole supports one parent class with `class Dog extends Animal`, public instance method overriding, abstract classes/methods, and `super` alongside `me`. Classes may also implement multiple interfaces. A subclass value can be assigned to its parent or inherited interfaces. Instance calls dispatch using the actual object's class.

Use `override` whenever replacing an inherited method, including an abstract method. Parameters, return type, visibility, and lifecycle clauses must match exactly. Private/static methods cannot be overridden. Fields and enums cannot be shadowed. Constructors are not inherited. Cycles are rejected. Protected access and overloads remain future work.

An `abstract class` cannot be instantiated. Its `abstract method() -> Type;` declarations have no body and require implementation in a concrete subclass. An abstract class may defer interface implementation. `super.method()` calls the parent's implementation directly; it cannot call an abstract method. `super` is only a parent access expression, not a value to store or pass.

`super(arguments);` must be the first statement of a subclass constructor. If omitted, a zero-argument parent constructor is invoked automatically. Explicit arguments cannot access the current instance. Parent construction finishes before subclass field initializers, then the subclass constructor body executes. Private parent constructors cannot be invoked by subclasses. Every class must initialize its own fields on all successful constructor paths.

Inherited methods keep their declaring class's private access. Existing initialization rules remain in force; runtime checks also reject instance calls while any field of the actual object remains uninitialized. This protects against a parent constructor dispatching into a subclass before its field initializers run.

Try `.\kole.cmd run examples\Inheritance.k`.
