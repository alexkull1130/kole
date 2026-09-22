class LogSummary {
    static main(args: string[]) -> void {
        if(args.length != 1) {
            Console.writeLine("usage: logsummary <log-file>");
            return;
        }
        lines: string[] = File.readLines(args[0]);
        errors: int = 0;
        warnings: int = 0;
        for(line: lines) {
            if(line.contains("ERROR")) { errors++; }
            if(line.contains("WARN")) { warnings++; }
        }
        Console.writeLine("lines: " + lines.length);
        Console.writeLine("errors: " + errors);
        Console.writeLine("warnings: " + warnings);
    }
}
