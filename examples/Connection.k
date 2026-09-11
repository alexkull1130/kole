public class Connection {
    public enum State { CLOSED, OPEN }
    private state status: State = CLOSED;

    public open() -> void transitions CLOSED -> OPEN {
        print("Opening connection");
    }

    public send(message: string) -> void requires OPEN {
        require message.length > 0;
        print("Sending:", message);
    }

    public close() -> void transitions OPEN -> CLOSED {
        print("Closing connection");
    }

    public static main() -> void {
        connection: Connection();
        connection.open();
        connection.send("Hello, kole");
        connection.close();
    }
}
