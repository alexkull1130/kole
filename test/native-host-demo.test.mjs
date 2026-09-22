import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("native host demonstration uses the published C boundary", () => {
  const project = fs.readFileSync("native/Kole.Embedding.csproj", "utf8");
  const host = fs.readFileSync("examples/native-host/host.c", "utf8");
  assert.match(project, /<NativeLib>Shared<\/NativeLib>/);
  assert.match(project, /<PublishAot>true<\/PublishAot>/);
  assert.match(host, /#include "\.\.\/\.\.\/include\/kole\.h"/);
  assert.match(host, /kole_domain_close/);
  assert.match(host, /kole_runtime_load/);
  assert.match(host, /kole_runtime_set_output/);
  assert.match(host, /kole_domain_on_close/);
  assert.match(host, /kole_close_action_destroy/);
  assert.match(host, /Kole error %d/);
  assert.match(host, /callbacks == 1/);
});
