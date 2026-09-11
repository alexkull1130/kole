interface Printable {
    public describe() -> String;
}

class Point implements Printable {
    private x: int;
    private y: int;
    public Point(x: int, y: int) { me.x = x; me.y = y; }
    public describe() -> String { return "(" + x + ", " + y + ")"; }
}

class Interfaces {
    public static show(value: Printable) -> void { print(value.describe()); }
    public static main() -> void {
        point: Printable = new Point(3, 4);
        show(point);
    }
}
