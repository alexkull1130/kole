class MapsAndSets {
    static main() -> void {
        scores: Map<string,int>();
        scores.set("Alex", 10);
        scores.set("Kole", 20);
        scores.set("Alex", 30);
        print(scores.get("Alex"), scores.keys(), scores.values());
        tags: Set<string>();
        print(tags.add("coal"), tags.add("coal"), tags.toArray());
    }
}
