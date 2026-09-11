import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.mjs';
import { check } from '../src/checker.mjs';
import { Runtime, run } from '../src/runtime.mjs';

const source = (body, members = '') => `class Main { ${members} static main() -> void { ${body} } }`;
const validate = source => { const program = parse(source); check(program, new Runtime(program)); };

test('initialization: local reads and compound assignments need a value', () => {
  for (const body of ['n: int; print(n);', 'n: int; n += 1;', 'n: int; n++;']) assert.throws(() => validate(source(body)), /before it is initialized/);
  validate(source('n: int; n = 3; print(n);'));
});
test('initialization: branch intersection checks all reachable paths', () => {
  assert.throws(() => validate(source('', 'f(b: bool) -> int { n: int; if(b) { n=1; } return n; }')), /before it is initialized/);
  validate(source('', 'f(b: bool) -> int { n: int; if(b) { n=1; } else { n=2; } return n; }'));
  validate(source('', 'f(b: bool) -> int { n: int; if(b) { return 0; } else { n=2; } return n; }'));
});
test('initialization: potentially empty loops cannot initialize an outer local', () => {
  assert.throws(() => validate(source('n: int; for(i=0:2:+) { n=i; } print(n);')), /before it is initialized/);
  validate(source('n: int; while(true) { n=3; break; } print(n);'));
  assert.throws(() => validate(source('', 'f(b: bool) -> int { n: int; while(true) { if(b) { break; } n=1; break; } return n; }')), /before it is initialized/);
});
test('initialization: short circuiting preserves conditional assignment', () => {
  assert.throws(() => validate(source('', 'f(b: bool) -> void { n: int; print(b && (n=1)==1); print(n); }')), /before it is initialized/);
  validate(source('', 'f(b: bool) -> void { n: int; if(b && (n=1)==1) { print(n); } }'));
  validate(source('n: int; print(true && (n=1)==1); print(n);'));
});
test('initialization: field order, constructors and early returns', () => {
  assert.throws(() => validate(source('', 'a: int = b; b: int = 1;')), /before it is initialized/);
  assert.throws(() => validate(source('', 'a: int;')), /every constructor path/);
  assert.throws(() => validate(source('', 'a: int; Main(b: bool) { if(b) { return; } a=1; }')), /every constructor path/);
  validate(source('', 'a: int; Main(b: bool) { if(b) { a=1; } else { a=2; } }'));
  validate(source('', 'a: int = 1; b: int = a+1;'));
});
test('initialization: partially constructed me cannot escape or call methods', () => {
  for (const body of ['print(me); a=1;', 'read(); a=1;', 'me.read(); a=1;']) {
    assert.throws(() => validate(source('', `a: int; Main() { ${body} } read() -> int { return a; }`)), /before all fields are initialized/);
  }
  validate(source('', 'a: int; Main() { a=1; print(me); read(); } read() -> int { return a; }'));
});
test('initialization: scopes, argument order and assignments in bounds', () => {
  validate(source('n: int; for(i=(n=0):2:+) {} print(n);'));
  validate(source('n: int; print(n=1,n);'));
  assert.throws(() => validate(source('n: int; { n: int=1; } print(n);')), /before it is initialized/);
  assert.throws(() => validate(source('n: int; print(n,n=1);')), /before it is initialized/);
});
test('initialization errors prevent execution', () => {
  const output = [];
  assert.throws(() => run(source('print("must not run"); n: int; print(n);'), 'Main', { print: line => output.push(line) }), /before it is initialized/);
  assert.deepEqual(output, []);
});
