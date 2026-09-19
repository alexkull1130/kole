import test from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../src/runtime.mjs';
const execute=body=>{const lines=[];run('class Main { static main() -> void {'+body+'} }','Main',{print:x=>lines.push(x)});return lines;};
test('Map preserves insertion order, replacement, removal and independent snapshots',()=>{
 assert.deepEqual(execute('m: Map<string,int>(); m.set("a",1); m.set("b",2); m.set("a",3); keys:List<string> = m.keys(); keys.clear(); print(m.size(),m.get("a"),m.keys(),m.values(),m.getOrDefault("z",9)); print(m.remove("a"),m.remove("z")); m.set("a",4); print(m.keys()); m.clear(); print(m.isEmpty());'),['2 3 [a, b] [3, 2] 9','true false','[b, a]','true']);
});
test('Set enforces uniqueness and snapshots do not expose storage',()=>{
 assert.deepEqual(execute('s:Set<string>(); print(s.add("a"),s.add("a"),s.add("b")); copy:List<string> = s.toList(); copy.clear(); print(s.size(),s.toArray(),s.contains("a"),s.remove("a"),s.remove("z")); s.clear(); print(s.isEmpty());'),['true false true','2 [a, b] true true false','true']);
});
test('Map missing keys are catchable and generic arguments remain checked',()=>{
 assert.deepEqual(execute('m:Map<string,int>(); try {m.get("missing");} catch(e:Error){print(e.message);}'),['Map key not found']);
 assert.throws(()=>execute('m:Map<string,int>(); m.set(1,"bad");'));
 assert.throws(()=>execute('s:Set<int>(); s.add("bad");'));
});
