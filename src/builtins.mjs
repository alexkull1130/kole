import { number, makeChar } from './numbers.mjs';

export function builtinSignature(type, name) {
  if (type === 'string') return {
    isEmpty: [[], 'bool'], contains: [['string'], 'bool'], startsWith: [['string'], 'bool'], endsWith: [['string'], 'bool'],
    indexOf: [['string'], 'int'], lastIndexOf: [['string'], 'int'], charAt: [['int'], 'char'],
    substring: [['int', 'int'], 'string'], toUpperCase: [[], 'string'], toLowerCase: [[], 'string'], trim: [[], 'string'],
    replace: [['string', 'string'], 'string'], split: [['string'], 'string[]'], repeat: [['int'], 'string'], toCharArray: [[], 'char[]'],
  }[name];
  const list = type.startsWith('List<') && type.endsWith('>'), array = type.endsWith('[]');
  if (!list && !array) return;
  const A = list ? type.slice(5, -1) : type.slice(0, -2);
  return {
    get: [['int'], A], set: [['int', A], 'void'], isEmpty: [[], 'bool'], contains: [[A], 'bool'],
    indexOf: [[A], 'int'], lastIndexOf: [[A], 'int'], first: [[], A], last: [[], A],
    reverse: [[], 'void'], copy: [[], type], slice: [['int', 'int'], type], join: [['string'], 'string'],
    toArray: [[], A + '[]'], toList: [[], `List<${A}>`],
    ...(list ? { add: [[A], 'void'], addAll: [[A + '[]'], 'void'], insert: [['int', A], 'void'],
      remove: [[A], 'bool'], removeAt: [['int'], A], clear: [[], 'void'] } : {}),
  }[name];
}

export function callBuiltin(runtime, { object, name }, args, node) {
  const type = runtime.runtimeType(object), signature = builtinSignature(type, name);
  if (!signature || signature[0].length !== args.length) runtime.fail(node, `${type}.${name} expects ${signature?.[0].length ?? 0} arguments`);
  args = args.map((arg, i) => runtime.checkType(signature[0][i], arg, object?.owner, node));
  const integer = x => number('int', x, node);
  const range = length => {
    const start = runtime.index(args[0], node), end = runtime.index(args[1], node);
    if (start < 0 || end < start || end > length) runtime.fail(node, 'Invalid slice range: require 0 <= start <= end <= length');
    return [start, end];
  };
  if (typeof object === 'string') {
    const chars = [...object];
    switch (name) {
      case 'isEmpty': return object.length === 0;
      case 'contains': return object.includes(args[0]);
      case 'startsWith': return object.startsWith(args[0]);
      case 'endsWith': return object.endsWith(args[0]);
      case 'indexOf': case 'lastIndexOf': {
        const index = object[name](args[0]); return integer(index < 0 ? -1 : [...object.slice(0, index)].length);
      }
      case 'charAt': { const index = runtime.index(args[0], node); runtime.bounds(chars, index, node); return makeChar(chars[index], node); }
      case 'substring': return chars.slice(...range(chars.length)).join('');
      case 'toUpperCase': return object.toUpperCase();
      case 'toLowerCase': return object.toLowerCase();
      case 'trim': return object.trim();
      case 'replace':
        if (args[0] === '') runtime.fail(node, 'replace requires a nonempty search string');
        return object.split(args[0]).join(args[1]);
      case 'split': return runtime.collection('array', 'string', args[0] === '' ? chars : object.split(args[0]), null, node);
      case 'toCharArray': return runtime.collection('array', 'char', chars.map(c => makeChar(c, node)), null, node);
      case 'repeat': {
        const count = runtime.index(args[0], node);
        if (count < 0 || count > 100000 || chars.length * count > 100000) runtime.fail(node, 'Repeated string length/count must be between 0 and 100000');
        return object.repeat(count);
      }
    }
  }
  const items = object.items;
  const find = reverse => {
    for (let i = reverse ? items.length - 1 : 0; reverse ? i >= 0 : i < items.length; i += reverse ? -1 : 1)
      if (runtime.binary('==', items[i], args[0], node)) return i;
    return -1;
  };
  switch (name) {
    case 'isEmpty': return items.length === 0;
    case 'contains': return find(false) >= 0;
    case 'indexOf': return integer(find(false));
    case 'lastIndexOf': return integer(find(true));
    case 'remove': { const i = find(false); if (i < 0) return false; items.splice(i, 1); return true; }
    case 'first': runtime.bounds(items, 0, node); return items[0];
    case 'last': runtime.bounds(items, items.length - 1, node); return items.at(-1);
    case 'clear': items.length = 0; return;
    case 'reverse': items.reverse(); return;
    case 'join': return items.map(item => runtime.format(item)).join(args[0]);
    case 'copy': case 'toArray': case 'toList': case 'slice':
      return runtime.collection(name === 'toArray' ? 'array' : name === 'toList' ? 'list' : object.kind,
        object.elementType, name === 'slice' ? items.slice(...range(items.length)) : items.slice(), object.owner, node);
    case 'add': runtime.collectionSize(items.length + 1, node); items.push(args[0]); return;
    case 'addAll': runtime.collectionSize(items.length + args[0].items.length, node); items.push(...args[0].items); return;
    case 'insert': {
      const i = runtime.index(args[0], node);
      if (i < 0 || i > items.length) runtime.fail(node, 'Insert index out of bounds');
      runtime.collectionSize(items.length + 1, node); items.splice(i, 0, args[1]); return;
    }
    default: {
      const i = runtime.index(args[0], node); runtime.bounds(items, i, node);
      if (name === 'get') return items[i];
      if (name === 'removeAt') return items.splice(i, 1)[0];
      if (name === 'set') { items[i] = args[1]; return; }
    }
  }
}
