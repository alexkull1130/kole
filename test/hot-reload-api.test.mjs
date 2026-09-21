import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("hot reload uses deliberate lifecycle-domain replacement", () => {
  const header = fs.readFileSync("include/kole.h", "utf8");
  const implementation = fs.readFileSync("native/Embedding.cs", "utf8");
  const docs = fs.readFileSync("docs/hot-reload.md", "utf8");
  assert.match(header, /kole_domain_replace/);
  assert.match(implementation, /Close\(GetDomain\(handle\)\)/);
  assert.match(docs, /must never move live callbacks, task handles, or native resource handles/);
});
