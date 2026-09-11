import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { run } from '../src/runtime.mjs';

test('all four milestones work together with me and lifecycle methods', () => {
  const output = [];
  run(`interface Described { describe() -> string; }
    class Page implements Described {
      public belongsTo notebook: Notebook?;
      private title: string;
      Page(title: string) { me.title=title; }
      describe() -> string {
        owner: Notebook?=notebook;
        if(owner==null) { return title; }
        return owner.name + ": " + title;
      }
    }
    class Notebook {
      public name: string;
      private owns page: Page?=null;
      enum State { OPEN, CLOSED }
      private state status: State=OPEN;
      Notebook(name: string) { me.name=name; }
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
    Methods: 'ALEX KULL\nAlex built Kull kole\ntrue [built, Kull]',
    Inheritance: 'Rex says woof', 'multifile/Main': 'Rex says woof',
    Generics: '42\nAlex\nKull\nALEX',
    Initialization: 'kole', Interfaces: '(3, 4)',
    NullSafety: 'Hello, stranger\nHello, Alex length: 4',
    Relationships: 'Chapter one belongs to Ideas\nChapter one belongs to kole',
    Primitives: 'kole true A\n12 300 9007199254740995 19.99\ninteger division: 3\nfloat division: 3.5\nexplicit conversion: 7 65',
    Collections: 'score 0 10\nscore 1 25\nscore 2 30\n[Alex, kole] 2\nAlex Kull\nremoved: Kull\nempty: true'
  };
  for (const [name, output] of Object.entries(expected)) {
    for (const command of ['check', 'run']) {
      const result = spawnSync(process.execPath, ['src/cli.mjs', command, `examples/${name}.k`], { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      if (command === 'run') assert.equal(result.stdout.trim().replaceAll('\r\n', '\n'), output);
    }
  }
});
