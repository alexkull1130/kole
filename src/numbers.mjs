import { KoleError } from './lexer.mjs';

export const integerTypes = ['byte', 'short', 'int', 'long'];
export const numericTypes = [...integerTypes, 'float'];
export const primitiveTypes = [...numericTypes, 'char', 'bool', 'string'];
export const isNumeric = type => numericTypes.includes(type);
export const ranges = {
  byte: [-128n, 127n], short: [-32768n, 32767n],
  int: [-2147483648n, 2147483647n], long: [-9223372036854775808n, 9223372036854775807n]
};
const fail = (node, message) => { throw new KoleError(message, node?.token ?? node); };
export function number(type, value, node) {
  if (type === 'float') {
    value = Math.fround(Number(value));
    if (!Number.isFinite(value)) fail(node, 'float overflow: result is not finite');
  } else {
    value = BigInt(value);
    if (value < ranges[type][0] || value > ranges[type][1]) fail(node, `${type} overflow: ${value} is outside its range`);
  }
  return Object.freeze({ kind: 'number', type, value });
}
export function literalNumber(text, node) {
  const long = /[lL]$/.test(text), float = /[fF]$/.test(text) || /[.eE]/.test(text);
  const raw = text.replace(/[lLfF]$/, '');
  if (float && long) fail(node, 'A long literal cannot have a decimal point or exponent');
  if (float) return number('float', Number(raw), node);
  const n = BigInt(raw);
  return number(long || n < ranges.int[0] || n > ranges.int[1] ? 'long' : 'int', n, node);
}
export const promoted = (a, b = a) => a === 'float' || b === 'float' ? 'float' : a === 'long' || b === 'long' ? 'long' : 'int';
export const widens = (expected, actual) => isNumeric(expected) && isNumeric(actual) && numericTypes.indexOf(actual) <= numericTypes.indexOf(expected);
export function fitsLiteral(type, numeric) {
  return ['byte', 'short'].includes(type) && numeric?.kind === 'number' && numeric.type === 'int' && numeric.value >= ranges[type][0] && numeric.value <= ranges[type][1];
}
export function convertNumber(type, input, node) {
  if (input?.kind === 'char') input = number('int', input.value.codePointAt(0), node);
  if (input?.kind !== 'number') fail(node, `Conversion to ${type} requires a number or char`);
  if (type === 'float') return number(type, input.value, node);
  return number(type, input.type === 'float' ? BigInt(Math.trunc(input.value)) : input.value, node);
}
export function makeChar(text, node) {
  const chars = [...text];
  const point = text.codePointAt(0);
  if (chars.length !== 1 || (point >= 0xd800 && point <= 0xdfff)) fail(node, 'char requires exactly one Unicode scalar value');
  return Object.freeze({ kind: 'char', value: text });
}
export function convertChar(input, node) {
  if (input?.kind === 'char') return input;
  if (typeof input === 'string') return makeChar(input, node);
  if (input?.kind !== 'number' || input.type === 'float') fail(node, 'Conversion to char requires an integer or one-character string');
  const point = input.value;
  if (point < 0n || point > 0x10ffffn || (point >= 0xd800n && point <= 0xdfffn)) fail(node, 'char conversion requires a valid Unicode scalar value');
  return makeChar(String.fromCodePoint(Number(point)), node);
}
export function unaryNumber(op, input, node) {
  if (input?.kind !== 'number') fail(node, 'Expected a number');
  return number(promoted(input.type), op === '-' ? -input.value : input.value, node);
}
export function binaryNumber(op, left, right, node) {
  if (left?.kind !== 'number' || right?.kind !== 'number') fail(node, 'Expected numeric operands');
  const type = promoted(left.type, right.type);
  const a = type === 'float' ? Math.fround(Number(left.value)) : left.value;
  const b = type === 'float' ? Math.fround(Number(right.value)) : right.value;
  if ((op === '/' || op === '%') && (b === 0n || b === 0)) fail(node, 'Division by zero');
  switch (op) {
    case '==': return a === b; case '!=': return a !== b;
    case '<': return a < b; case '>': return a > b; case '<=': return a <= b; case '>=': return a >= b;
    case '+': return number(type, a + b, node); case '-': return number(type, a - b, node);
    case '*': return number(type, a * b, node); case '/': return number(type, a / b, node); case '%': return number(type, a % b, node);
    default: fail(node, `Unknown numeric operator '${op}'`);
  }
}
export function numericText(numeric) {
  if (numeric.type !== 'float') return numeric.value.toString();
  // Print the shortest decimal that round-trips to the same binary32 value.
  for (let digits = 1; digits <= 9; digits++) {
    const candidate = Number(numeric.value.toPrecision(digits));
    if (Object.is(Math.fround(candidate), numeric.value)) return String(candidate);
  }
  return String(numeric.value);
}
