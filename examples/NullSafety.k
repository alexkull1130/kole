class NullSafety {
    public static greet(name: String?) -> void {
        if(name == null) {
            print("Hello, stranger");
            return;
        }
        print("Hello, " + name, "length:", name.length);
    }

    public static main() -> void {
        greet(null);
        greet("Alex");
    }
}
