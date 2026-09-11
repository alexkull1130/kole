import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tokenize, KoleError } from '../src/lexer.mjs';
import { parse } from '../src/parser.mjs';
import { Runtime } from '../src/runtime.mjs';
import { number } from '../src/numbers.mjs';

// These regression tests deliberately exercise runtime defenses without preflight.
// Static checks and the public run API are covered in checker.test.mjs.
function run(source, entry, options = {}) {
  const runtime = new Runtime(parse(source), options);
  runtime.run(entry, options.args ?? []);
  return runtime;
}

function execute(body, members = '') {
  const output = [];
  run(`class Main { ${members} public static void main() { ${body} } }`, 'Main', { print: line => output.push(line) });
  return output;
}

test('ascending and descending ranges exclude the endpoint', () => {
  assert.deepEqual(execute('for(i=0:3:+) { print(i); } for(i=3:0:-) { print(i); }'), ['0', '1', '2', '3', '2', '1']);
});
test('empty and direction-mismatched ranges do not execute', () => {
  assert.deepEqual(execute('for(i=2:2:+) { print(i); } for(i=3:0:+) { print(i); } for(i=0:3:-) { print(i); }'), []);
});
test('negative bounds and boundary int values terminate safely', () => {
  assert.deepEqual(execute('for(i=-2:1:+) { print(i); } for(i=2147483646:2147483647:+) { print(i); } for(i=-2147483647:-2147483648:-) { print(i); }'), ['-2', '-1', '0', '2147483646', '-2147483647']);
});
test('nested counters are independent and scoped', () => {
  assert.deepEqual(execute('int i = 99; for(i=0:2:+) { for(j=0:2:+) { print(i,j); } } print(i);'), ['0 0', '0 1', '1 0', '1 1', '99']);
  assert.throws(() => execute('for(i=0:1:+) {} print(i);'), /Unknown name 'i'/);
});
test('bounds evaluate once, left to right, before iteration', () => {
  assert.deepEqual(execute('Main m = new Main(); for(i=m.start():m.end():+) { m.n = 0; print(i); }', 'public int n = 3; public int start() { print("start"); return 0; } public int end() { print("end"); return n; }'), ['start', 'end', '0', '1', '2']);
});
test('break, continue and return propagate through loops correctly', () => {
  assert.deepEqual(execute('for(i=0:5:+) { if(i==1) { continue; } if(i==3) { break; } print(i); } print(find());', 'public static int find() { for(i=0:3:+) { if(i==2) { return i; } } return -1; }'), ['0', '2', '2']);
});
test('counter assignment and noninteger bounds fail', () => {
  assert.throws(() => execute('for(i=0:3:+) { i = 2; }'), /Cannot assign/);
  assert.throws(() => execute('for(i=0:3:+) { i++; }'), /Cannot assign/);
  assert.throws(() => execute('for(i=0.5:3:+) {}'), /Expected int/);
});
test('counter must be explicit and only unit steps are accepted', () => {
  assert.throws(() => execute('for(0:3:+) {}'), /identifier/);
  assert.throws(() => execute('for(i=0:3:+2) {}'), /Expected '\)'/);
});
test('operator precedence, grouping, unary and short circuit', () => {
  assert.deepEqual(execute('print(2+3*4, (2+3)*4, -2*3, !false); print(false && 1/0==0, true || 1/0==0);'), ['14 20 -6 true', 'false true']);
});
test('strings and comments do not become executable syntax', () => {
  assert.deepEqual(execute('/* for(i=0:5:+) {} */ print("for(i=0:5:+) { require false; }"); // comment\n print("a\\n\\\"b");'), ['for(i=0:5:+) { require false; }', 'a\n"b']);
  assert.equal(tokenize('"class"')[0].kind, 'string');
});
test('lexer and parser report source locations', () => {
  assert.throws(() => tokenize('\n  @'), error => error instanceof KoleError && error.line === 2 && error.column === 3);
  assert.throws(() => tokenize('/* no end'), /Unterminated comment/);
  assert.throws(() => tokenize('"no end'), /Unterminated string/);
  assert.throws(() => parse('class Main { void f() {'), /Unclosed block/);
});
test('objects, constructors, methods and independent instance fields', () => {
  assert.deepEqual(execute('Main a = new Main(2); Main b = new Main(7); a.bump(); print(a.get(), b.get());', 'private int value; public Main(int value) { me.value = value; } public void bump() { value++; } public int get() { return value; }'), ['3 7']);
});
test('private fields and methods reject external callers', () => {
  const prefix = 'class Secret { private int x = 1; private int get() { return x; } }';
  for (const expression of ['s.x', 's.get()']) assert.throws(() => run(`${prefix} class Main { static void main() { Secret s = new Secret(); print(${expression}); } }`, 'Main'), /private to Secret/);
});
test('constructor privacy is enforced', () => {
  assert.throws(() => run('class Secret { private Secret() {} } class Main { static void main() { Secret s = new Secret(); } }', 'Main'), /private/);
});
test('assignment, parameters and return values enforce declared types', () => {
  assert.throws(() => execute('int n = "bad";'), /Expected int/);
  assert.throws(() => execute('f("bad");', 'static void f(int n) {}'), /Expected int/);
  assert.throws(() => execute('f();', 'static int f() { return "bad"; }'), /Expected int/);
  assert.throws(() => execute('f();', 'static void f() { return 1; }'), /void method/);
  assert.throws(() => execute('f();', 'static int f() {}'), /Expected int/);
});
test('uninitialized variables and fields cannot be read', () => {
  assert.throws(() => execute('int n; print(n);'), /not been initialized/);
  assert.throws(() => execute('Main m = new Main(); print(m.n);', 'public int n;'), /not been initialized/);
});
test('while loops and compound assignment', () => {
  assert.deepEqual(execute('int n = 0; while(n<3) { print(n); n += 1; }'), ['0', '1', '2']);
});
test('booleans, arithmetic errors and overflow are explicit', () => {
  assert.throws(() => execute('if(1) {}'), /bool/);
  assert.throws(() => execute('print(2/0);'), /Division by zero/);
  assert.throws(() => execute('int n = 2147483647; n++;'), /int overflow/);
  assert.deepEqual(execute('int n = 3/2; print(n);'), ['1']);
});

