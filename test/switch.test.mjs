import test from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../src/runtime.mjs';
const execute=(body,members='')=>{const lines=[];run('class Main {'+members+' static main() -> void {'+body+'} }','Main',{print:x=>lines.push(x)});return lines;};
test('switch evaluates selector once and only the selected arm',()=>{
 assert.deepEqual(execute('n:int=1; x:int=switch(n++){case 1 -> 7; default -> 1/0;}; print(n,x); print(switch("x"){case "a"->1;default->2;});'),['2 7','2']);
});
test('switch supports enums, null, contextual arrays and numeric result widening',()=>{
 assert.deepEqual(execute('e:E=E.A;print(switch(e){case E.A->"yes";default->"no";}); text:string?=null;print(switch(text){case null->"empty";default->"text";}); xs:int[]=switch(true){case true->[];default->[1];};print(xs.length);print(switch(false){case true->1.5;default->2;}/2);','enum E { A, B }'),['yes','empty','0','1']);
});
test('switch requires default, constant distinct labels and compatible results',()=>{
 for(const body of ['print(switch(1){case 1->2;});','print(switch(1){case 1->2;case 1.0->3;default->0;});','n:int=1;print(switch(n){case n->2;default->0;});','print(switch(1){case 1->"a";default->2;});','print(switch(1){default->0;case 1->2;});'])assert.throws(()=>execute(body));
});
test('switch definite assignment intersects all arms',()=>{
 assert.deepEqual(execute('n:int;x:int=switch(true){case true->(n=3);default->(n=4);};print(n);'),['3']);
 assert.throws(()=>execute('n:int;x:int=switch(true){case true->(n=3);default->4;};print(n);'));
});
