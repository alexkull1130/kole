public class Point {
    private x: int;
    private y: int;

    public Point(x: int, y: int) {
        me.x = x;
        me.y = y;
    }

    public squaredDistance() -> int {
        return x * x + y * y;
    }

    public static main() -> void {
        point: Point(3, 4);
        print(point.squaredDistance());
    }
}
