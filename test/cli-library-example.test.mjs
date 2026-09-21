import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

test("line-count CLI example closes a TextFile through using", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kole-line-count-"));
  const file = path.join(directory, "input.txt");
  fs.writeFileSync(file, "one\ntwo\nthree\n");
  const output = execFileSync(process.execPath, ["src/cli.mjs", "run", "examples/cli/LineCount.k", file], { encoding: "utf8" });
  assert.equal(output.trim(), "lines: 3");
});