const connection = `class Connection {
  enum State { CLOSED, OPEN }
  private state State status = CLOSED;
  public int attempts = 0;
  public void open() transitions CLOSED -> OPEN { require attempts > 0; }
  public void close() transitions OPEN -> CLOSED { return; }
  public void send() requires OPEN { print("sent"); }
  public void tamper() { status = OPEN; }
}`;

test('lifecycle guards and transitions', () => {
  const output = [];
  run(`${connection} class Main { static void main() { Connection c = new Connection(); c.attempts = 1; c.open(); c.send(); c.close(); } }`, 'Main', { print: line => output.push(line) });
  assert.deepEqual(output, ['sent']);
  assert.throws(() => run(`${connection} class Main { static void main() { Connection c = new Connection(); c.send(); } }`, 'Main'), /Expected state OPEN; actual: CLOSED/);
});
test('failed transition preserves state; successful early return commits it', () => {
  const runtime = new Runtime(parse(connection));
  const cls = runtime.classes.get('Connection'), object = runtime.create('Connection', [], { owner: null }, cls.declaration);
  const call = name => runtime.invoke({ cls, self: object, method: cls.methods.get(name) }, [], cls.declaration);
  assert.throws(() => call('open'), /Precondition failed/);
  assert.equal(object.fields.get('status').value.name, 'CLOSED');
  object.fields.get('attempts').value = number('int', 1);
  call('open'); assert.equal(object.fields.get('status').value.name, 'OPEN');
  call('close'); assert.equal(object.fields.get('status').value.name, 'CLOSED');
  assert.equal(object.transitioning, false);
});
test('state cannot be assigned directly', () => {
  assert.throws(() => run(`${connection} class Main { static void main() { Connection c = new Connection(); c.tamper(); } }`, 'Main'), /Cannot assign/);
});
test('transition reentry on the same object fails', () => {
  assert.throws(() => execute('Main m = new Main(); m.open();', 'enum State { CLOSED, OPEN } private state State status = CLOSED; void open() transitions CLOSED -> OPEN { open(); }'), /already in progress/);
});
test('lifecycle declarations reject missing fields and unknown states', () => {
  assert.throws(() => new Runtime(parse('class X { void f() requires OPEN {} }')), /requires a state field/);
  assert.throws(() => new Runtime(parse('class X { enum S { A } private state S s = A; void f() transitions A -> B {} }')), /Unknown lifecycle state/);
});
test('preconditions prevent later statements from running', () => {
  const output = [];
  assert.throws(() => run('class Main { static void main() { require false; print("bad"); } }', 'Main', { print: line => output.push(line) }), /Precondition failed/);
  assert.deepEqual(output, []);
});
test('duplicate classes, members and parameters fail', () => {
  assert.throws(() => new Runtime(parse('class X {} class X {}')), /Duplicate/);
  assert.throws(() => new Runtime(parse('class X { int x; int x; }')), /Duplicate/);
  assert.throws(() => new Runtime(parse('class X { void f(int x, int x) {} }')), /Duplicate/);
});
test('unsupported atomic blocks are diagnosed instead of silently ignored', () => {
  assert.throws(() => parse('class X { private atomic X child; }'), /planned but not implemented/);
});
test('execution and call depth limits produce language errors', () => {
  assert.throws(() => run('class Main { static void main() { while(true) {} } }', 'Main', { maxSteps: 50 }), /step limit/);
  assert.throws(() => execute('f();', 'static void f() { f(); }'), /Call depth/);
});
test('entrypoint arguments and array reads', () => {
  const output = [];
  run('class Main { public static void main(string[] args) { print(args.length, args[0]); } }', 'Main', { args: ['kole'], print: line => output.push(line) });
  assert.deepEqual(output, ['1 kole']);
});
test('recursive field initialization produces a language error', () => {
  assert.throws(() => execute('Main m = new Main();', 'private Main child = new Main();'), /Call depth limit exceeded during object construction/);
});
test('ordinary members cannot impersonate constructors', () => {
  assert.throws(() => new Runtime(parse('class X { int X() { return 1; } }')), /Only a constructor/);
});
test('entrypoint signature and instance method usage are validated', () => {
  assert.throws(() => run('class Main { void main() {} }', 'Main'), /Entry requires/);
  assert.throws(() => execute('Main.f();', 'void f() {}'), /needs an instance/);
});
test('CLI runs examples and reports user errors with a nonzero exit', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const cli = (...args) => spawnSync(process.execPath, ['src/cli.mjs', ...args], { cwd: root, encoding: 'utf8' });
  for (const name of ['Hello', 'Point', 'Connection', 'Order']) {
    const result = cli('run', `examples/${name}.k`);
    assert.equal(result.status, 0, result.stderr); assert.ok(result.stdout.length);
  }
  assert.equal(cli('check', 'examples/Connection.k').status, 0);
  const invalid = cli('run', 'examples/Hello.java');
  assert.equal(invalid.status, 1); assert.match(invalid.stderr, /must use .k/);
  assert.equal(cli('run', 'examples/Missing.k').status, 1);
  assert.equal(cli().status, 2);
});
