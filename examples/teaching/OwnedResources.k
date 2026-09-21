class Note implements Closeable {
    name: string;
    closed: bool = false;
    Note(name: string) { me.name = name; }
    close() -> void {
        if(closed) { return; }
        closed = true;
        print("closed " + name);
    }
}

class Project implements Closeable {
    first: Note;
    second: Note;
    closed: bool = false;
    Project() {
        me.first = Note("first");
        me.second = Note("second");
    }
    close() -> void {
        if(closed) { return; }
        closed = true;
        second.close();
        first.close();
    }
    static main() -> void {
        project: Project();
        project.close();
    }
}
