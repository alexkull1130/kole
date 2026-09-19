import test from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../src/runtime.mjs';
const execute=(body,members='')=>{const lines=[];run('class Main {'+members+' static main() -> void {'+body+'} }','Main',{print:x=>lines.push(x)});return lines;};
test('const protects bindings but allows mutations through object and collection references',()=>{
 assert.deepEqual(execute('const names:List<string>(); names.add("Alex");const xs:int[]=[1];xs[0]=2;const m:Main();m.items.add(3);print(names,xs,m.items,m.answer);','const answer:int=42;const items:List<int>();'),['[Alex] [2] [3] 42']);
});
test('const rejects reassignment, updates, missing initializers and invalid modifiers',()=>{
 for(const body of ['const n:int=1;n=2;','const n:int=1;n++;','const n:int=1;n+=2;','const n:int;','const const n:int=1;'])assert.throws(()=>execute(body));
 for(const member of ['const n:int;','const f()->int{return 1;}','const enum E { A }','const state n:int=1;'])assert.throws(()=>execute('',member));
 assert.throws(()=>execute('m:Main();m.n=2;','const n:int=1;'));
});
test('const fields retain per-instance initialization and inherited protection',()=>{
 const source='class Base { const values:List<int>(); } class Main extends Base { static main()->void {a:Main(); b:Main();a.values.add(1);print(a.values,b.values);} }';
 const output=[];run(source,'Main',{print:x=>output.push(x)});assert.deepEqual(output,['[1] []']);
});
