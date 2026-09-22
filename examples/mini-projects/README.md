# Log Summary

`LogSummary.k` is a small Kole developer tool. It reads a log file and reports the total line count plus lines containing `ERROR` or `WARN`.

Run it from the repository root:

```powershell
.\kole.cmd run examples\mini-projects\LogSummary.k your-log.txt
```

This project deliberately stays small. It proves argument handling, file input, collection loops, strings, counters, and clear CLI output in one program. As it grows, it should guide the next language features through real needs: filtering, reporting formats, directories, and watch mode.
