import { KoleError } from './lexer.mjs';
import { primitiveTypes } from './numbers.mjs';

export function genericParts(type) {
  const open = type.indexOf('<');
  if (open < 0 || !type.endsWith('>')) return null;
  const args = []; let depth = 0, start = open + 1;
  for (let i = start; i < type.length - 1; i++) {
    if (type[i] === '<') depth++;
    else if (type[i] === '>') depth--;
    else if (type[i] === ',' && depth === 0) { args.push(type.slice(start, i)); start = i + 1; }
  }
  args.push(type.slice(start, -1)); return { base: type.slice(0, open), args };
}

export function mapType(type, resolve) {
  if (type.endsWith('?')) return mapType(type.slice(0, -1), resolve) + '?';
  if (type.endsWith('[]')) return mapType(type.slice(0, -2), resolve) + '[]';
  const generic = genericParts(type);
  return generic ? `${resolve(generic.base)}<${generic.args.map(arg => mapType(arg, resolve)).join(',')}>` : resolve(type);
}

/** Reify generic classes into distinct checked class definitions, without erasing types. */
export function specializeGenerics(program) {
  if (program.specialized) return program;
  const definitions = new Map(), templates = new Map(), output = [], instances = new Map();
  const fail = (node, message) => { throw new KoleError(message, node?.token ?? node); };
  for (const cls of program.classes) {
    if (definitions.has(cls.name)) fail(cls, `Duplicate class '${cls.name}'`);
    definitions.set(cls.name, cls);
    if (cls.typeParams?.length) {
      if ([...primitiveTypes, 'List', 'void', 'print', 'boolean', 'String', 'double'].includes(cls.name)) fail(cls, `Reserved class '${cls.name}'`);
      templates.set(cls.name, cls);
    }
  }
  let count = 0;
  const resolve = (type, bindings, node, depth = 0) => {
    if (depth > 32) fail(node, 'Generic type nesting exceeds 32 levels');
    if (type.endsWith('?')) return resolve(type.slice(0, -1), bindings, node, depth + 1) + '?';
    if (type.endsWith('[]')) return resolve(type.slice(0, -2), bindings, node, depth + 1) + '[]';
    if (bindings.has(type)) return bindings.get(type);
    const generic = genericParts(type);
    if (generic) {
      const args = generic.args.map(arg => resolve(arg, bindings, node, depth + 1));
      if (generic.base === 'List') {
        if (args.length !== 1) fail(node, 'List<A> expects one type argument');
        return `List<${args[0]}>`;
      }
      const template = templates.get(generic.base);
      if (!template) fail(node, `Type '${generic.base}' is not generic`);
      if (args.length !== template.typeParams.length) fail(node, `${generic.base} expects ${template.typeParams.length} type arguments`);
      const name = `${generic.base}<${args.join(',')}>`;
      if (!instances.has(name)) {
        if (++count > 256) fail(node, 'Generic specialization limit exceeded (256); check for growing recursive types');
        const clone = structuredClone(template);
        clone.name = name; clone.typeParams = []; clone.genericBase = generic.base;
        clone.typeArguments = args; instances.set(name, clone); output.push(clone);
        clone.aliases = new Map(template.aliases ?? [...definitions.keys()].map(key => [key, key]));
        for (const param of template.typeParams) clone.aliases.delete(param);
        for (const arg of args) mapType(arg, base => { clone.aliases.set('#argument:' + base, base); return base; });
        for (const [alias, target] of clone.aliases) if (target === generic.base) clone.aliases.set(alias, name);
        transform(clone, new Map(template.typeParams.map((param, i) => [param, args[i]])));
      }
      return name;
    }
    if (templates.has(type)) fail(node, `Generic type '${type}' requires explicit type arguments`);
    return type;
  };
  const transform = (cls, bindings) => {
    bindings = new Map(bindings);
    for (const member of cls.members) if (member.kind === 'enum') {
      if (bindings.has(member.name)) fail(member, 'An enum cannot shadow a type parameter');
      bindings.set(member.name, cls.name + '.' + member.name);
    }
    if (cls.parent) cls.parent = resolve(cls.parent, bindings, cls);
    const seen = new Set();
    for (let ancestor = instances.get(cls.parent) ?? definitions.get(cls.parent); ancestor && !seen.has(ancestor.name); ancestor = instances.get(ancestor.parent) ?? definitions.get(ancestor.parent)) {
      seen.add(ancestor.name);
      for (const member of ancestor.members) if (member.kind === 'enum' && !bindings.has(member.name)) bindings.set(member.name, ancestor.name + '.' + member.name);
    }
    const walk = node => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (typeof node.type === 'string' && node.kind !== 'literal' && !node.lifecycle) node.type = resolve(node.type, bindings, node);
      if (node.kind === 'new' || node.kind === 'newList') node.name = resolve(node.name, bindings, node);
      if (node.kind === 'newArray') node.elementType = resolve(node.elementType, bindings, node);
      for (const [key, child] of Object.entries(node)) if (key !== 'token' && !(key === 'value' && node.kind === 'literal')) walk(child);
    };
    walk(cls.members);
    for (const method of cls.members) if (method.constructor === true) method.name = cls.name;
    cls.interfaces = (cls.interfaces ?? []).map(type => resolve(type, bindings, cls));
  };
  // Check each template with opaque types as well as its concrete instantiations.
  // Unconstrained A therefore cannot accidentally acquire int-only operations.
  for (const template of templates.values()) {
    const args = template.typeParams.map(param => {
      const name = `#${template.name}:${param}`;
      output.push({ name, members: [], interfaces: [], isAbstract: true, token: template.token });
      return name;
    });
    resolve(`${template.name}<${args.join(',')}>`, new Map(), template);
  }
  for (const cls of program.classes) if (!templates.has(cls.name)) {
    const clone = structuredClone(cls); output.push(clone); transform(clone, new Map());
  }
  return { ...program, classes: output, specialized: true };
}
