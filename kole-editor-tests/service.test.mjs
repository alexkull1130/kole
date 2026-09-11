import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/package-vscode.mjs',import.meta.url)),'--stage-only'],{stdio:'pipe'});
const service=await import(pathToFileURL(path.resolve('.kole-build/vscode/extension/language-service.mjs')).href);
test('editor offers typed string and List methods',()=>{
 const source='class Main {static main() -> void {name:string="kole"; print(name.length); xs:List<int>=new List<int>(); print(xs.length);}}';
 const index=service.indexDocument(source,'Main.k');
 assert.ok(service.completions(index,source.indexOf('name.length')+5,[index]).some(c=>c.name==='substring'&&c.detail.includes('int, int')));
 assert.ok(service.completions(index,source.indexOf('xs.length')+3,[index]).some(c=>c.name==='add'&&c.detail==='add(int) -> void'));
});
test('editor resolves local and member definitions with visibility',()=>{
 const source='class Person {private secret:int=1; name:string="Alex";} class Main {static main() -> void {person:Person=new Person(); print(person.name);}}';
 const index=service.indexDocument(source,'Main.k');
 const methods=service.completions(index,source.lastIndexOf('person.name')+7,[index].values());assert.ok(methods.some(c=>c.name==='name'));assert.ok(!methods.some(c=>c.name==='secret'));
 const field=service.definition(index,source.lastIndexOf('person.name')+9,[index].values());assert.equal(field.name,'name');assert.equal(field.column,source.indexOf('name:string'));
 const local=service.definition(index,source.lastIndexOf('person.name')+2,[index]);assert.equal(local.name,'person');assert.equal(local.column,source.indexOf('person:Person'));
});
test('editor substitutes generic method result types',()=>{
 const source='class Box<A>{item:A;Box(item:A){me.item=item;}get() -> A{return item;}} class Main{static main() -> void {box:Box<string>=new Box<string>("x");print(box.get());}}';
 const index=service.indexDocument(source,'Main.k');const member=service.completions(index,source.lastIndexOf('box.get')+4,[index]).find(x=>x.name==='get');assert.equal(member.type,'string');
});
test('editor diagnostics use unsaved source and imported file overlays without executing code',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kole-editor-')),file=path.join(dir,'Main.k'),dependency=path.join(dir,'Helper.k');
 try{
 fs.writeFileSync(dependency,'class Helper {static value() -> int {return 1;}}');
 const source='import "Helper.k"; class Main {static main() -> void {print(Helper.value());}}';
 assert.deepEqual(service.analyze(file,source),[]);
 const errors=service.analyze(file,source,new Map([[dependency,'class Helper {static value() -> int {return "bad";}}']]));assert.equal(errors.length,1);assert.equal(errors[0].file,dependency);assert.match(errors[0].message,/Expected int/);
 assert.deepEqual(service.analyze(file,'class Main {static main() -> void {while(true){}}}'),[]);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
