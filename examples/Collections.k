class Collections {
    public static main() -> void {
        scores: int[] = [10, 20, 30];
        scores[1] += 5;
        for(i=0:scores.length:+) { print("score", i, scores[i]); }

        // A is the generic parameter; this List supplies string for A.
        names: List<string>();
        names.add("Alex");
        names.add("kole");
        print(names, names.length);
        names.set(1, "Kull");
        print(names.get(0), names.get(1));
        print("removed:", names.removeAt(1));
        names.clear();
        print("empty:", names.isEmpty());
    }
}
