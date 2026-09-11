import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { run } from '../src/runtime.mjs';

test('all four milestones work together with me and lifecycle methods', () => {
  const output = [];
  run(`interface Described { describe() -> String; }
    class Page implements Described {
      public belongsTo notebook: Notebook?;
      private title: String;
      Page(title: String) { me.title=title; }
      describe() -> String {
        owner: Notebook?=notebook;
        if(owner==null) { return title; }
        return owner.name + ": " + title;
      }
    }
    class Notebook {
      public name: String;
      private owns page: Page?=null;
      enum State { OPEN, CLOSED }
      private state status: State=OPEN;
      Notebook(name: String) { me.name=name; }
      attach(page: Page) -> void requires OPEN { me.page=page; }
      close() -> void transitions OPEN -> CLOSED {}
    }
    class Main {
      static show(value: Described) -> void { print(value.describe()); }
      static main() -> void {
        page: Page=new Page("Design");
        notebook: Notebook=new Notebook("kole");
        notebook.attach(page); notebook.close(); show(page);
      }
    }`, 'Main', { print: line => output.push(line) });
  assert.deepEqual(output, ['kole: Design']);
});

test('new milestone examples pass CLI checking and run', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const expected = {
    Initialization: 'kole', Interfaces: '(3, 4)',
    NullSafety: 'Hello, stranger\nHello, Alex length: 4',
    Relationships: 'Chapter one belongs to Ideas\nChapter one belongs to kole'
  };
  for (const [name, output] of Object.entries(expected)) {
    for (const command of ['check', 'run']) {
      const result = spawnSync(process.execPath, ['src/cli.mjs', command, `examples/${name}.k`], { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      if (command === 'run') assert.equal(result.stdout.trim().replaceAll('\r\n', '\n'), output);
    }
  }
});
