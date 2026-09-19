class GameState {
    room: int = 0;
    lamp: bool = false;
    lit: bool = false;
    key: bool = false;
    gate: bool = false;
    coal: bool = false;

    encode() -> string[] {
        return ["KOLE-MINE-1", string(room), string(lamp), string(lit),
                string(key), string(gate), string(coal)];
    }
    static flag(text: string) -> bool {
        if(text == "true") { return true; }
        if(text == "false") { return false; }
        throw Error("Invalid save flag.");
    }
    static decode(lines: string[]) -> GameState {
        if(lines.length != 7) { throw Error("Invalid save length."); }
        if(lines[0] != "KOLE-MINE-1") { throw Error("Unsupported save format."); }
        candidate: GameState();
        candidate.room = Int.parse(lines[1]);
        candidate.lamp = flag(lines[2]);
        candidate.lit = flag(lines[3]);
        candidate.key = flag(lines[4]);
        candidate.gate = flag(lines[5]);
        candidate.coal = flag(lines[6]);
        if(candidate.room < 0 || candidate.room > 3) { throw Error("Invalid saved room."); }
        if((candidate.lit && !candidate.lamp) ||
           (candidate.key && !candidate.lit) ||
           (candidate.gate && !candidate.key) ||
           (candidate.coal && !candidate.gate) ||
           (candidate.room >= 2 && !candidate.lit) ||
           (candidate.room == 3 && !candidate.gate)) {
            throw Error("Inconsistent save state.");
        }
        return candidate;
    }
}
