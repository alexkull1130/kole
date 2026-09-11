import test from 'node:test';
import assert from 'node:assert/strict';
import { run, Runtime } from '../src/runtime.mjs';
import { parse } from '../src/parser.mjs';
import { check } from '../src/checker.mjs';
const exec = (body, members='', classes='') => {const lines=[];run(`${classes} class Main {${members} static main() -> void {${body}}}`, 'Main',{print:x=>lines.push(x)});return lines;};
const valid=s=>{const p=parse(s);check(p,new Runtime(p));};
test('typed catch handles subclasses, rethrow, and runtime faults',()=>{
 assert.deepEqual(exec('try {throw new Problem("oops");} catch(e:Problem){print(e.message);} try {print(1/0);} catch(e:RuntimeError){print("caught");} finally {print("finally");}', '', 'class Problem extends Error {Problem(message:string){super(message);}}'),['oops','caught','finally']);
 assert.deepEqual(exec('try {try {throw new Error("x");} catch(e:Error){throw e;}} catch(e:Error){print(e.message);}'),['x']);
});
test('finally runs on return, break, continue and may replace a return',()=>{
 assert.deepEqual(exec('print(f());for(i=0:3:+){try {if(i==0){continue;}break;} finally{print(i);}}','static f() -> int {try{return 1;}finally{return 2;}}'),['2','0','1']);
});
test('using closes on return and errors in reverse nested order',()=>{
 const resource='class Resource implements Closeable {name:string;Resource(name:string){me.name=name;}close() -> void {print("closed "+name);}}';
 assert.deepEqual(exec('try {using(a:Resource=new Resource("a")){using(b:Resource=new Resource("b")){throw new Error("x");}}}catch(e:Error){print(e.message);}', '',resource),['closed b','closed a','x']);
 assert.deepEqual(exec('f();','static f() -> void {using(r:Resource=new Resource("r")){return;}}',resource),['closed r']);
});
test('cleanup failure preserves an existing error and overrides a normal return',()=>{
 const r='class Resource implements Closeable {close() -> void {throw new Error("close");}}';
 assert.deepEqual(exec('try {using(r:Resource=new Resource()){throw new Error("body");}}catch(e:Error){print(e.message);}', '', r),['body']);
 assert.deepEqual(exec('try {using(r:Resource=new Resource()) {}}catch(e:Error){print(e.message);}', '', r),['close']);
});
test('invalid catch, throw, using, and definite assignment fail statically',()=>{
 for(const s of ['throw 1;', 'try {} catch(e:string){}', 'try {} catch(e:Error){} catch(e:RuntimeError){}', 'using(r:int=1){}', 'x:int;try{x=1;}catch(e:Error){print(x);}', 'x:int;try{x=1;}finally{print(x);}']) assert.throws(()=>valid(`class Main{static main() -> void{${s}}}`));
});
test('uncaught exceptions carry kole method frames',()=>{
 assert.throws(()=>exec('f();','static f() -> void {throw new Error("bad");}'), e=>e.message==='bad'&&e.koleStack.some(frame=>frame.method==='Main.f'));
});
