import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.mjs';
import { check } from '../src/checker.mjs';
import { Runtime, run } from '../src/runtime.mjs';
const validate = source => { const p = parse(source); check(p, new Runtime(p)); };
const source = (body, members = '') => `class Main { ${members} static main() -> void { ${body} } }`;

test('null safety: values are non-null by default', () => {
  for (const type of ['String', 'Main', 'int']) assert.throws(() => validate(source(`x: ${type} = null;`)), /Expected/);
  validate(source('x: String? = null; n: int? = null; m: Main? = null;'));
  assert.throws(() => validate(source('', 'f() -> String { return null; }')), /Expected String/);
  assert.throws(() => validate(source('f(null);', 'static f(x: String) -> void {}')), /Expected String/);
});
test('null safety: nullable locals still need initialization', () => {
  assert.throws(() => validate(source('x: String?; print(x);')), /before it is initialized/);
  assert.throws(() => validate(source('', 'x: String?;')), /every constructor path/);
});
test('null safety: guards narrow locals and parameters, including early returns', () => {
  const output = [];
  run(source('f(null); f("kole");', 'static f(x: String?) -> void { if(x == null) { print("empty"); return; } print(x.length); }'), 'Main', { print: line => output.push(line) });
  assert.deepEqual(output, ['empty', '4']);
  validate(source('', 'f(x: String?) -> void { if(x != null) { print(x.length); } else { print("empty"); } }'));
  validate(source('', 'f(x: String?) -> void { require x != null; print(x.length); }'));
});
test('null safety: short circuit guards and negation', () => {
  validate(source('', 'f(x: String?) -> boolean { return x != null && x.length > 0; }'));
  validate(source('', 'f(x: String?) -> boolean { return x == null || x.length == 0; }'));
  validate(source('', 'f(x: String?) -> void { if(!(x == null)) { print(x.length); } }'));
  assert.throws(() => validate(source('', 'f(x: String?) -> void { print(x.length); }')), /nullable/);
});
test('null safety: reassignment invalidates narrowing', () => {
  assert.throws(() => validate(source('', 'f(x: String?) -> void { if(x != null) { x=null; print(x.length); } }')), /nullable/);
  assert.throws(() => validate(source('', 'f(x: String?) -> void { if(x != null && (x=null)==null) { print(x.length); } }')), /nullable/);
  validate(source('x: String? = null; x="kole"; print(x.length);'));
});
test('null safety: branch joins and loop backedges do not retain stale facts', () => {
  assert.throws(() => validate(source('', 'f(b: boolean) -> void { x: String?="kole"; if(b) { x=null; } print(x.length); }')), /nullable/);
  assert.throws(() => validate(source('x: String?="kole"; for(i=0:2:+) { print(x.length); x=null; }')), /nullable/);
  assert.throws(() => validate(source('x: String?="kole"; while(true) { print(x.length); x=null; }')), /nullable/);
  validate(source('x: String?="kole"; while(x != null) { print(x.length); x=null; }'));
  assert.throws(() => validate(source('x: String?=null; while((x="kole")!=null) { x=null; break; } print(x.length);')), /nullable/);
});
test('null safety: guarded nullable numbers support compound updates', () => {
  validate(source('', 'f(n: int?) -> void { if(n != null) { n+=1; n++; print(n); } }'));
});
test('null safety: fields use local snapshots instead of unsafe alias-based narrowing', () => {
  assert.throws(() => validate(source('', 'x: String?=null; f() -> void { if(x!=null) { print(x.length); } }')), /nullable/);
  validate(source('', 'x: String?=null; f() -> void { snapshot: String?=me.x; if(snapshot!=null) { print(snapshot.length); } }'));
});
test('null safety: interface references can be nullable and narrow', () => {
  validate('interface I { f() -> void; } class Main implements I { f() -> void {} static use(x: I?) -> void { if(x!=null) { x.f(); } } static main() -> void { use(new Main()); use(null); } }');
});
test('null safety: nullable array containers and elements are distinct', () => {
  validate(source('', 'f(x: String[]?) -> void { if(x!=null) { print(x.length); } }'));
  assert.throws(() => validate(source('', 'f(x: String?[]) -> void { print(x[0].length); }')), /nullable/);
  assert.throws(() => validate(source('', 'f(x: String[]?) -> void { print(x[0]); }')), /nullable/);
});
test('null safety: runtime checks remain a backstop for direct API use', () => {
  const runtime = new Runtime(parse(source('x: String = null;')));
  assert.throws(() => runtime.run('Main'), /Expected String/);
  assert.throws(() => validate(source('x: void?=null;')), /Unknown type/);
});
test('me is the only current-object keyword', () => {
  const output = [];
  run(source('m: Main = new Main(7); print(m.get());', 'x: int; Main(x: int) { me.x=x; } get() -> int { return me.x; }'), 'Main', { print: line => output.push(line) });
  assert.deepEqual(output, ['7']);
  assert.throws(() => parse(source('', 'f() -> void { print(this); }')), /Use 'me'/);
  assert.throws(() => validate(source('print(me);')), /unavailable in a static method/);
});
