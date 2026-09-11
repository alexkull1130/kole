import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.mjs';
import { Runtime, run } from '../src/runtime.mjs';
import { check } from '../src/checker.mjs';

const program = (body, members = '') => `class Main { ${members} static main() -> void { ${body} } }`;
const validate = source => { const p = parse(source); check(p, new Runtime(p)); };
function execute(body, members = '') {
  const output = []; run(program(body, members), 'Main', { print: line => output.push(line) }); return output;
}

test('primitives: bool, string and float replace the old names', () => {
  assert.deepEqual(execute('ready: bool=true; name: string="kole"; amount: float=1.5; print(ready,name,amount);'), ['true kole 1.5']);
  for (const [old, replacement] of [['boolean', 'bool'], ['String', 'string'], ['double', 'float']]) {
    assert.throws(() => parse(program(`value: ${old};`)), new RegExp(`Use '${replacement}'`));
  }
});
test('primitives: integer minima and maxima are exact', () => {
  assert.deepEqual(execute('a: byte=-128; b: short=-32768; c: int=-2147483648; d: long=-9223372036854775808L; print(a,b,c,d); print(127,32767,2147483647,9223372036854775807L);'), ['-128 -32768 -2147483648 -9223372036854775808', '127 32767 2147483647 9223372036854775807']);
});
test('primitives: long arithmetic does not lose precision beyond JavaScript safe integers', () => {
  assert.deepEqual(execute('x: long=9007199254740993L; print(x+2L, x==9007199254740992L);'), ['9007199254740995 false']);
});
test('primitives: promotions apply at assignments, parameters and returns', () => {
  assert.deepEqual(execute('small: byte=5; print(twice(small)); f: float=1; print(f/2);', 'static twice(n: long) -> long { return n*2; }'), ['10', '0.5']);
  assert.deepEqual(execute('print(f()/2);', 'static f() -> float { return 1; }'), ['0.5']);
});
test('primitives: narrowing variables requires an explicit conversion', () => {
  assert.throws(() => validate(program('n: int=1; b: byte=n;')), /Expected byte/);
  assert.throws(() => validate(program('n: long=1L; i: int=n;')), /Expected int/);
  assert.deepEqual(execute('n: int=12; b: byte=byte(n); print(b,int(-3.9),long(8.7));'), ['12 -3 8']);
});
test('primitives: invalid narrowing literals and conversions are checked', () => {
  assert.throws(() => validate(program('b: byte=128;')), /Expected byte/);
  assert.throws(() => execute('print(byte(128));'), /byte overflow/);
  assert.throws(() => execute('print(short(32768));'), /short overflow/);
  assert.throws(() => execute('print(int(2147483648L));'), /int overflow/);
  assert.throws(() => execute('print(long(1e30));'), /long overflow/);
});
test('primitives: overflow is checked on intermediate arithmetic and unary negation', () => {
  assert.throws(() => execute('print(2147483647 + 1 - 1);'), /int overflow/);
  assert.throws(() => execute('print(50000*50000);'), /int overflow/);
  assert.throws(() => execute('print(9223372036854775807L+1L);'), /long overflow/);
  assert.throws(() => execute('n: int=-2147483648; print(-n);'), /int overflow/);
});
test('primitives: compound updates narrow back with bounds checks', () => {
  assert.deepEqual(execute('b: byte=1; b+=2; b++; print(b);'), ['4']);
  assert.throws(() => execute('b: byte=127; b++;'), /byte overflow/);
  assert.throws(() => execute('s: short=32767; s+=1;'), /short overflow/);
  assert.deepEqual(execute('n: int=2; n+=1.9; print(n);'), ['3']);
});
test('primitives: integral division truncates toward zero and remainder follows dividend', () => {
  assert.deepEqual(execute('print(7/2,-7/2,7/-2,-7%2,7%-2,7.0/2);'), ['3 -3 -3 -1 1 3.5']);
  assert.throws(() => execute('print(-2147483648/-1);'), /int overflow/);
  assert.throws(() => execute('print(1/0);'), /Division by zero/);
  assert.throws(() => execute('print(1.0%0.0);'), /Division by zero/);
});
test('primitives: float uses binary32 precision and checked finite results', () => {
  assert.deepEqual(execute('x: float=16777216.0; print(x+1.0==x,19.99,1e-3,2f);'), ['true 19.99 0.001 2']);
  assert.throws(() => execute('print(3e38*2.0);'), /float overflow/);
  assert.throws(() => parse(program('print(1e99);')), /float overflow/);
});
test('primitives: char is one Unicode scalar, distinct from string', () => {
  assert.deepEqual(execute("a: char='A'; face: char='😀'; print(a,face,int(a),int(face),char(128512),string(a));"), ['A 😀 65 128512 😀 A']);
  assert.throws(() => validate(program('s: string=\'x\';')), /Expected string/);
  assert.throws(() => validate(program('c: char="x";')), /Expected char/);
  assert.deepEqual(execute("print('A'<'B', 'A'=='A');"), ['true true']);
});
test('primitives: character literals, escapes and conversions reject invalid scalars', () => {
  assert.throws(() => parse(program("print('ab');")), /exactly one Unicode/);
  assert.throws(() => parse(program("print('');")), /exactly one Unicode/);
  assert.throws(() => execute('print(char(55296));'), /Unicode scalar/);
  assert.throws(() => execute('print(char(1114112));'), /Unicode scalar/);
  assert.throws(() => execute('print(char("two"));'), /exactly one Unicode/);
  assert.deepEqual(execute("print('\u{1F600}', '\\u{41}');"), ['😀 A']);
});
test('primitives: string length and indexing use Unicode scalar positions', () => {
  assert.deepEqual(execute('s: string="A😀B"; c: char=s[1]; print(s.length,c);'), ['3 😀']);
  assert.throws(() => execute('print("x"[1]);'), /out of bounds/);
});
test('primitives: nullable numeric values must be narrowed before conversion', () => {
  assert.throws(() => validate(program('', 'f(n: int?) -> long { return long(n); }')), /Cannot convert/);
  validate(program('', 'f(n: int?) -> long { if(n==null) { return 0L; } return long(n); }'));
});
test('primitives: invalid conversions, arity and malformed literals have source errors', () => {
  assert.throws(() => validate(program('print(int("12"));')), /Cannot convert/);
  assert.throws(() => validate(program('print(bool(1));')), /Cannot convert/);
  assert.throws(() => validate(program('print(int());')), /one argument/);
  assert.throws(() => parse(program('print(1e+);')), /Exponent requires digits/);
  assert.throws(() => parse(program('print(1.0L);')), /long literal/);
  assert.throws(() => parse(program('print(9223372036854775808L);')), /long overflow/);
});
