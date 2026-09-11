# Errors, resources, and standard library

Use `throw Error("message");`, `try { ... } catch(error: Error) { ... } finally { ... }`. Error has a message field; user classes may extend it. Catch clauses match subclasses in source order. Runtime faults (such as overflow, bounds errors, and failed preconditions) can be caught as RuntimeError. File failures are IOError. Static errors, interpreter limits, and internal implementation failures are not recoverable language exceptions. Uncaught errors include Kole call frames.

Finally executes on success, error, return, break, and continue; a return or error from finally replaces the pending outcome. Catch variables are scoped to their handler. Definite-assignment analysis conservatively assumes an exception can occur before any assignment in try; initialize values before try if catch/finally reads them.

`using(file: TextFile = File.open(path, "r")) { ... }` closes the resource at scope exit, including return and failure. Any non-null class implementing Closeable can be used. Nested resources close in reverse order. A failed resource initializer is not closed. The binding is read-only; aliases can still refer to the resource. Close failure propagates unless a body error already exists, in which case the body error remains primary and cleanup errors are retained as suppressed diagnostics. This is deterministic resource cleanup, not manual memory management.

## Console

- `Console.readLine() -> string?`: one UTF-8 input line, null at EOF.
- `Console.write(text: string) -> void` and `Console.writeLine(text: string) -> void`.
- Existing `print(...)` still formats any values.

## Files

- `File.exists(path: string) -> bool`.
- `File.readText(path: string) -> string`, `File.readLines(path: string) -> string[]`.
- `File.writeText(path: string, text: string) -> void`, `File.writeLines(path: string, lines: string[]) -> void`: write a temporary sibling, then replace the destination after a successful write. Existing files are overwritten. This does not provide concurrent-writer coordination.
- `File.appendText(path: string, text: string) -> void`.
- `File.open(path: string, mode: string) -> TextFile`: r reads, w creates/truncates, a appends. Paths are relative to the program's working directory.
- TextFile has `readLine() -> string?`, `write(string)`, `writeLine(string)`, `close()`, and `isClosed() -> bool`. Closing twice is safe; using a closed file throws IOError. Text is UTF-8. Read mode snapshots the file into lines when opened; it is not a streaming reader yet.

## Numbers

Math provides float-based `abs`, `min`, `max`, `floor`, `ceil`, `round`, `sqrt`, and `pow`. Integers widen to float, so large integers may lose precision. Round ties go away from zero. Results must be finite binary32 values.

`Int.parse(string) -> int` and `Float.parse(string) -> float` parse decimal text with optional surrounding whitespace. Invalid or out-of-range input raises RuntimeError. These are separate from numeric conversions, which do not parse text.

## Task manager

Run `.\kole.cmd run examples\tasks\TaskManager.k tasks.txt`. Commands are `add <title>`, `list`, `done <number>`, `remove <number>`, and `quit`. Changes are saved immediately. The tab-separated UTF-8 file stores completion flags and titles; titles cannot contain tabs or line breaks. A failed save restores the in-memory mutation. EOF exits cleanly. The app uses exceptions, nullable console input, collections, files, and scoped cleanup.
