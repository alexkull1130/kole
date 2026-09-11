class Generics {
    static main() -> void {
        numbers: Box<int>(42);
        names: List<Box<string>>();
        names.add(Box<string>("Alex"));
        names.add(Box<string>("Kull"));
        print(numbers.get());
        for(i=0:names.length:+) { print(names[i].get()); }
        source: Value<string> = names.first();
        print(source.get().toUpperCase());
    }
}
interface Value<A> {
    get() -> A;
}
class Box<A> implements Value<A> {
    private item: A;
    Box(item: A) { me.item = item; }
    get() -> A { return item; }
    set(item: A) -> void { me.item = item; }
}
