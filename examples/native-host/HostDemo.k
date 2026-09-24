class HostDemo {
    static main(args: string[]) -> void {
        Console.writeLine("Kole is hosted: " + args[0]);
    }

    static onChanged(path: string) -> void {
        Console.writeLine("changed: " + path);
    }
}
