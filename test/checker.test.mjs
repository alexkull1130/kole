import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from '../src/parser.mjs';
import { check } from '../src/checker.mjs';
import { Runtime, run } from '../src/runtime.mjs';

function validate(source) {
  const program = parse(source);
  check(program, new Runtime(program));
  return program;
}
const main = (body, members = '') => `class Main { ${members} public static main() -> void { ${body} } }`;

test('canonical syntax supports fields, parameters, locals, constructors and returns', () => {
  const source = main('a: Main = new Main(4); print(a.twice());', 'private count: int; public Main(count: int) { this.count = count; } public twice() -> int { return count*2; }');
  validate(source);
  const output = [];
  run(source, 'Main', { print: line => output.push(line) });
  assert.deepEqual(output, ['8']);
});
test('legacy syntax remains readable during bootstrap migration', () => {
  validate('class Main { static void main() { int n = 1; print(n); } }');
});
test('canonical methods require return arrows and constructors do not take them', () => {
  assert.throws(() => parse('class A { f() {} }'), /Expected '->'/);
  assert.throws(() => parse('class A { A() -> void {} }'), /Constructors/);
  assert.throws(() => parse('class A { f: int() -> void {} }'), /Methods use/);
});
test('uninvoked methods and dead branches are checked', () => {
  assert.throws(() => validate(main('', 'bad() -> void { n: int = "wrong"; }')), /Expected int, received String/);
  assert.throws(() => validate(main('if(false) { print(missing); }')), /Unknown name 'missing'/);
  assert.throws(() => validate(main('return; print(missing);')), /Unknown name 'missing'/);
});
test('checking performs no program execution, even for initializers', () => {
  const program = parse(main('while(true) {}', 'count: int = make(); static make() -> int { print("never"); return 2; }'));
  const runtime = new Runtime(program, { print: () => assert.fail('Executed while checking') });
  check(program, runtime); assert.equal(runtime.steps, 0);
});
test('field initializers and local types are checked', () => {
  assert.throws(() => validate(main('', 'count: int = false;')), /Expected int/);
  assert.throws(() => validate(main('n: Missing;')), /Unknown type 'Missing'/);
  assert.throws(() => validate(main('n: int = 1; n = "bad";')), /Expected int/);
});
test('unknown calls, method arity and argument types are checked', () => {
  assert.throws(() => validate(main('m: Main = new Main(); m.missing();')), /Unknown member 'missing'/);
  assert.throws(() => validate(main('f();', 'static f(n: int) -> void {}')), /expects 1 arguments/);
  assert.throws(() => validate(main('f("bad");', 'static f(n: int) -> void {}')), /Expected int/);
});
test('constructor arity, argument types and unknown classes are checked', () => {
  assert.throws(() => validate(main('m: Main = new Main("bad");', 'Main(n: int) {}')), /Expected int/);
  assert.throws(() => validate(main('m: Main = new Main(1);')), /no constructor/);
  assert.throws(() => validate(main('print(new Missing());')), /Unknown class/);
});
test('return types and missing return paths are checked', () => {
  assert.throws(() => validate(main('', 'f() -> int { return "bad"; }')), /Expected int/);
  assert.throws(() => validate(main('', 'f() -> int { return; }')), /Expected return value/);
  assert.throws(() => validate(main('', 'f() -> void { return 1; }')), /void method/);
  assert.throws(() => validate(main('', 'f(b: boolean) -> int { if(b) { return 1; } }')), /may finish without returning/);
  validate(main('', 'f(b: boolean) -> int { if(b) { return 1; } else { return 2; } }'));
});
test('return analysis accounts for loop breaks and potentially empty ranges', () => {
  assert.throws(() => validate(main('', 'f() -> int { for(i=0:3:+) { return i; } }')), /may finish/);
  assert.throws(() => validate(main('', 'f() -> int { while(true) { break; } }')), /may finish/);
  validate(main('', 'f() -> int { while(true) { return 1; } }'));
});
test('scope lookup and duplicate locals are checked', () => {
  assert.throws(() => validate(main('for(i=0:3:+) {} print(i);')), /Unknown name/);
  assert.throws(() => validate(main('n: int = 0; n: int = 1;')), /already declared/);
  validate(main('n: int = 0; { n: String = "inner"; print(n); } print(n);'));
});
test('conditions and loop bounds require their declared types', () => {
  for (const body of ['if(1) {}', 'while("yes") {}', 'require 1;']) assert.throws(() => validate(main(body)), /Expected boolean/);
  assert.throws(() => validate(main('for(i=0:3.5:+) {}')), /Expected int/);
  assert.throws(() => validate(main('for(i=0:3:+) { i++; }')), /Cannot assign/);
});
test('private members and constructors cannot be used by other classes', () => {
  const secret = 'class Secret { private n: int = 1; private f() -> int { return n; } }';
  for (const body of ['s: Secret = new Secret(); print(s.n);', 's: Secret = new Secret(); s.f();']) {
    assert.throws(() => validate(secret + main(body)), /private to Secret/);
  }
  assert.throws(() => validate('class Secret { private Secret() {} }' + main('s: Secret = new Secret();')), /private/);
});
test('static methods cannot use this or invoke instance methods through a class', () => {
  assert.throws(() => validate(main('print(this);')), /this is unavailable/);
  assert.throws(() => validate(main('Main.f();', 'f() -> void {}')), /needs an instance/);
});
test('numeric promotion, string concatenation and division have defined types', () => {
  validate(main('d: double = 2; text: String = "n=" + d; print(text);'));
  assert.throws(() => validate(main('n: int = 4/2;')), /Expected int, received double/);
  assert.throws(() => validate(main('n: int = 2.0;')), /Expected int, received double/);
  assert.throws(() => validate(main('print(true+1);')), /numeric operands/);
  assert.throws(() => validate(main('print(1=="1");')), /Cannot compare/);
});
test('void results, classes and methods cannot be used as ordinary values', () => {
  assert.throws(() => validate(main('n: int = print("x");')), /Expected a value/);
  assert.throws(() => validate(main('m: Main = Main;')), /Expected a value/);
  assert.throws(() => validate(main('print(Main.main);')), /Expected a value/);
});
test('array and string index types and length are checked', () => {
  validate('class Main { static main(args: String[]) -> void { print(args.length, args[0], "kole"[0]); } }');
  assert.throws(() => validate(main('print("kole"[false]);')), /Expected int/);
  assert.throws(() => validate(main('print(42[0]);')), /Indexing requires/);
});
test('enum types retain their declaring class identity', () => {
  const source = 'class Other { enum State { A } get() -> State { return State.A; } }';
  assert.throws(() => validate(source + main('o: Other = new Other(); stateValue: State = o.get();', 'enum State { A }')), /Expected Main.State, received Other.State/);
});
test('canonical lifecycle syntax checks and runs with runtime state guards', () => {
  const members = 'enum State { CLOSED, OPEN } private state status: State = CLOSED; open() -> void transitions CLOSED -> OPEN {} send(text: String) -> void requires OPEN { require text.length > 0; print(text); }';
  const output = [];
  run(main('m: Main = new Main(); m.open(); m.send("hello");', members), 'Main', { print: line => output.push(line) });
  assert.deepEqual(output, ['hello']);
  assert.throws(() => run(main('m: Main = new Main(); m.send("hello");', members), 'Main'), /Expected state OPEN/);
  assert.throws(() => validate(main('', members + 'bad() -> void { status = OPEN; }')), /Cannot assign/);
});
test('public run rejects the whole invalid program before any output', () => {
  const output = [];
  assert.throws(() => run(main('print("must not run");', 'unused() -> void { count: int = "bad"; }'), 'Main', { print: line => output.push(line) }), /Expected int/);
  assert.deepEqual(output, []);
});
test('CLI checks invalid unused code, returns source positions and hides Easter egg in help', () => {
  const cliPath = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kole-check-test-'));
  const file = path.join(directory, 'Main.k');
  try {
    fs.writeFileSync(file, 'class Main {\n unused() -> void { count: int = "bad"; }\n static main() -> void { print("no"); }\n}');
    for (const command of ['check', 'run']) {
      const result = spawnSync(process.execPath, [cliPath, command, file], { encoding: 'utf8' });
      assert.equal(result.status, 1); assert.equal(result.stdout, '');
      assert.match(result.stderr, /Main\.k:2:\d+: Expected int, received String/);
    }
    const egg = spawnSync(process.execPath, [cliPath, 'alex'], { encoding: 'utf8' });
    assert.equal(egg.status, 0); assert.equal(egg.stdout.trim(), 'Every language starts with a name.\nThis one started with Alex Kull.');
    const help = spawnSync(process.execPath, [cliPath], { encoding: 'utf8' });
    assert.doesNotMatch(help.stderr, /alex/i);
  } finally {
    fs.unlinkSync(file); fs.rmdirSync(directory);
  }
});
