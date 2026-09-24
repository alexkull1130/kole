class HostDemo {
    static main(args: string[]) -> void {
        Console.writeLine("Kole is hosted: " + args[0]);
        FileWatcher.start("native-host-watch.txt");
    }

    static onChanged(path: string) -> void {
        Console.writeLine("changed: " + path);
    }
}

class FileWatcher {
    static native start(path: string) -> void;
}
