import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("C host API exposes owner-bound, poll-driven tasks", () => {
  const header = fs.readFileSync("include/kole.h", "utf8");
  const implementation = fs.readFileSync("native/Embedding.cs", "utf8");
  assert.match(header, /kole_domain_start_task/);
  assert.match(header, /kole_domain_poll/);
  assert.match(header, /kole_task_cancel/);
  assert.match(implementation, /foreach \(var task in domain\.Tasks\) task\.Active = false/);
});
