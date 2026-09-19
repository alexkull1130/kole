class Switches {
    enum Mood { Ready, Waiting }
    static main() -> void {
        command: string = "look";
        answer: string = switch(command) {
            case "look" -> "You see coal.";
            case "quit" -> "Goodbye.";
            default -> "Unknown command.";
        };
        print(answer);
        print(switch(Mood.Ready) { case Mood.Ready -> 1; default -> 0; });
    }
}
