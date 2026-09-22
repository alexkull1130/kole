# Kole for Visual Studio Code

Kole language support provides `.k` file recognition, syntax highlighting, completions, go-to-definition, symbol navigation, and live static diagnostics.

Ownership diagnostics include guidance for `owns` and `belongsTo` relationships: nullable back-references, matching owners, ownership cycles, and attempts to assign a managed back-reference directly.

## Install from a VSIX

Build the extension from the repository root:

```powershell
npm run package:vscode
```

Then use **Extensions: Install from VSIX...** in VS Code and choose `dist/kole-language-0.11.0.vsix`.

The extension works without running a background server. Its language service uses the Kole checker directly, including unsaved open files and their imports.
