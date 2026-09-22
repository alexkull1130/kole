import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("ownership contract documents the executable relationship and host rules", () => {
  const contract = fs.readFileSync("docs/ownership.md", "utf8");
  assert.match(contract, /only one `owns` field at a time/);
  assert.match(contract, /borrow remains a valid reference after the object is detached/);
  assert.match(contract, /reverse acquisition order/);
  assert.match(contract, /callback cannot be called again/);
});
