import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.mjs';
import { check } from '../src/checker.mjs';
import { Runtime, run } from '../src/runtime.mjs';
const validate = text => { const program = parse(text); check(program, new Runtime(program)); };
const contract = 'interface Printable { describe() -> string; }';

test('interfaces: implementations dispatch through interface parameters and returns', () => {
  const output = [];
  run(`${contract} class Main implements Printable {
    describe() -> string { return "kole"; }
    static make() -> Printable { return new Main(); }
    static show(p: Printable) -> void { print(p.describe()); }
    static main() -> void { value: Printable = make(); show(value); }
  }`, 'Main', { print: line => output.push(line) });
  assert.deepEqual(output, ['kole']);
});
test('interfaces: missing, private, static and incompatible implementations fail', () => {
  assert.throws(() => validate(contract + 'class Main implements Printable {}'), /must implement/);
  for (const method of ['private describe() -> string { return "x"; }', 'static describe() -> string { return "x"; }', 'describe() -> int { return 1; }', 'describe(x: int) -> string { return "x"; }']) {
    assert.throws(() => validate(contract + `class Main implements Printable { ${method} }`), /Signature/);
  }
});
test('interfaces: nominal adoption is required, and interfaces cannot be constructed', () => {
  assert.throws(() => validate(contract + 'class Main { describe() -> string { return "x"; } static main() -> void { p: Printable = new Main(); } }'), /Expected Printable/);
  assert.throws(() => validate(contract + 'class Main { static main() -> void { p: Printable = new Printable(); } }'), /Cannot construct interface/);
});
test('interfaces: interface variables expose only their contract', () => {
  assert.throws(() => validate(contract + 'class Main implements Printable { describe() -> string { return "x"; } other() -> void {} static main() -> void { p: Printable = new Main(); p.other(); } }'), /Unknown member/);
});
test('interfaces: multiple contracts and unknown contracts', () => {
  validate('interface A { a() -> void; } interface B { b() -> int; } class C implements A, B { a() -> void {} b() -> int { return 1; } }');
  assert.throws(() => validate('class C implements Missing {}'), /not an interface/);
  assert.throws(() => validate('interface A {} class C implements A, A {}'), /Duplicate implemented/);
});
test('interfaces: signatures only and implementations cannot strengthen lifecycle requirements', () => {
  assert.throws(() => parse('interface A { f() -> void {} }'), /Expected ';'/);
  assert.throws(() => parse('interface A { n: int; }'), /method signatures only/);
  assert.throws(() => validate('interface A { f() -> void; } class C implements A { enum S { OPEN } private state s: S = OPEN; f() -> void requires OPEN {} }'), /Signature/);
});
