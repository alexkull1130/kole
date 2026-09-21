import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

test("binding generator emits lifecycle-aware Kole and C declarations", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "kole-bindings-"));
  execFileSync(process.execPath, ["scripts/generate-bindings.mjs", "examples/bindings.json", out], { stdio: "pipe" });
  const kole = fs.readFileSync(path.join(out, "bindings.k"), "utf8");
  const header = fs.readFileSync(path.join(out, "bindings.h"), "utf8");
  assert.match(kole, /native class FileWatcher implements Closeable/);
  assert.match(kole, /native close\(\) -> void/);
  assert.match(header, /kole_filewatcher_close/);
});
