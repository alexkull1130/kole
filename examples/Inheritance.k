class Inheritance {
    static main() -> void {
        pet: Animal = new Dog("Rex");
        print(pet.speak());
    }
}
abstract class Animal {
    private name: string;
    Animal(name: string) { me.name = name; }
    label() -> string { return name; }
    abstract speak() -> string;
}
class Dog extends Animal {
    Dog(name: string) { super(name); }
    override speak() -> string { return super.label() + " says woof"; }
}
