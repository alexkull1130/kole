# Packages and imports

A file may start with `package pets;` followed by imports, then class/interface declarations. `import pets.Dog;` loads `pets/Dog.k` relative to the source root and brings Dog into this file's scope. The imported file must declare the matching package and class. Use the short imported type name in code. Import dependencies explicitly, including siblings in the same package. Wildcard imports and qualified expressions are not supported yet.

Alternatively, `import "./models.k";` brings all classes/interfaces in that file into scope, relative to the importing file. Dependencies load once; file import cycles are allowed, while inheritance cycles remain errors. Imports are not transitive. Duplicate or ambiguous short names are errors. Packages distinguish types with the same short name. Classes in the same file can see each other. Class declarations currently have public visibility; private access applies to members.

For an entry file without a package, its directory is the source root. For a packaged entry, the loader removes the matching package directories from its path to infer the root. For example, running `src/app/Main.k` with `package app;` uses `src` as the root. No working-directory configuration is required.

The entry class still matches the entry filename. Both `run` and `check` load and validate all imported files; errors identify the actual source file and line. The programmatic `run(source, entry)` helper is for standalone source strings; use `loadProgram(file)`, `Runtime`, and `check` for a file graph.

Try `.\kole.cmd run examples\multifile\Main.k`.
