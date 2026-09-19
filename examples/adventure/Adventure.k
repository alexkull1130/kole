import "World.k";
import "GameState.k";

class Adventure {
    static main(args: string[]) -> void {
        path: string = "coal-mine.save";
        if(args.length > 0) { path = args[0]; }
        game: MineGame(path);
        game.play();
    }
}
class MineGame {
    private world: World();
    private progress: GameState();
    private path: string;

    MineGame(path: string) { me.path = path; }

    play() -> void {
        print("COAL MINE | a tiny adventure written in Kole");
        print("Find a piece of coal and return to the entrance.");
        print("Type help for commands. Use load to resume a saved game.");
        look();
        while(true) {
            Console.write("> ");
            input: string? = Console.readLine();
            if(input == null) { print("Goodbye. Only explicitly saved progress is kept."); return; }
            words: string[] = input.trim().toLowerCase().split(" ");
            parts: List<string>();
            for(i=0:words.length:+) {
                if(!words[i].isEmpty()) { parts.add(words[i]); }
            }
            if(parts.isEmpty()) { continue; }
            command: string = parts.join(" ");
            if(command == "quit") { print("Goodbye. Only explicitly saved progress is kept."); return; }
            try { execute(command); }
            catch(error: Error) { print("Could not complete command: " + error.message); }
        }
    }

    execute(command: string) -> void {
        if(command == "help") {
            print("look | go north/south/east/west | take lamp/key/coal");
            print("use lamp/key | inventory | save | load | help | quit");
        }
        else if(command == "look") { look(); }
        else if(command == "inventory") { inventory(); }
        else if(command == "save") {
            File.writeLines(path, progress.encode());
            print("Saved.");
        }
        else if(command == "load") {
            // Replace live progress only after the whole file has been validated.
            candidate: GameState = GameState.decode(File.readLines(path));
            progress = candidate;
            print("Loaded.");
            look();
        }
        else if(command.startsWith("go ")) { move(command.substring(3, command.length)); }
        else if(command.startsWith("take ")) { take(command.substring(5, command.length)); }
        else if(command.startsWith("use ")) { use(command.substring(4, command.length)); }
        else { print("Unknown command. Type help."); }
    }

    look() -> void {
        room: Room = world.rooms[progress.room];
        print("");
        print(room.title);
        print(room.description);
        exits: List<string>();
        for(i=0:room.exits.length:+) { exits.add(room.exits[i].direction); }
        print("Exits: " + exits.join(", "));
        if(progress.room == 1 && !progress.lamp) { print("A lamp hangs beside the door."); }
        if(progress.room == 2 && !progress.key) { print("A brass key lies beside the tracks."); }
        if(progress.room == 2 && progress.gate) { print("The iron gate stands open."); }
        if(progress.room == 3 && !progress.coal) { print("A loose piece of coal sits on a ledge."); }
        if(progress.room == 0 && progress.coal) {
            print("You escaped with the coal. A small lump, a big beginning. YOU WIN!");
        }
    }

    move(direction: string) -> void {
        destination: int = world.rooms[progress.room].destination(direction);
        if(destination < 0) { print("There is no exit that way."); return; }
        if(destination == 2 && !progress.lit) { print("It is too dark. Find and light a lamp first."); return; }
        if(destination == 3 && !progress.gate) { print("The iron gate is locked. A key might fit."); return; }
        progress.room = destination;
        look();
    }

    take(item: string) -> void {
        if(item == "lamp" && progress.room == 1 && !progress.lamp) {
            progress.lamp = true; print("Taken: lamp."); return;
        }
        if(item == "key" && progress.room == 2 && !progress.key) {
            progress.key = true; print("Taken: brass key."); return;
        }
        if(item == "coal" && progress.room == 3 && !progress.coal) {
            progress.coal = true; print("Taken: coal. Bring it back to the entrance!"); return;
        }
        print("There is no " + item + " here to take.");
    }

    use(item: string) -> void {
        if(item == "lamp" && progress.lamp) {
            progress.lit = true; print("The lamp casts a warm glow."); return;
        }
        if(item == "key" && progress.key && progress.room == 2) {
            progress.gate = true; print("The iron gate swings open."); return;
        }
        print("You cannot use that here.");
    }

    inventory() -> void {
        items: List<string>();
        if(progress.lamp) { items.add("lamp"); }
        if(progress.key) { items.add("brass key"); }
        if(progress.coal) { items.add("coal"); }
        if(items.isEmpty()) { print("Your pockets are empty."); }
        else { print("Carrying: " + items.join(", ")); }
    }
}
