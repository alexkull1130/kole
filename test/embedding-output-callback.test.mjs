import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("embedding API lets the host receive script output", () => {
  const header = fs.readFileSync("include/kole.h", "utf8");
  const implementation = fs.readFileSync("native/Embedding.cs", "utf8");
  assert.match(header, /typedef void \(\*kole_output\)\(void\* context, const char\* text\)/);
  assert.match(header, /kole_runtime_set_output/);
  assert.match(implementation, /EntryPoint = "kole_runtime_set_output"/);
  assert.match(implementation, /Marshal\.StringToCoTaskMemUTF8/);
});
