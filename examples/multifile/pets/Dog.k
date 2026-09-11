package pets;
import pets.Animal;
class Dog extends Animal {
    Dog(name: string) { super(name); }
    override speak() -> string { return super.label() + " says woof"; }
}
