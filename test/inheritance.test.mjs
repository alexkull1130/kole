import test from 'node:test';
import assert from 'node:assert/strict';
import { run, Runtime } from '../src/runtime.mjs';
import { parse } from '../src/parser.mjs';
import { check } from '../src/checker.mjs';
const valid = source => {const p=parse(source); check(p,new Runtime(p));};
const exec = source => { const lines=[];run(source,'Main',{print:x=>lines.push(x)});return lines; };
test('inheritance dispatches through parent and interface references, with super calls',()=>{
 assert.deepEqual(exec(`interface Speaker { speak() -> string; }
 abstract class Animal implements Speaker { private name: string; Animal(name: string) { me.name=name; } label() -> string {return name;} abstract speak() -> string; }
 class Dog extends Animal { Dog(name: string) { super(name); } override speak() -> string {return super.label()+" woof";} }
 class Main {static main() -> void { animal: Animal=new Dog("Rex"); speaker: Speaker=new Dog("Spot"); print(animal.speak(),speaker.speak()); }} `),['Rex woof Spot woof']);
});
test('parent construction precedes child initializers and body',()=> {
 assert.deepEqual(exec(`class Base { x: int; Base(n: int) { x=n; print("base"); } }
 class Child extends Base { y: int=x+1; Child(n: int) {super(n); print(y);} }
 class Main {static main() -> void {c: Child=new Child(4);print(c.x,c.y);}}`),['base','5','4 5']);
});
test('implicit zero argument parent calls and multiple levels',()=> {
 assert.deepEqual(exec(`class A {n: int=1; value() -> int{return n;}} class B extends A {override value() -> int {return super.value()+1;}} class C extends B {override value() -> int {return super.value()+1;}} class Main {static main() -> void {a: A=new C();print(a.value());}}`),['3']);
});
test('inheritance rejects cycles, missing override, mismatches and shadowing',()=> {
 const failures=[['class A extends B {} class B extends A {}',/cycle/],['class A {} class B extends Missing {}',/extends requires/],['class A {f() -> int{return 1;}} class B extends A {f() -> int{return 2;}}',/add override/],['class A {} class B extends A {override f() -> void{}}',/no parent/],['class A {f() -> int{return 1;}} class B extends A {override f() -> string{return "x";}}',/signature/],['class A {x:int=1;} class B extends A {x:int=2;}',/shadowed/],['class A {private f() -> void{}} class B extends A {override f() -> void{}}',/accessible instance/]];
 for(const [source,pattern] of failures) assert.throws(()=>valid(source),pattern);
});
test('abstract classes require implementations and cannot be created or called with super',()=> {
 for (const [source,pattern] of [
 ['abstract class A {abstract f() -> void;} class B extends A {}',/must implement/],
 ['abstract class A {} class Main {static main() -> void {a:A=new A();}}',/Cannot construct abstract/],
 ['abstract class A {abstract f() -> void;} class B extends A {override f() -> void {super.f();}}',/abstract parent/],
 ['class A {abstract f() -> void;}',/abstract class/],
 ]) assert.throws(()=>valid(source),pattern);
});
test('private inherited fields remain private and methods keep declaring scope',()=> {
 assert.deepEqual(exec('class A {private x:int=3; read() -> int {return x;}} class B extends A {} class Main {static main() -> void {b:B=new B();print(b.read());}}'),['3']);
 assert.throws(()=>valid('class A {private x:int=3;} class B extends A {read() -> int{return x;}}'),/private/);
});
test('super constructor placement, arity, privacy and initialization are checked',()=> {
 for(const [source,pattern] of [
 ['class A {A(n:int){}} class B extends A {}',/constructor/],
 ['class A {private A(){}} class B extends A {}',/private/],
 ['class A {} class B extends A {B(){print(1);super();}}',/first constructor/],
 ['class A {A(n:int){}} class B extends A {x:int=1; B(){super(me.x);}}',/static method/],
 ['class A {} class B extends A {x:int; B(){super();}}',/must be initialized/],
 ['class A {f() -> void {super();}}',/first constructor/],
 ['class A {} class B extends A {static f() -> void {super.f();}}',/subclass instance/],
 ]) assert.throws(()=>valid(source),pattern);
});
test('constructor virtual dispatch cannot read uninitialized subclass fields',()=> {
 assert.throws(()=>exec('class A {A(){f();} f() -> void {}} class B extends A {x:int=7; override f() -> void {print(x);}} class Main {static main() -> void {b:B=new B();}}'),/before all fields/);
});
