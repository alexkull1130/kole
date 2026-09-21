# CLI libraries and resource handling

Kole's first CLI library surface is intentionally small: `Console`, `File`, `TextFile`, `Error`, `IOError`, and `Closeable`. It proves the lifecycle model against a real resource boundary before adding wider process or network APIs.

`File.readText` and `File.writeText` handle simple whole-file work. For streaming work, `File.open` returns a `TextFile`, which implements `Closeable`. Put it inside `using` so the file closes on normal completion, an early return, or an exception.

Run the line-count example with:

```powershell
.\kole.cmd run examples\cli\LineCount.k your-file.txt
```

The file handle exists only inside the `using` body. This is the library-level proof that Kole's resource rule is useful in ordinary command-line programs, not only native-host integrations.
