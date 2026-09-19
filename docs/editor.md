# VS Code

Install the repository release's `kole-language-0.11.0.vsix` using VS Code's Extensions menu, **Install from VSIX**. Reload an existing window after an update.

The extension supplies .k syntax highlighting, snippets, inline type and syntax errors, completion for typed values and members, hover information, document symbols, and go-to-definition. Open the Kole program folder so imports can be indexed. Unsaved file changes participate in diagnostics; validation never runs your program.

The extension bundles the reference parser and checker and uses VS Code's own runtime. You do not need to install Node to use it. Run programs with the separate standalone `kole.exe`.

This first version reports the first checker error per program, indexes up to 300 workspace source files, and skips files larger than 1 MB. Completion for complex chained expressions is still limited.

Developers can package it with `node scripts/package-vscode.mjs`. Language-service tests run with `node --test`; `vscode/smoke.cjs` additionally verifies completion, definitions, and unsaved diagnostics inside a VS Code extension test host.

Version 0.11 includes Map/Set methods, collection-loop bindings, const/switch highlighting and snippets, and diagnostic hints.
