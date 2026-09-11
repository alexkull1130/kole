package pets;
abstract class Animal {
    private name: string;
    Animal(name: string) { me.name = name; }
    label() -> string { return name; }
    abstract speak() -> string;
}
