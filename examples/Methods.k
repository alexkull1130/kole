class Methods {
    static main() -> void {
        name: string = "  Alex Kull  ";
        print(name.trim().toUpperCase());
        words: string[] = name.trim().split(" ");
        names: List<string> = words.toList();
        names.insert(1, "built");
        names.add("kole");
        print(names.join(" "));
        print(names.contains("kole"), names.slice(1, 3));
    }
}
