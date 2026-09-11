import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.mjs';
import { check } from '../src/checker.mjs';
import { Runtime, run } from '../src/runtime.mjs';
const declarations = `class Child { public belongsTo parent: Parent?; }
class Parent { public owns child: Child? = null; }`;
const program = body => declarations + ` class Main { static main() -> void { ${body} } }`;
const validate = text => { const p = parse(text); check(p, new Runtime(p)); };
function fixture(text = declarations) {
  const p = parse(text), runtime = new Runtime(p); check(p, runtime);
  const caller = { owner: null };
  const create = (name, args = []) => runtime.create(name, args, caller, runtime.classes.get(name).declaration);
  const set = (object, field, value) => runtime.write(runtime.field(object, field, caller, object.cls.declaration), value, object.cls.declaration);
  return { runtime, create, set };
}

test('relationships: attach, replace, detach and transfer update both sides', () => {
  const { create, set } = fixture();
  const p = create('Parent'), q = create('Parent'), a = create('Child'), b = create('Child');
  assert.equal(a.fields.get('parent').value, null);
  set(p, 'child', a); assert.equal(a.fields.get('parent').value, p);
  set(p, 'child', b); assert.equal(a.fields.get('parent').value, null); assert.equal(b.fields.get('parent').value, p);
  set(p, 'child', null); set(q, 'child', b);
  assert.equal(p.fields.get('child').value, null); assert.equal(b.fields.get('parent').value, q);
});
test('relationships: duplicate ownership rejects without altering existing links', () => {
  const { create, set } = fixture();
  const p = create('Parent'), q = create('Parent'), a = create('Child'), b = create('Child');
  set(p, 'child', a); set(q, 'child', b);
  assert.throws(() => set(q, 'child', a), /already has an owner/);
  assert.equal(p.fields.get('child').value, a); assert.equal(q.fields.get('child').value, b);
  assert.equal(a.fields.get('parent').value, p); assert.equal(b.fields.get('parent').value, q);
  set(p, 'child', a); assert.equal(a.fields.get('parent').value, p);
});
test('relationships: different slots of one owner cannot share ownership', () => {
  const { create, set } = fixture('class Child { belongsTo parent: Parent?; } class Parent { public owns first: Child?=null; public owns second: Child?=null; }');
  const p = create('Parent'), child = create('Child');
  set(p, 'first', child);
  assert.throws(() => set(p, 'second', child), /already has an owner/);
});
test('relationships: self and indirect ownership cycles are forbidden', () => {
  const { create, set } = fixture('class Node { public owns next: Node?=null; public belongsTo parent: Node?; }');
  const a = create('Node'), b = create('Node');
  assert.throws(() => set(a, 'next', a), /cycles/);
  set(a, 'next', b);
  assert.throws(() => set(b, 'next', a), /cycles/);
  assert.equal(b.fields.get('parent').value, a); assert.equal(b.fields.get('next').value, null);
});
test('relationships: back-references are readonly, nullable, and automatically initialized', () => {
  validate(program('c: Child = new Child(); print(c.parent);'));
  assert.throws(() => validate(program('c: Child = new Child(); c.parent = new Parent();')), /Cannot assign/);
  for (const field of ['belongsTo parent: Parent;', 'belongsTo parent: Parent?=null;']) assert.throws(() => validate(`class Child { ${field} } class Parent { owns child: Child?=null; }`), /belongsTo must be nullable/);
});
test('relationships: runtime rejects direct back-reference assignment', () => {
  const runtime = new Runtime(parse(program('c: Child=new Child(); c.parent=new Parent();')));
  assert.throws(() => runtime.run('Main'), /belongsTo reference/);
});
test('relationships: dangling, ambiguous and unsupported declaration types fail', () => {
  assert.throws(() => validate('class Child { belongsTo parent: Parent?; } class Parent {}'), /matching owns/);
  assert.throws(() => validate('class Child { belongsTo p: Parent?; belongsTo q: Parent?; } class Parent { owns child: Child?=null; }'), /Ambiguous/);
  assert.throws(() => validate('class Parent { owns child: string?=null; }'), /concrete class/);
  assert.throws(() => validate('interface I {} class Parent { owns child: I?=null; }'), /concrete class/);
});
test('relationships: owns can exist without a back-reference', () => {
  validate('class Child {} class Parent { owns child: Child = new Child(); }');
});
test('relationships: failed construction releases the children it attached', () => {
  const text = 'class Child { belongsTo parent: Parent?; } class Parent { owns child: Child; Parent(child: Child) { me.child=child; require false; } }';
  const { create } = fixture(text); const child = create('Child');
  assert.throws(() => create('Parent', [child]), /Precondition failed/);
  assert.equal(child.ownerSlot, null); assert.equal(child.fields.get('parent').value, null);
});
test('relationships: non-null ownership is initialized in the constructor', () => {
  validate('class Child { belongsTo parent: Parent?; } class Parent { owns child: Child; Parent(child: Child) { me.child=child; } }');
  assert.throws(() => validate('class Child {} class Parent { owns child: Child; }'), /every constructor path/);
});
test('relationships: aliases remain usable after detachment', () => {
  const output = [];
  run(program('c: Child=new Child(); p: Parent=new Parent(); p.child=c; print(c.parent==p); p.child=null; print(c.parent==null);'), 'Main', { print: line => output.push(line) });
  assert.deepEqual(output, ['true', 'true']);
});
