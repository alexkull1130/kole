class LanguageTour {
    static main() -> void {
        const scores: Map<string,int>();
        scores.set("Alex", 42);
        scores.set("Kole", 10);
        const seen: Set<string>();
        for(name: scores) {
            seen.add(name);
            rating: string = switch(scores.get(name)) {
                case 42 -> "excellent";
                default -> "getting started";
            };
            print(name + ": " + rating);
        }
        print("Unique names:", seen.size());
        for(letter: "Kole") { print(letter); }
    }
}
