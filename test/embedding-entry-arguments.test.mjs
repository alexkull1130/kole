import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("embedded entry points accept host-provided string arguments", () => {
  const header = fs.readFileSync("include/kole.h", "utf8");
  const implementation = fs.readFileSync("native/Embedding.cs", "utf8");
  const host = fs.readFileSync("examples/native-host/host.c", "utf8");
  assert.match(header, /kole_runtime_run_with_args/);
  assert.match(implementation, /EntryPoint = "kole_runtime_run_with_args"/);
  assert.match(implementation, /argc > 4096/);
  assert.match(host, /kole_runtime_run_with_args/);
});
