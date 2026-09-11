public class Point {
    private x: int;
    private y: int;

    public Point(x: int, y: int) {
        this.x = x;
        this.y = y;
    }

    public squaredDistance() -> int {
        return x * x + y * y;
    }

    public static main() -> void {
        point: Point = new Point(3, 4);
        print(point.squaredDistance());
    }
}
