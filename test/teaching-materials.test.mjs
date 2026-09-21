import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

test("teaching resource-owner example runs and lesson links runnable material", () => {
  const output = execFileSync(process.execPath, ["src/cli.mjs", "run", "examples/teaching/OwnedResources.k"], { encoding: "utf8" });
  assert.deepEqual(output.trim().split(/\r?\n/), ["closed second", "closed first"]);
  const lesson = fs.readFileSync("docs/teaching/first-lifecycle-lesson.md", "utf8");
  assert.match(lesson, /examples\/cli\/LineCount\.k/);
  assert.match(lesson, /LifecycleDomain\.k/);
});
