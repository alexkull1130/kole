import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

test("LogSummary is a runnable Kole developer-tool project", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kole-log-summary-"));
  const file = path.join(directory, "app.log");
  fs.writeFileSync(file, "INFO started\nWARN cache miss\nERROR unavailable\nERROR retry failed\n");
  const output = execFileSync(process.execPath, ["src/cli.mjs", "run", "examples/mini-projects/LogSummary.k", file], { encoding: "utf8" });
  assert.deepEqual(output.trim().split(/\r?\n/), ["lines: 4", "errors: 2", "warnings: 1"]);
});
