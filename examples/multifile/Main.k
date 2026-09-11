import pets.Dog;
import pets.Animal;
class Main {
    static main() -> void {
        pet: Animal = Dog("Rex");
        print(pet.speak());
    }
}
