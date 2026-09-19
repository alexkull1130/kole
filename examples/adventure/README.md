# Coal Mine

A small text adventure written entirely in Kole. Explore four rooms, find equipment, unlock the coal chamber, and bring a lump of coal back to the entrance.

From the repository folder:

```powershell
.\kole.cmd run examples\adventure\Adventure.k
```

To use a specific save file:

```powershell
.\kole.cmd run examples\adventure\Adventure.k my-adventure.save
```

Save paths are relative to your terminal's current directory. The default is `coal-mine.save`. Saving is explicit: use `save` before leaving, and `load` to resume next time. Starting the game does not overwrite or automatically load an existing save.

## Commands

| Command | Action |
| --- | --- |
| `look` | Describe the current room and its exits |
| `go north` | Travel; also accepts south, east, west |
| `take lamp` | Pick up an item in this room; also key or coal |
| `use lamp` | Light your lamp |
| `use key` | Unlock the gate while standing in the tunnel |
| `inventory` | List carried items |
| `save` / `load` | Save or restore progress |
| `help` | Show available commands |
| `quit` | Leave without an automatic save |

Commands ignore capitalization and repeated spaces. End-of-input exits cleanly. The game remains open after winning, so you can save the completed adventure.

## Project structure

- `Adventure.k`: entry point, command handling, interactions, and game loop.
- `World.k`: rooms and exits as connected objects.
- `GameState.k`: progress plus versioned save serialization and validation.

The game exercises imports, constructors, typed lists, object references, string methods, console input, exceptions, and file APIs. Loading validates a temporary state before replacing live progress. Saving uses Kole's existing atomic file replacement.

## Language notes

This first slice runs on the existing Kole 0.10 executable without interpreter changes. We will add language features when a concrete extension needs them. Command parsing currently normalizes spaces with split/filter/join, and the small save format is explicit line-based text. More complex commands or saved worlds may justify reusable parsing or serialization support later.

## Tests

```powershell
node --test test/adventure.test.mjs
$env:KOLE_TEST_NATIVE = (Resolve-Path .\kole.exe).Path
node --test test/adventure.test.mjs
Remove-Item Env:KOLE_TEST_NATIVE
```

The tests cover a complete adventure across separate saved sessions, movement and item restrictions, invalid save files without loss of live progress, missing files, failed writes, command normalization, and end-of-input.

<details>
<summary>Walkthrough (spoilers)</summary>

```text
go north
take lamp
use lamp
go north
take key
use key
go east
take coal
go west
go south
go south
save
quit
```

</details>
