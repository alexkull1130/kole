import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("embedding API publishes one explicit compatibility version", () => {
  const header = fs.readFileSync("include/kole.h", "utf8");
  const implementation = fs.readFileSync("native/Embedding.cs", "utf8");
  assert.match(header, /#define KOLE_API_VERSION 3/);
  assert.match(implementation, /const int ApiVersion = 3/);
  assert.match(header, /int kole_api_version\(void\)/);
  assert.match(implementation, /EntryPoint = "kole_api_version"/);
  assert.match(implementation, /public static int Version\(\) => ApiVersion/);
});
