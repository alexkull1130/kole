import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("domains expose reverse-order, one-time native resource cleanup", () => {
  const header = fs.readFileSync("include/kole.h", "utf8");
  const implementation = fs.readFileSync("native/Embedding.cs", "utf8");
  assert.match(header, /kole_domain_on_close/);
  assert.match(header, /kole_close_action_cancel/);
  assert.match(implementation, /for \(var i = domain\.CloseActions\.Count - 1; i >= 0; i--\)/);
  assert.match(implementation, /action\.Active = false/);
});
