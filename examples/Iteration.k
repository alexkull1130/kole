class Iteration {
    static main() -> void {
        names: List<string>(); names.add("Alex"); names.add("Kole");
        for(name: names) { print(name); names.add("later"); }
        for(letter: "A😀") { print(letter); }
        scores: Map<string,int>(); scores.set("Alex", 42);
        for(key: scores) { print(key, scores.get(key)); }
        unique: Set<int>(); unique.add(1); unique.add(1); unique.add(2);
        for(item: unique) { if(item == 1) { continue; } print(item); break; }
    }
}
