import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'examples', 'LifecycleDomain.k');

function runWith(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout.replaceAll('\r\n', '\n');
}

test('lifecycle domains close resources in reverse order and tolerate repeated close', () => {
  const expected = 'closed worker\nclosed watcher\ndomain closed\n';
  assert.equal(runWith(process.execPath, [path.join(root, 'src/cli.mjs'), 'run', source]), expected);
  const native = process.env.KOLE_TEST_NATIVE;
  if (native) {
    const args = native.endsWith('.dll') ? [native, 'run', source] : ['run', source];
    assert.equal(runWith(native.endsWith('.dll') ? 'dotnet' : native, args), expected);
  }
});

test('lifecycle contract documentation is shipped with the example', () => {
  const docs = fs.readFileSync(path.join(root, 'docs', 'lifecycle-domains.md'), 'utf8');
  assert.match(docs, /reverse ownership order/);
  assert.match(docs, /callback/);
  assert.match(docs, /C-compatible host API/);
});
