class LineCount {
    static main(args: string[]) -> void {
        if(args.length != 1) {
            Console.writeLine("usage: linecount <file>");
            return;
        }
        count: int = 0;
        using(file: TextFile = File.open(args[0], "r")) {
            line: string? = file.readLine();
            while(line != null) {
                count++;
                line = file.readLine();
            }
        }
        Console.writeLine("lines: " + count);
    }
}
