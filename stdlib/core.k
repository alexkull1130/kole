class Error {
      message: string;
      Error(message: string) { me.message = message; }
    }
    class RuntimeError extends Error { RuntimeError(message: string) { super(message); } }
    class IOError extends Error { IOError(message: string) { super(message); } }
    interface Closeable { close() -> void; }
    class Console {
      static readLine() -> string? { return null; }
      static write(text: string) -> void {}
      static writeLine(text: string) -> void {}
    }
    class File {
      static exists(path: string) -> bool { return false; }
      static readText(path: string) -> string { return ""; }
      static readLines(path: string) -> string[] { return []; }
      static writeText(path: string, text: string) -> void {}
      static appendText(path: string, text: string) -> void {}
      static writeLines(path: string, lines: string[]) -> void {}
      static open(path: string, mode: string) -> TextFile { throw new Error("native"); }
    }
    class TextFile implements Closeable {
      private TextFile() {}
      readLine() -> string? { return null; }
      write(text: string) -> void {}
      writeLine(text: string) -> void {}
      close() -> void {}
      isClosed() -> bool { return false; }
    }
    class Math {
      static abs(value: float) -> float { return 0; }
      static min(a: float, b: float) -> float { return 0; }
      static max(a: float, b: float) -> float { return 0; }
      static floor(value: float) -> float { return 0; }
      static ceil(value: float) -> float { return 0; }
      static round(value: float) -> float { return 0; }
      static sqrt(value: float) -> float { return 0; }
      static pow(value: float, exponent: float) -> float { return 0; }
    }
    class Int { static parse(text: string) -> int { return 0; } }
    class Float { static parse(text: string) -> float { return 0; } }
