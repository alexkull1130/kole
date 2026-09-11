interface Printable {
    public describe() -> string;
}

class Point implements Printable {
    private x: int;
    private y: int;
    public Point(x: int, y: int) { me.x = x; me.y = y; }
    public describe() -> string { return "(" + x + ", " + y + ")"; }
}

class Interfaces {
    public static show(value: Printable) -> void { print(value.describe()); }
    public static main() -> void {
        point: Printable = Point(3, 4);
        show(point);
    }
}
