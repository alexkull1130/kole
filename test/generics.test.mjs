import test from 'node:test';
import assert from 'node:assert/strict';
import { run, Runtime } from '../src/runtime.mjs';
import { parse } from '../src/parser.mjs';
import { check } from '../src/checker.mjs';
const valid = source => {const p=parse(source);check(p,new Runtime(p));};
const exec = source => {const lines=[];run(source,'Main',{print:x=>lines.push(x)});return lines;};
const box='class Box<A> {private item:A; Box(item:A){me.item=item;} get() -> A{return item;} set(item:A) -> void{me.item=item;} }';
test('generic classes preserve concrete types in constructors, fields and methods',()=> {
 assert.deepEqual(exec(box+'class Main {static main() -> void {n:Box<int>=new Box<int>(7);s:Box<string>=new Box<string>("kole");n.set(9);print(n.get(),s.get());}}'),['9 kole']);
});
test('generic interfaces and inheritance use required override and dispatch',()=> {
 assert.deepEqual(exec('interface Value<A>{get() -> A;} abstract class Base<A> implements Value<A>{abstract get() -> A;} class Box<A> extends Base<A>{item:A;Box(item:A){super();me.item=item;}override get() -> A{return item;}} class Main {static main() -> void {v:Value<string>=new Box<string>("yes");b:Base<int>=new Box<int>(3);print(v.get(),b.get());}}'),['yes 3']);
});
test('generic multiple parameters and nested arrays/lists work',()=> {
 assert.deepEqual(exec(box+'class Pair<A,B>{first:A;second:B;Pair(a:A,b:B){first=a;second=b;}} class Main {static main() -> void {p:Pair<string,Box<int>>=new Pair<string,Box<int>>("x",new Box<int>(8));xs:List<Box<int>>=new List<Box<int>>();xs.add(p.second);b:Box<int[]>=new Box<int[]>([1,2]);print(p.first,xs.first().get(),b.get());}}'),['x 8 [1, 2]']);
});
test('generic recursive references and nullable parameters',()=> {
 assert.deepEqual(exec('class Link<A>{value:A;next:Link<A>?=null;Link(value:A){me.value=value;}} class Main {static main() -> void {a:Link<string?>=new Link<string?>(null);b:Link<string?>=new Link<string?>("end");a.next=b;print(a.value,b.value);}}'),['null end']);
});
test('generics reject raw types, wrong arity, unknown arguments and invariant assignments',()=> {
 for(const [source,pattern] of [
 [box+'class Main {b:Box;}',/explicit type arguments/],
 [box+'class Main {b:Box<int,string>;}',/expects 1 type arguments/],
 ['class Empty<A>{} class Main {e:Empty<Missing>=new Empty<Missing>();}',/Unknown type/],
 [box+'class Main {static main() -> void {b:Box<long>=new Box<int>(1);}}',/Expected Box<long>/],
 [box+'class Main {static main() -> void {b:Box<int>=new Box<int>("x");}}',/Expected int/],
 ['class Main {xs:List<int,string>;}',/expects one/],
 ]) assert.throws(()=>valid(source),pattern);
});
test('uninstantiated generic bodies are checked against opaque type parameters',()=> {
 assert.throws(()=>valid('class Broken<A>{f(x:A) -> A {return x+1;}}'),/requires numeric/);
 assert.throws(()=>valid('class Broken<A>{f() -> A {return new A();}}'),/abstract class/);
 assert.throws(()=>valid('class Broken<A>{f() -> A {return 1;}}'),/Expected/);
});
test('growing generic recursion fails with a bounded diagnostic',()=> {
 assert.throws(()=>valid('class Grow<A>{next:Grow<List<A>>?=null;}'),/nesting|specialization limit/);
});
test('generic arguments preserve local and inherited enum identity',()=> {
 assert.deepEqual(exec(box+'class Base {enum State{OPEN,CLOSED}} class Main extends Base {static main() -> void {b:Box<State>=new Box<State>(State.OPEN);print(b.get());}}'),['State.OPEN']);
});
