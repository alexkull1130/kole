import pets.Dog;
import pets.Animal;
class Main {
    static main() -> void {
        pet: Animal = new Dog("Rex");
        print(pet.speak());
    }
}
