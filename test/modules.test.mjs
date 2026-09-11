import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProgram } from '../src/modules.mjs';
import { Runtime } from '../src/runtime.mjs';
import { check } from '../src/checker.mjs';
function fixture(files, action) {const root=fs.mkdtempSync(path.join(os.tmpdir(),'kole-modules-'));try {for(const [file,text] of Object.entries(files)){const dest=path.join(root,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,text);}return action(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}
function exec(file) {const p=loadProgram(file),lines=[];const r=new Runtime(p,{print:x=>lines.push(x)});check(p,r);r.run(p.entry);return {lines,p};}
test('packages import OOP declarations and retain namespace identity',()=>fixture({
 'app/Main.k':'package app; import pets.Dog; import pets.Animal; class Main {static main() -> void {a:Animal=new Dog();print(a.speak());}}',
 'pets/Animal.k':'package pets; abstract class Animal {abstract speak() -> string;}',
 'pets/Dog.k':'package pets; import pets.Animal; class Dog extends Animal {override speak() -> string{return "woof";}}'
}, root=>assert.deepEqual(exec(path.join(root,'app/Main.k')).lines,['woof'])));
test('relative imports load once, tolerate file cycles, and support static names',()=>fixture({
 'Main.k':'import "./Helper.k"; class Main {static main() -> void {print(Helper.message());}}',
 'Helper.k':'import "./Main.k"; class Helper {static message() -> string{return "hello";}}'
},root=>{const {lines,p}=exec(path.join(root,'Main.k'));assert.deepEqual(lines,['hello']);assert.equal(p.files.length,2);}));
test('different packages can contain classes with the same short name',()=>fixture({
 'Main.k':'import a.User; import b.Factory; class Main {static main() -> void {a:User=new User();print(a.name(),Factory.describe());}}',
 'a/User.k':'package a; class User {name() -> string{return "a";}}',
 'b/User.k':'package b; class User {name() -> string{return "b";}}',
 'b/Factory.k':'package b; import b.User; class Factory {static describe() -> string {u:User=new User();return u.name();}}'
},root=>assert.deepEqual(exec(path.join(root,'Main.k')).lines,['a b'])));
test('imports diagnose missing files, mismatches, ambiguity, and unimported names',()=>{
 for(const [files,pattern] of [
 [{'Main.k':'import missing.Item; class Main {}'},/Import.*Cannot load/],
 [{'Main.k':'import pets.Dog; class Main {}','pets/Dog.k':'package wrong; class Dog {}'},/does not match/],
 [{'Main.k':'import a.User; import b.User; class Main {}','a/User.k':'package a; class User {}','b/User.k':'package b; class User {}'},/ambiguous/],
 [{'Main.k':'import "Helper.k"; class Main {static main() -> void {x:Hidden=new Hidden();}}','Helper.k':'import "Hidden.k"; class Helper {}','Hidden.k':'class Hidden {}'},/must be imported/],
 ]) fixture(files,root=>assert.throws(()=>exec(path.join(root,'Main.k')),pattern));
});
test('errors retain the imported source location',()=>fixture({'Main.k':'import "Bad.k"; class Main {}','Bad.k':'class Bad { f() -> int { return "bad"; } }'},root=>{
 assert.throws(()=>exec(path.join(root,'Main.k')),error=>error.file===path.join(root,'Bad.k') && /Expected int/.test(error.message));
}));
test('packaged lifecycle enums remain properly qualified',()=>fixture({
 'Main.k':'import app.Counter; class Main {static main() -> void {c:Counter=new Counter();c.close();print(c.read());}}',
 'app/Counter.k':'package app; class Counter {enum State{OPEN,CLOSED} private state status:State=OPEN; close() -> void transitions OPEN -> CLOSED {} read() -> int requires CLOSED {return 1;}}'
},root=>assert.deepEqual(exec(path.join(root,'Main.k')).lines,['1'])));
// integration cases for generic modules
test('imported generic classes work with caller-defined argument types',()=>fixture({
 'Main.k':'import lib.Box; class Item {name:string="kole";} class Main {static main() -> void {b:Box<Item>=new Box<Item>(new Item());print(b.get().name);}}',
 'lib/Box.k':'package lib; class Box<A> {private item:A;Box(item:A){me.item=item;}get() -> A{return item;}}'
},root=>assert.deepEqual(exec(path.join(root,'Main.k')).lines,['kole'])));
test('imported generic inheritance and interface types are canonical',()=>fixture({
 'Main.k':'import lib.Box; import lib.Value; class Main {static main() -> void {v:Value<int>=new Box<int>(5);print(v.get());}}',
 'lib/Value.k':'package lib; interface Value<A>{get() -> A;}',
 'lib/Box.k':'package lib; import lib.Value; class Box<A> implements Value<A>{item:A;Box(item:A){me.item=item;}get() -> A{return item;}}'
},root=>assert.deepEqual(exec(path.join(root,'Main.k')).lines,['5'])));
