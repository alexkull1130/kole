import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/runtime.mjs';
const exec = body => { const lines=[]; run(`class Main { static main() -> void { ${body} } }`, 'Main', {print: x=>lines.push(x)}); return lines; };
test('string methods preserve scalar indices and immutable values',()=> {
 assert.deepEqual(exec('s: string=" A😀B "; print(s.trim().toLowerCase(), s.substring(1,4), s.charAt(2)); print(s.indexOf("B"), s.lastIndexOf("😀"), s.contains("😀"), s.startsWith(" "), s.endsWith(" ")); print(s.replace(" ","!"), "ab".repeat(2), "a,b,".split(","), "😀A".toCharArray());'), ['a😀b A😀B 😀','3 2 true true true','!A😀B! abab [a, b, ] [😀, A]']);
});
test('list methods mutate, search and copy with element types',()=> {
 assert.deepEqual(exec('xs: List<int>=new List<int>(); xs.addAll([1,2,1]); xs.insert(1,9); print(xs.contains(9),xs.indexOf(1),xs.lastIndexOf(1)); ys: List<int>=xs.copy(); print(xs.remove(1),xs.remove(8)); xs.reverse(); print(xs.join("-"),ys,xs.first(),xs.last(),xs.slice(0,2));'),['true 0 3','true false','1-2-9 [1, 9, 2, 1] 1 9 [1, 2]']);
});
test('array methods retain fixed length and conversions copy containers',()=> {
 assert.deepEqual(exec('xs: int[]=[1,2,3]; ys: List<int>=xs.toList(); ys.add(4); xs.reverse(); xs.set(0,7); print(xs.get(0), xs.slice(0,2),ys.toArray(),xs.copy(),xs.join(":"));'),['7 [7, 2] [1, 2, 3, 4] [7, 2, 1] 7:2:1']);
});
test('method errors are typed and bounds checked',()=> {
 for (const body of ['"abc".substring(2,1);','"a".charAt(1);','"a".repeat(-1);','xs: int[]=[]; xs.first();','xs: List<int>=new List<int>(); xs.insert(1,2);']) assert.throws(()=>exec(body),/range|bounds|length/);
 assert.throws(()=>exec('xs: List<int>=new List<int>(); xs.addAll(["bad"]);'),/Expected int/);
 assert.throws(()=>exec('"s".contains(1);'),/Expected string/);
 assert.throws(()=>exec('xs: int[]=[]; xs.add(1);'),/Cannot access/);
});
