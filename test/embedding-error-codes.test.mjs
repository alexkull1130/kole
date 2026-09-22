import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("embedding API exposes structured program and internal error codes", () => {
  const header = fs.readFileSync("include/kole.h", "utf8");
  const implementation = fs.readFileSync("native/Embedding.cs", "utf8");
  assert.match(header, /KOLE_ERROR_PROGRAM = 1/);
  assert.match(header, /KOLE_ERROR_INTERNAL = 2/);
  assert.match(header, /kole_runtime_last_error_code/);
  assert.match(implementation, /catch \(Fault error\) \{ session\.SetError\(error\.Message, 1\)/);
});
