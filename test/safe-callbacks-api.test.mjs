import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("C host API exposes owner-bound callback lifecycle", () => {
  const header = fs.readFileSync("include/kole.h", "utf8");
  const implementation = fs.readFileSync("native/Embedding.cs", "utf8");
  assert.match(header, /kole_domain_close/);
  assert.match(header, /kole_domain_subscribe/);
  assert.match(header, /kole_domain_publish/);
  assert.match(implementation, /foreach \(var subscription in domain\.Subscriptions\) subscription\.Active = false/);
  assert.match(implementation, /if \(domain is null \|\| !domain\.Open\) return/);
});
