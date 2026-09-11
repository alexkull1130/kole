import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.mjs';
import { Runtime, run } from '../src/runtime.mjs';
import { check } from '../src/checker.mjs';
const program = (body, members = '') => `class Main { ${members} static main() -> void { ${body} } }`;
const validate = text => { const p = parse(text); check(p, new Runtime(p)); };
function execute(body, members = '') { const output = []; run(program(body, members), 'Main', { print: line => output.push(line) }); return output; }

test('arrays: literals, length, indexing, assignment and updates', () => {
  assert.deepEqual(execute('values: int[]=[1,2,3]; values[1]=7; values[0]++; values[2]+=5; print(values,values.length);'), ['[2, 7, 8] 3']);
});
test('arrays: typed empty, numeric widening, nested and nullable elements', () => {
  assert.deepEqual(execute('empty: int[]=[]; wide: long[]=[1,2]; nested: int[][]=[[1],[2,3]]; names: string?[]=[null,"kole"]; print(empty,wide,nested,names);'), ['[] [1, 2] [[1], [2, 3]] [null, kole]']);
});
test('arrays: literal contexts work in fields, arguments, returns and assignment', () => {
  assert.deepEqual(execute('m: Main=new Main(); m.values=[]; show([]); print(make());', 'values: int[]=[1]; static show(xs: int[]) -> void { print(xs); } static make() -> long[] { return [1,2]; }'), ['[]', '[1, 2]']);
});
test('arrays: allocations have safe defaults for primitives and nullable objects', () => {
  assert.deepEqual(execute('ints: int[]=new int[3]; flags: bool[]=new bool[2]; names: string[]=new string[1]; objects: Main?[]=new Main?[2]; print(ints,flags,names,objects);'), ['[0, 0, 0] [false, false] [] [null, null]']);
  assert.throws(() => validate(program('xs: Main[]=new Main[2];')), /No default value/);
});
test('arrays: invalid elements, bounds and lengths fail', () => {
  assert.throws(() => validate(program('xs: int[]=[1,"bad"];')), /Expected int/);
  assert.throws(() => validate(program('xs: int[]=[1]; xs[0]="bad";')), /Expected int/);
  assert.throws(() => execute('xs: int[]=[1]; print(xs[-1]);'), /out of bounds/);
  assert.throws(() => execute('xs: int[]=[1]; xs[1]=2;'), /out of bounds/);
  assert.throws(() => execute('xs: int[]=new int[-1];'), /Collection length/);
  assert.throws(() => execute('xs: int[]=new int[100001];'), /Collection length/);
});
test('arrays: mutable element types are invariant and aliases see writes', () => {
  assert.throws(() => validate(program('ints: int[]=[1]; longs: long[]=ints;')), /Expected long\[\]/);
  assert.deepEqual(execute('xs: int[]=[1]; alias: int[]=xs; alias[0]=7; print(xs);'), ['[7]']);
});
test('arrays: array initializers and indices participate in initialization checks', () => {
  assert.throws(() => validate(program('x: int; xs: int[]=[x];')), /before it is initialized/);
  assert.throws(() => validate(program('xs: int[]; xs[0]=1;')), /before it is initialized/);
  assert.throws(() => validate(program('xs: int[]=[1]; i: int; xs[i]=1;')), /before it is initialized/);
  assert.throws(() => validate(program('size: int; xs: int[]=new int[size];')), /before it is initialized/);
});
test('arrays: literals and assignment evaluate expressions once, left to right', () => {
  assert.deepEqual(execute('m: Main=new Main(); xs: int[]=[m.next(),m.next()]; xs[m.index()]=m.next(); print(xs,m.n);', 'n: int=0; next() -> int { n++; return n; } index() -> int { print("index"); return 0; }'), ['index', '[3, 2] 3']);
});
test('arrays: nullable containers require narrowing and strings are not mutable arrays', () => {
  assert.throws(() => validate(program('', 'f(xs: int[]?) -> void { xs[0]=1; }')), /nullable/);
  validate(program('', 'f(xs: int[]?) -> void { if(xs!=null) { xs[0]=1; } }'));
  assert.throws(() => validate(program('s: string="x"; s[0]=\'y\';')), /Cannot assign/);
});
test('List<A>: add, get, set, indexing, removeAt, clear and isEmpty', () => {
  assert.deepEqual(execute('xs: List<int>=new List<int>(); print(xs.isEmpty()); xs.add(1); xs.add(2); xs.set(0,3); xs[1]++; print(xs.get(0),xs.removeAt(1),xs.length,xs); xs.clear(); print(xs.isEmpty());'), ['true', '3 3 1 [3]', 'true']);
});
test('List<A>: nested lists and list-of-array arguments retain concrete types', () => {
  assert.deepEqual(execute('outer: List<List<int>>=new List<List<int>>(); inner: List<int>=new List<int>(); inner.add(7); outer.add(inner); arrays: List<int[]>=new List<int[]>(); arrays.add([1,2]); print(outer,arrays);'), ['[[7]] [[1, 2]]']);
});
test('List<A>: wrong element type, generic type, arity and unknown methods fail', () => {
  assert.throws(() => validate(program('xs: List<int>=new List<int>(); xs.add("bad");')), /Expected int/);
  assert.throws(() => validate(program('xs: List<int>=new List<int>(); xs.add();')), /expects 1/);
  assert.throws(() => validate(program('xs: List<int>=new List<int>(); xs.unknown();')), /Unknown member/);
  assert.throws(() => validate(program('xs: List<Missing>=new List<Missing>();')), /Unknown type/);
  assert.throws(() => validate(program('xs: List<int>=new List<int>(1);')), /no constructor arguments/);
});
test('List<A>: mutable list types are invariant', () => {
  assert.throws(() => validate(program('xs: List<int>=new List<int>(); ys: List<long>=xs;')), /Expected List<long>/);
});
test('List<A>: removal and writes check bounds even if RHS mutates the list', () => {
  assert.throws(() => execute('xs: List<int>=new List<int>(); xs.removeAt(0);'), /out of bounds/);
  assert.throws(() => execute('xs: List<int>=new List<int>(); xs.add(1); xs[0]=xs.removeAt(0);'), /out of bounds/);
});
test('List<A>: nullable members and interface values work', () => {
  const output = [];
  run('interface I { name() -> string; } class Item implements I { name() -> string { return "kole"; } } class Main { static main() -> void { xs: List<I?>=new List<I?>(); xs.add(null); xs.add(new Item()); item: I?=xs.get(1); if(item!=null) { print(item.name()); } } }', 'Main', { print: line => output.push(line) });
  assert.deepEqual(output, ['kole']);
});
test('collections: enum element identities survive storage and calls', () => {
  assert.deepEqual(execute('xs: List<State>=new List<State>(); xs.add(State.OPEN); states: State[]=[State.OPEN]; print(xs.get(0)==states[0]);', 'enum State { OPEN }'), ['true']);
});
test('collections: owned collections remain outside the single-object ownership model', () => {
  assert.throws(() => validate(program('', 'owns children: List<Main>=new List<Main>();')), /concrete class/);
});
