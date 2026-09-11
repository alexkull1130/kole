import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/runtime.mjs';
const cases = [
['class Main { names: List<string>(); static main() -> void { names: List<string>(); names.add("Alex"); print(names); names = List<string>(); print(names.length); person: Main(); print(person.names.length); person = Main(); } }',['[Alex]','0','0']],
['class Box<A> { value: A; Box(value:A) { me.value=value; } } class Main { static main() -> void { box: Box<int>(3); box = Box<int>(4); print(box.value); nested: List<List<string>>(); nested.add(List<string>()); print(nested.length); } }',['4','1']],
['class Person { name:string; Person(name:string) { me.name=name; } } class Main { static main() -> void { person: Person("Alex"); person = Person("Kull"); print(person.name); print(1 < 2, 3 > 2, int(4)); } }',['Kull','true true 4']]
];
for (const [index,[source,expected]] of cases.entries()) test('constructor shorthand '+index,()=>{const output=[];run(source,'Main',{print:line=>output.push(line)});assert.deepEqual(output,expected);});
test('constructor calls retain type, access and abstract checks',()=>{
 for(const source of [
 'class Main { static main() -> void { n: List<string>(1); } }',
 'abstract class Person {} class Main { static main() -> void { p: Person(); } }',
 'class Person { private Person() {} } class Main { static main() -> void { p: Person = Person(); } }',
 'class Main { static main() -> void { n: int = List<string>(); } }'
 ]) assert.throws(()=>run(source,'Main'));
});
export { cases };
