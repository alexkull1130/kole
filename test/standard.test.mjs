import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from '../src/runtime.mjs';
const exec=(body,options={})=>{const lines=[];run(`class Main{static main() -> void{${body}}}`,'Main',{print:x=>lines.push(x),...options});return lines;};
test('console input is nullable at EOF and output accepts strings',()=>{
 const input=['Alex',null],written=[];
 assert.deepEqual(exec('name:string?=Console.readLine();if(name!=null){Console.write("Hello ");Console.writeLine(name);}print(Console.readLine());',{input:()=>input.shift(),write:x=>written.push(x)}),['Alex','null']);
 assert.deepEqual(written,['Hello ']);
});
test('math and explicit text parsing use checked numeric semantics',()=>{
 assert.deepEqual(exec('print(Math.sqrt(9),Math.pow(2,3),Math.round(-1.5),Math.floor(1.8),Math.ceil(1.2),Math.min(1,2),Math.max(1,2),Math.abs(-2));print(Int.parse(" 42 "),Float.parse("1.25e1"));try{Int.parse("bad");}catch(e:RuntimeError){print("invalid");}'),['3 8 -2 1 2 1 2 2','42 12.5','invalid']);
});
test('text files round trip, close deterministically, and throw IOError',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kole-io-')),file=JSON.stringify(path.join(dir,'tasks.txt'));
 try{
 assert.deepEqual(exec(`File.writeText(${file},"Alex\\nKull\\n");print(File.exists(${file}),File.readLines(${file}));using(f:TextFile=File.open(${file},"r")){print(f.readLine(),f.readLine(),f.readLine());f.close();print(f.isClosed());try{f.readLine();}catch(e:IOError){print("closed");}}File.appendText(${file},"kole\\n");print(File.readLines(${file}).length);`),['true [Alex, Kull]','Alex Kull null','true','closed','3']);
 assert.deepEqual(exec(`try{File.readText(${JSON.stringify(path.join(dir,'missing.txt'))});}catch(e:IOError){print("missing");}`),['missing']);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('task manager saves, reloads, completes and removes tasks',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),dir=fs.mkdtempSync(path.join(os.tmpdir(),'kole-tasks-')),file=path.join(dir,'tasks.txt');
 const session=input=>spawnSync(process.execPath,['src/cli.mjs','run','examples/tasks/TaskManager.k',file],{cwd:root,encoding:'utf8',input});
 try{
 const first=session('add Build kole\nadd Write tests\ndone 1\nlist\nquit\n');assert.equal(first.status,0,first.stderr);assert.match(first.stdout,/\[x\] Build kole/);assert.equal(fs.readFileSync(file,'utf8'),'1\tBuild kole\n0\tWrite tests\n');
 const second=session('list\nremove 1\nquit\n');assert.equal(second.status,0,second.stderr);assert.match(second.stdout,/\[x\] Build kole/);assert.equal(fs.readFileSync(file,'utf8'),'0\tWrite tests\n');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
