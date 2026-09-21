# First lifecycle lesson

This short lesson introduces classes, cleanup, and exceptions through a useful command-line problem: counting lines in a file.

1. Start with `examples/cli/LineCount.k`. Run it on a small text file.
2. Find the `using` block. Explain that `TextFile` is a resource and `using` guarantees `close()` when the block finishes, returns, or throws.
3. Change the program to count non-empty lines. Keep the file read inside `using`.
4. Deliberately move `file.readLine()` below the block and observe the error. Discuss why the program should not retain a closed resource.
5. Read `examples/LifecycleDomain.k`. Ask learners to identify the owner and why it closes resources in reverse acquisition order.

The intended learning outcome is concrete: learners can write an OOP program that has a clear resource owner, predictable cleanup, and no hidden background work after that owner closes.
