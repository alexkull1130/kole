class Primitives {
    public static main() -> void {
        small: byte = 12;
        medium: short = 300;
        count: int = 7;
        exact: long = 9007199254740993L;
        price: float = 19.99;
        initial: char = 'A';
        ready: bool = true;
        language: string = "kole";

        print(language, ready, initial);
        print(small, medium, exact + 2L, price);
        print("integer division:", count / 2);
        print("float division:", float(count) / 2);
        print("explicit conversion:", byte(count), int(initial));
    }
}
