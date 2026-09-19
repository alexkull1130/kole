import test from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../src/runtime.mjs';
const execute=body=>{const lines=[];run('class Main { static main() -> void {'+body+'} }','Main',{print:x=>lines.push(x)});return lines;};
test('collection loops snapshot once and support Unicode, nesting and control flow',()=>{
 assert.deepEqual(execute('xs:List<int>(); xs.add(1); xs.add(2); for(x:xs){xs.clear(); for(y:[3,4]){if(y == 3){continue;} print(x,y); break;}} for(c:"A😀"){print(c);} print(xs.length);'),['1 4','2 4','A','😀','0']);
});
test('collection loops iterate ordered map keys and unique set values',()=>{
 assert.deepEqual(execute('m:Map<string,int>(); m.set("a",1);m.set("b",2);for(k:m){print(k,m.get(k));} s:Set<int>();s.add(2);s.add(2);for(x:s){print(x);}'),['a 1','b 2','2']);
});
test('collection loop rejects rebinding, nullable sources and leaking loop variables',()=>{
 for(const body of ['for(x:[1]){x=2;}','for(x:1){}','xs:List<int>?=null;for(x:xs){}','for(x:[1]){}print(x);','n:int;for(x:[1]){n=x;}print(n);'])assert.throws(()=>execute(body));
 assert.deepEqual(execute('xs:List<int>?=List<int>();if(xs!=null){for(x:xs){print(x);}}'),[]);
});
