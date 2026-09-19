class Exit {
    direction: string;
    destination: int;
    Exit(direction: string, destination: int) {
        me.direction = direction;
        me.destination = destination;
    }
}
class Room {
    title: string;
    description: string;
    exits: List<Exit>();
    Room(title: string, description: string) {
        me.title = title;
        me.description = description;
    }
    connect(direction: string, destination: int) -> void {
        exits.add(Exit(direction, destination));
    }
    destination(direction: string) -> int {
        for(i=0:exits.length:+) {
            if(exits[i].direction == direction) { return exits[i].destination; }
        }
        return -1;
    }
}
class World {
    rooms: List<Room>();
    World() {
        rooms.add(Room("Mine entrance", "Cold air rises from the mine. Bring a piece of coal back here."));
        rooms.add(Room("Equipment shed", "Dusty hooks line the wall. A working lamp would be useful."));
        rooms.add(Room("Dark tunnel", "An iron gate blocks the passage east. The shed lies south."));
        rooms.add(Room("Coal chamber", "Black seams glimmer in the lamplight. The tunnel lies west."));
        rooms[0].connect("north", 1);
        rooms[1].connect("south", 0);
        rooms[1].connect("north", 2);
        rooms[2].connect("south", 1);
        rooms[2].connect("east", 3);
        rooms[3].connect("west", 2);
    }
}
