import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

test("file watcher manifest generates ownership-aware host declarations", () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "kole-watcher-binding-"));
  execFileSync(process.execPath, ["scripts/generate-bindings.mjs", "examples/native-host/FileWatcher.bindings.json", output]);
  const kole = fs.readFileSync(path.join(output, "bindings.k"), "utf8");
  const header = fs.readFileSync(path.join(output, "bindings.h"), "utf8");
  assert.match(kole, /owns watcher: FileWatcher\?;/);
  assert.match(kole, /FileWatcher implements Closeable/);
  assert.match(header, /kole_filewatcher_subscribe_changed/);
  assert.match(header, /void\* domain/);
});
