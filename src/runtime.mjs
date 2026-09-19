import { withStandard, KoleThrown, invokeStandard, readConsoleLine } from './standard.mjs';
import { specializeGenerics, genericParts } from './generics.mjs';
import { linkInheritance, isSubtype } from './inheritance.mjs';
import { builtinSignature, callBuiltin } from './builtins.mjs';
import { KoleError } from './lexer.mjs';
import { parse } from './parser.mjs';
import { check } from './checker.mjs';
import { primitiveTypes, isNumeric, number, widens, fitsLiteral, convertNumber, convertChar, makeChar, binaryNumber, unaryNumber, numericText } from './numbers.mjs';

const UNSET = Symbol('uninitialized');
class Flow { constructor(kind, value) { this.kind = kind; this.value = value; } }
class Scope {
  constructor(parent = null, owner = parent?.owner, self = parent?.self) {
    this.parent = parent; this.owner = owner; this.self = self; this.bindings = new Map();
  }
  find(name) { return this.bindings.get(name) ?? this.parent?.find(name); }
}

export class Runtime {
  constructor(program, { print = console.log, maxSteps = 1_000_000, input = readConsoleLine, write = text => process.stdout.write(text) } = {}) {
    program = specializeGenerics(withStandard(program));
    this.classes = new Map(); this.print = print; this.input = input; this.writeOutput = write; this.steps = 0; this.maxSteps = maxSteps; this.depth = 0;
    for (const declaration of program.classes) {
      if (this.classes.has(declaration.name) || [...primitiveTypes, 'boolean', 'String', 'double', 'List', 'void', 'print'].includes(declaration.name)) this.fail(declaration, `Duplicate or reserved class '${declaration.name}'`);
      this.classes.set(declaration.name, { kind: declaration.isInterface ? 'interface' : 'class', name: declaration.name, aliases: declaration.aliases, genericBase: declaration.genericBase, fields: new Map(), methods: new Map(), enums: new Map(), declaration, lifecycle: null, interfaces: new Set(declaration.interfaces ?? []) });
    }
    for (const cls of this.classes.values()) {
      const names = new Set();
      for (const m of cls.declaration.members) {
        if (names.has(m.name)) this.fail(m, `Duplicate member '${m.name}'; overloading is not supported yet`);
        if (m.name === cls.name && !(m.kind === 'method' && m.constructor)) this.fail(m, 'Only a constructor may use the class name as a member name');
        names.add(m.name);
        if (m.kind === 'field') {
          cls.fields.set(m.name, m);
          if (m.lifecycle) {
            if (cls.lifecycle) this.fail(m, 'Only one lifecycle field is supported per class');
            if (m.access !== 'private' || !m.init) this.fail(m, 'A lifecycle field must be private and initialized');
            cls.lifecycle = m;
          }
        } else if (m.kind === 'enum') {
          if (this.classes.has(m.name) || [...primitiveTypes, 'List', 'void'].includes(m.name)) this.fail(m, `Enum name '${m.name}' conflicts with a type name`);
          if (new Set(m.values).size !== m.values.length) this.fail(m, 'Duplicate enum state');
          const values = new Map(m.values.map(name => [name, { kind: 'enumValue', owner: cls.name, type: m.name, name }]));
          cls.enums.set(m.name, { kind: 'enum', owner: cls.name, name: m.name, values, declaration: m });
        } else cls.methods.set(m.name, m);
      }
      for (const method of cls.methods.values()) {
        const parameters = new Set();
        for (const p of method.params) {
          if (parameters.has(p.name)) this.fail(p, `Duplicate parameter '${p.name}'`);
          parameters.add(p.name);
        }
      }
    }
    linkInheritance(this);
    for (const cls of this.classes.values()) {
      if (cls.lifecycle && !cls.enums.has(cls.lifecycle.type)) this.fail(cls.lifecycle, 'Lifecycle type must be an enum declared in this class');
      for (const method of cls.methods.values()) {
        if (method.from) {
          if (!cls.lifecycle) this.fail(method, 'Lifecycle method requires a state field');
          const values = cls.enums.get(cls.lifecycle.type).values;
          if (!values.has(method.from) || (method.to && !values.has(method.to))) this.fail(method, 'Unknown lifecycle state');
        }
      }
    }
    for (const cls of this.classes.values()) {
      for (const arg of cls.declaration.typeArguments ?? []) this.validateType(arg, null, cls.declaration);
      for (const field of cls.fields.values()) this.validateType(field.type, field.owner ?? cls, field);
      for (const method of cls.methods.values()) {
        if (method.type !== 'void') this.validateType(method.type, method.owner ?? cls, method);
        for (const p of method.params) this.validateType(p.type, method.owner ?? cls, p);
      }
    }
    for (const cls of this.classes.values()) {
      if (new Set(cls.declaration.interfaces ?? []).size !== (cls.declaration.interfaces ?? []).length) this.fail(cls.declaration, 'Duplicate implemented interface');
      for (const name of cls.interfaces) {
        const contract = this.classes.get(name);
        if (!contract || contract.kind !== 'interface') this.fail(cls.declaration, `'${name}' is not an interface`);
        for (const requirement of contract.methods.values()) {
          const method = cls.methods.get(requirement.name);
          if (!method && cls.isAbstract) continue;
          if (!method) this.fail(cls.declaration, `${cls.name} must implement ${name}.${requirement.name}`);
          if (method.isStatic || method.access !== 'public' || method.constructor || method.from || method.type !== requirement.type || method.params.length !== requirement.params.length || method.params.some((p, i) => p.type !== requirement.params[i].type || cls.enums.has(p.type))) {
            this.fail(method, `Signature of '${method.name}' must match interface ${name} exactly, without lifecycle restrictions`);
          }
        }
      }
    }
    for (const cls of this.classes.values()) for (const field of cls.ownFields.values()) {
      if (!field.relationship) continue;
      const related = this.classes.get(field.type.replace(/\?$/, ''));
      if (!related || related.kind !== 'class') this.fail(field, 'Relationships require a concrete class type, optionally nullable');
      if (field.relationship === 'belongsTo') {
        if (!field.type.endsWith('?') || field.init) this.fail(field, 'belongsTo must be nullable with no initializer; kole maintains the back-reference');
        if (![...related.fields.values()].some(candidate => candidate.relationship === 'owns' && candidate.type.replace(/\?$/, '') === cls.name)) this.fail(field, 'belongsTo needs a matching owns field in the owner class');
      } else {
        const inverses = [...related.fields.values()].filter(candidate => candidate.relationship === 'belongsTo' && candidate.type.replace(/\?$/, '') === cls.name);
        if (inverses.length > 1) this.fail(field, 'Ambiguous belongsTo relationship: only one back-reference per owner type is supported');
        field.inverse = inverses[0]?.name ?? null;
      }
    }
  }
  fail(node, message) { throw new KoleError(message, node?.token ?? node); }
  fatal(node, message) { const error = new KoleError(message, node?.token ?? node); error.unrecoverable = true; throw error; }
  tick(node) { if (++this.steps > this.maxSteps) this.fatal(node, 'Execution step limit exceeded'); }
  validateType(type, owner, node) {
    if (type.endsWith('?')) return this.validateType(type.slice(0, -1), owner, node);
    if (type.endsWith('[]')) return this.validateType(type.slice(0, -2), owner, node);
    if (type.startsWith('List<') && type.endsWith('>')) return this.validateType(type.slice(5, -1), owner, node);
    const generic = genericParts(type);
    if (generic) for (const arg of generic.args) this.validateType(arg, owner, node);
    if (this.classes.has(type) && !type.startsWith('#') && owner?.aliases) {
      const visible = [...owner.aliases.values()].some(alias => alias === type || (generic && (alias === generic.base || genericParts(alias)?.base === generic.base)));
      if (!visible) this.fail(node, `Type '${type}' must be imported in this file`);
    }
    const parts = type.split('.');
    if (parts.length >= 2 && this.classes.get(parts.slice(0, -1).join('.'))?.enums.has(parts.at(-1))) return;
    if (!primitiveTypes.includes(type) && !this.classes.has(type) && !owner?.enums.has(type)) this.fail(node, `Unknown type '${type}'`);
  }
  typeKey(type, owner) {
    if (type.endsWith('?')) return this.typeKey(type.slice(0, -1), owner) + '?';
    if (type.endsWith('[]')) return this.typeKey(type.slice(0, -2), owner) + '[]';
    if (type.startsWith('List<') && type.endsWith('>')) return `List<${this.typeKey(type.slice(5, -1), owner)}>`;
    return owner?.enums.has(type) ? `${owner.enums.get(type).owner}.${type}` : type;
  }
  checkType(type, value, owner, node) {
    this.validateType(type, owner, node);
    if (type.endsWith('?')) return value === null ? null : this.checkType(type.slice(0, -1), value, owner, node);
    let valid;
    if (type.endsWith('[]')) valid = value?.kind === 'array' && value.type === this.typeKey(type, owner);
    else if (type.startsWith('List<')) valid = value?.kind === 'list' && value.type === this.typeKey(type, owner);
    else if (isNumeric(type)) {
      if (value?.kind === 'number' && (widens(type, value.type) || fitsLiteral(type, value))) return convertNumber(type, value, node);
      valid = false;
    }
    else if (type === 'bool') valid = typeof value === 'boolean';
    else if (type === 'string') valid = typeof value === 'string';
    else if (type === 'char') valid = value?.kind === 'char';
    else if (owner?.enums.has(type) || (!this.classes.has(type) && type.includes('.'))) valid = value?.kind === 'enumValue' && `${value.owner}.${value.type}` === this.typeKey(type, owner);
    else valid = value?.kind === 'instance' && isSubtype(value.cls, type);
    if (!valid) this.fail(node, `Expected ${type}, received ${this.format(value)}`);
    return value;
  }
  bool(value, node) { if (typeof value !== 'boolean') this.fail(node, 'Condition must be bool'); return value; }
  index(value, node) {
    const checked = this.checkType('int', value, null, node);
    return Number(checked.value);
  }
  format(value, seen = new Set()) {
    if (value === null) return 'null';
    if (value === undefined) return 'void';
    if (value === UNSET) return '<uninitialized>';
    if (value?.kind === 'number') return numericText(value);
    if (value?.kind === 'char') return value.value;
    if (value?.kind === 'enumValue') return `${value.type}.${value.name}`;
    if (value?.kind === 'instance') return `<${value.cls.name}>`;
    if (value?.kind === 'array' || value?.kind === 'list') {
      if (seen.has(value)) return '[...]';
      seen.add(value); const text = `[${value.items.map(item => this.format(item, seen)).join(', ')}]`; seen.delete(value); return text;
    }
    if (typeof value === 'object') return `<${value.kind}>`;
    return String(value);
  }
  collectionSize(size, node) {
    if (!Number.isInteger(size) || size < 0 || size > 100000) this.fail(node, 'Collection length must be between 0 and 100000');
  }
  collection(kind, elementType, items, owner, node) {
    this.validateType(elementType, owner, node); this.collectionSize(items.length, node);
    elementType = this.typeKey(elementType, owner);
    return { kind, elementType, type: kind === 'array' ? elementType + '[]' : `List<${elementType}>`, owner,
      items: items.map(item => this.checkType(elementType, item, owner, node)) };
  }
  defaultValue(type, node) {
    if (type.endsWith('?')) return null;
    if (isNumeric(type)) return number(type, 0, node);
    if (type === 'bool') return false;
    if (type === 'string') return '';
    if (type === 'char') return makeChar('\0', node);
    this.fail(node, `No default value for ${type}; use an array literal or nullable elements`);
  }
  bounds(items, index, node) {
    if (index < 0 || index >= items.length) this.fail(node, `Index ${index} out of bounds for length ${items.length}`);
  }
  runtimeType(value) {
    if (value === null) return 'null';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'boolean') return 'bool';
    if (value?.kind === 'number' || value?.kind === 'array' || value?.kind === 'list') return value.type;
    if (value?.kind === 'char') return 'char';
    if (value?.kind === 'instance') return value.cls.name;
    if (value?.kind === 'enumValue') return `${value.owner}.${value.type}`;
    return 'void';
  }
  inferArrayType(items, node) {
    if (!items.length) this.fail(node, 'Empty array literals require a declared element type');
    let type = this.runtimeType(items[0]);
    for (const item of items.slice(1)) {
      const next = this.runtimeType(item);
      if (widens(next, type)) type = next;
      else if (next !== type && !widens(type, next)) this.fail(node, 'Array elements need a common type');
    }
    return type;
  }
  convert(type, args, node) {
    if (args.length !== 1) this.fail(node, `${type} conversion expects one argument`);
    if (isNumeric(type)) return convertNumber(type, args[0], node);
    if (type === 'char') return convertChar(args[0], node);
    if (type === 'string') return this.format(args[0]);
    if (type === 'bool') return this.bool(args[0], node);
    this.fail(node, `Unknown conversion ${type}`);
  }
  declare(scope, name, type, value, node, readonly = false) {
    if (scope.bindings.has(name)) this.fail(node, `Variable '${name}' is already declared in this scope`);
    this.validateType(type, scope.owner, node);
    if (value !== UNSET) value = this.checkType(type, value, scope.owner, node);
    const binding = { type, value, owner: scope.owner, readonly };
    scope.bindings.set(name, binding); return binding;
  }
  read(binding, node) {
    if (binding.value === UNSET) this.fail(node, 'Variable or field has not been initialized');
    return binding.value;
  }
  access(member, cls, scope, node) {
    cls = member.owner ?? cls;
    if (member.access === 'private' && scope.owner !== cls) this.fail(node, `'${member.name}' is private to ${cls.name}`);
  }
  field(object, name, scope, node) {
    if (object?.kind !== 'instance') this.fail(node, 'Field access requires an object');
    const definition = object.cls.fields.get(name);
    if (!definition) this.fail(node, `Unknown field '${name}'`);
    this.access(definition, object.cls, scope, node);
    return object.fields.get(name);
  }
  member(object, name, scope, node) {
    if (builtinSignature(this.runtimeType(object), name)) return { kind: 'listMethod', object, name };
    if (typeof object === 'string' && name === 'length') return number('int', [...object].length, node);
    if (object?.kind === 'array' || object?.kind === 'list') {
      if (name === 'length') return number('int', object.items.length, node);
      if (object.kind === 'list' && ['add', 'get', 'set', 'removeAt', 'clear', 'isEmpty'].includes(name)) return { kind: 'listMethod', object, name };
    }
    if (object?.kind === 'enum') {
      if (!object.values.has(name)) this.fail(node, `Unknown enum value '${name}'`);
      return object.values.get(name);
    }
    const cls = object?.kind === 'class' ? object : ['instance', 'super'].includes(object?.kind) ? object.cls : null;
    if (!cls) this.fail(node, `Cannot access '${name}' on ${this.format(object)}`);
    if (object.kind === 'instance' && cls.fields.has(name)) return this.read(this.field(object, name, scope, node), node);
    if (cls.enums.has(name)) {
      const enumeration = cls.enums.get(name); this.access(enumeration.declaration, cls, scope, node); return enumeration;
    }
    const method = cls.methods.get(name);
    if (!method || method.constructor) this.fail(node, `Unknown member '${name}' on ${cls.name}`);
    this.access(method, cls, scope, node);
    if (!method.isStatic && object.kind === 'class') this.fail(node, `Method '${name}' needs an instance`);
    return { kind: 'method', cls: method.owner ?? cls, method, self: method.isStatic ? null : object.kind === 'super' ? object.self : object };
  }
  resolve(name, scope, node) {
    if (name === 'super') { if (!scope.self || !scope.owner.parent) this.fail(node, 'super requires a subclass instance'); return { kind: 'super', cls: scope.owner.parent, self: scope.self }; }
    if (name === 'me') { if (!scope.self) this.fail(node, 'me is unavailable in a static method'); return scope.self; }
    const binding = scope.find(name);
    if (binding) return this.read(binding, node);
    if (scope.self && scope.owner.fields.has(name)) return this.member(scope.self, name, scope, node);
    if (scope.owner?.enums.has(name)) { const enumeration = scope.owner.enums.get(name); this.access(enumeration.declaration, scope.owner, scope, node); return enumeration; }
    // Bare state names refer to the current class's lifecycle enum.
    if (scope.owner?.lifecycle) {
      const value = scope.owner.enums.get(scope.owner.lifecycle.type).values.get(name);
      if (value) return value;
    }
    if (scope.owner?.methods.has(name)) return this.member(scope.self ?? scope.owner, name, scope, node);
    const className = scope.owner?.aliases ? scope.owner.aliases.get(name) : name;
    if (this.classes.has(className)) return this.classes.get(className);
    if (name === 'print') return { kind: 'print' };
    if (primitiveTypes.includes(name)) return { kind: 'conversion', type: name };
    this.fail(node, `Unknown name '${name}'`);
  }
  reference(node, scope) {
    let binding;
    if (node.kind === 'name') {
      binding = scope.find(node.name);
      if (!binding && scope.self) binding = this.field(scope.self, node.name, scope, node);
    } else if (node.kind === 'member') binding = this.field(this.eval(node.object, scope), node.name, scope, node);
    else if (node.kind === 'index') {
      const collection = this.eval(node.object, scope), index = this.index(this.eval(node.index, scope), node);
      if (!['array', 'list'].includes(collection?.kind)) this.fail(node, 'Only arrays and Lists support indexed assignment');
      this.bounds(collection.items, index, node);
      binding = { type: collection.elementType, owner: collection.owner, value: collection.items[index], collection, index };
    }
    if (!binding) this.fail(node, 'Unknown assignment target');
    if (binding.readonly) this.fail(node, 'Cannot assign to a loop counter, lifecycle field, or belongsTo reference directly');
    return binding;
  }
  detach(binding) {
    const previous = binding.value;
    if (previous?.kind !== 'instance' || previous.ownerSlot !== binding) return;
    previous.ownerSlot = null;
    if (binding.definition.inverse) previous.fields.get(binding.definition.inverse).value = null;
  }
  write(binding, value, node) {
    value = this.checkType(binding.type, value, binding.owner, node);
    if (binding.collection) {
      this.bounds(binding.collection.items, binding.index, node);
      binding.collection.items[binding.index] = value; return value;
    }
    if (binding.definition?.relationship === 'owns') {
      if (value !== null) {
        if (value.ownerSlot && value.ownerSlot !== binding) this.fail(node, 'Object already has an owner; detach it before assigning a new owner');
        for (let ancestor = binding.object; ancestor; ancestor = ancestor.ownerSlot?.object) {
          if (ancestor === value) this.fail(node, 'Ownership cycles are forbidden');
        }
        if (value.constructing) this.fail(node, 'Cannot take ownership of an object before its constructor finishes');
      }
      // Validate completely before changing either side of the relationship.
      this.detach(binding);
      binding.value = value;
      if (value !== null) {
        value.ownerSlot = binding;
        if (binding.definition.inverse) value.fields.get(binding.definition.inverse).value = binding.object;
      }
    } else binding.value = value;
    return value;
  }
  binary(op, a, b, node) {
    if (a?.kind === 'number' && b?.kind === 'number') return binaryNumber(op, a, b, node);
    if (a?.kind === 'char' && b?.kind === 'char' && ['==', '!=', '<', '>', '<=', '>='].includes(op)) {
      return binaryNumber(op, number('int', a.value.codePointAt(0), node), number('int', b.value.codePointAt(0), node), node);
    }
    if (op === '==') return a === b;
    if (op === '!=') return a !== b;
    if (op === '+' && (typeof a === 'string' || typeof b === 'string')) return this.format(a) + this.format(b);
    this.fail(node, `Operator '${op}' requires numeric operands`);
  }
  eval(node, scope) {
    this.tick(node);
    switch (node.kind) {
      case 'literal': return node.value;
      case 'name': return this.resolve(node.name, scope, node);
      case 'member': return this.member(this.eval(node.object, scope), node.name, scope, node);
      case 'index': {
        const object = this.eval(node.object, scope), index = this.index(this.eval(node.index, scope), node);
        const items = typeof object === 'string' ? [...object] : ['array', 'list'].includes(object?.kind) ? object.items : null;
        if (!items) this.fail(node, 'Indexing requires an array, List, or string');
        this.bounds(items, index, node);
        return typeof object === 'string' ? makeChar(items[index], node) : items[index];
      }
      case 'unary': {
        const value = this.eval(node.value, scope);
        if (node.op === '!') return !this.bool(value, node);
        return unaryNumber(node.op, value, node);
      }
      case 'binary': {
        const left = this.eval(node.left, scope);
        if (node.op === '&&') return this.bool(left, node) && this.bool(this.eval(node.right, scope), node);
        if (node.op === '||') return this.bool(left, node) || this.bool(this.eval(node.right, scope), node);
        return this.binary(node.op, left, this.eval(node.right, scope), node);
      }
      case 'assign': {
        const binding = this.reference(node.left, scope);
        const previous = node.op === '=' ? undefined : this.read(binding, node);
        const right = this.eval(node.right, scope);
        let value = node.op === '=' ? right : this.binary(node.op[0], previous, right, node);
        if (node.op !== '=' && isNumeric(binding.type.replace(/\?$/, ''))) value = convertNumber(binding.type.replace(/\?$/, ''), value, node);
        return this.write(binding, value, node);
      }
      case 'update': {
        const binding = this.reference(node.value, scope), previous = this.read(binding, node);
        const updated = this.binary('+', previous, number('int', node.step, node), node);
        this.write(binding, convertNumber(binding.type.replace(/\?$/, ''), updated, node), node); return previous;
      }
      case 'new': return this.create(node.name, node.args.map(arg => this.eval(arg, scope)), scope, node);
      case 'array': {
        const items = node.items.map(item => this.eval(item, scope));
        return this.collection('array', node.resolvedElementType ?? this.inferArrayType(items, node), items, scope.owner, node);
      }
      case 'newArray': {
        const size = this.index(this.eval(node.size, scope), node); this.collectionSize(size, node);
        const initial = this.defaultValue(node.elementType, node);
        return this.collection('array', node.elementType, Array(size).fill(initial), scope.owner, node);
      }
      case 'newList': {
        if (node.args.length) this.fail(node, 'List<A>() takes no constructor arguments');
        return this.collection('list', node.name.slice(5, -1), [], scope.owner, node);
      }
      case 'call': {
        const callee = this.eval(node.callee, scope), args = node.args.map(arg => this.eval(arg, scope));
        if (['class', 'interface'].includes(callee?.kind)) return this.create(callee.name, args, scope, node);
        if (callee?.kind === 'print') { this.print(args.map(value => this.format(value)).join(' ')); return undefined; }
        if (callee?.kind === 'conversion') return this.convert(callee.type, args, node);
        if (callee?.kind === 'listMethod') return callBuiltin(this, callee, args, node);
        if (callee?.kind !== 'method') this.fail(node, 'Value is not callable');
        return this.invoke(callee, args, node);
      }
      default: this.fail(node, `Unknown expression '${node.kind}'`);
    }
  }
  statement(node, scope) {
    this.tick(node);
    switch (node.kind) {
      case 'block': {
        const local = new Scope(scope);
        for (const statement of node.statements) this.statement(statement, local);
        break;
      }
      case 'throw': {
        const value = this.checkType('Error', this.eval(node.value, scope), scope.owner, node);
        throw new KoleThrown(value, node.token);
      }
      case 'try': {
        try { this.statement(node.body, scope); }
        catch (error) {
          const thrown = this.exception(error, node);
          const handler = thrown && node.catches.find(handler => isSubtype(thrown.value.cls, handler.type));
          if (!handler) throw error;
          const local = new Scope(scope); this.declare(local, handler.name, handler.type, thrown.value, handler);
          this.statement(handler.body, local);
        } finally { if (node.finalizer) this.statement(node.finalizer, scope); }
        break;
      }
      case 'using': {
        const local = new Scope(scope), resource = this.eval(node.value, scope);
        this.declare(local, node.name, node.type, resource, node, true);
        let pending;
        try { this.statement(node.body, local); } catch (error) { pending = error; }
        try { this.invoke(this.member(resource, 'close', local, node), [], node); }
        catch (error) { if (pending && !(pending instanceof Flow)) { (pending.suppressed ??= []).push(error); } else pending = error; }
        if (pending) throw pending;
        break;
      }
      case 'superCall': this.fail(node, 'super(...) must be the first constructor statement'); break;
      case 'declare': this.declare(scope, node.name, node.type, node.value ? this.eval(node.value, scope) : UNSET, node); break;
      case 'expression': this.eval(node.expression, scope); break;
      case 'return': throw new Flow('return', node.value ? this.eval(node.value, scope) : undefined);
      case 'break': case 'continue': throw new Flow(node.kind);
      case 'require': if (!this.bool(this.eval(node.condition, scope), node)) this.fail(node, 'Precondition failed'); break;
      case 'if': {
        if (this.bool(this.eval(node.condition, scope), node)) this.statement(node.yes, scope);
        else if (node.no) this.statement(node.no, scope);
        break;
      }
      case 'foreach': {
        const source = this.eval(node.value, scope);
        const items = typeof source === 'string' ? [...source].map(c => makeChar(c, node)) : [...source.items];
        for (const item of items) {
          this.tick(node);
          const local = new Scope(scope); this.declare(local, node.name, node.type, item, node, true);
          if (this.loopBody(node.body, local) === 'break') break;
        }
        break;
      }
      case 'for': {
        const start = this.index(this.eval(node.start, scope), node);
        const end = this.index(this.eval(node.end, scope), node);
        const local = new Scope(scope), counter = this.declare(local, node.name, 'int', number('int', start, node), node, true);
        for (let i = start; node.step > 0 ? i < end : i > end; i += node.step) {
          this.tick(node); counter.value = number('int', i, node);
          if (this.loopBody(node.body, local) === 'break') break;
        }
        break;
      }
      case 'while': while (this.bool(this.eval(node.condition, scope), node)) {
        this.tick(node); if (this.loopBody(node.body, scope) === 'break') break;
      } break;
      default: this.fail(node, `Unknown statement '${node.kind}'`);
    }
  }
  exception(error, node) {
    if (error instanceof KoleThrown) return error;
    if (!(error instanceof KoleError) || error.unrecoverable) return null;
    const value = this.create('RuntimeError', [error.message], { owner: null }, node);
    const thrown = new KoleThrown(value, error); thrown.koleStack = error.koleStack ?? []; return thrown;
  }
  loopBody(body, scope) {
    try { this.statement(body, scope); }
    catch (flow) { if (flow instanceof Flow && ['break', 'continue'].includes(flow.kind)) return flow.kind; throw flow; }
  }
  create(name, args, caller, node) {
    const cls = this.classes.get(name);
    if (!cls) this.fail(node, `Unknown class '${name}'`);
    if (cls.kind === 'interface') this.fail(node, `Cannot construct interface '${name}'`);
    if (cls.isAbstract) this.fail(node, `Cannot construct abstract class '${name}'`);
    if (++this.depth > 256) { this.depth--; this.fatal(node, 'Call depth limit exceeded during object construction'); }
    const object = { kind: 'instance', cls, fields: new Map(), transitioning: false, ownerSlot: null, constructing: true };
    try {
    for (const field of cls.fields.values()) object.fields.set(field.name, { type: field.type, value: field.relationship === 'belongsTo' ? null : UNSET, owner: field.owner, readonly: field.lifecycle || field.relationship === 'belongsTo', definition: field, object });
    const constructor = cls.ownMethods.get(cls.name);
    if (constructor) this.access(constructor, cls, caller, node);
    this.initialize(cls, object, args, node);
    object.constructing = false;
    return object;
    } catch (error) {
      for (const binding of object.fields.values()) if (binding.definition.relationship === 'owns') this.detach(binding);
      throw error;
    } finally { this.depth--; }
  }
  initialize(cls, object, args, node) {
    const constructor = cls.ownMethods.get(cls.name);
    const scope = new Scope(null, cls, object);
    if (args.length !== (constructor?.params.length ?? 0)) this.fail(node, `${cls.name} expects ${constructor?.params.length ?? 0} arguments`);
    constructor?.params.forEach((p,i)=>this.declare(scope,p.name,p.type,args[i],p));
    const first = constructor?.body.statements[0];
    if (cls.parent) {
      const parentConstructor = cls.parent.ownMethods.get(cls.parent.name);
      if (parentConstructor) this.access(parentConstructor, cls.parent, scope, node);
      this.initialize(cls.parent, object, first?.kind === 'superCall' ? first.args.map(arg=>this.eval(arg,scope)) : [], node);
    }
    for (const field of cls.ownFields.values()) if (field.init) this.write(object.fields.get(field.name), this.eval(field.init, scope), field);
    if (constructor) {
      try { this.statement({ ...constructor.body, statements: constructor.body.statements.slice(first?.kind === 'superCall' ? 1 : 0) }, scope); }
      catch (flow) { if (!(flow instanceof Flow) || flow.kind !== 'return') throw flow; if (flow.value !== undefined) this.fail(node,'A constructor cannot return a value'); }
    }
  }
  invoke({ cls, self, method }, args, node) {
    cls = method.owner ?? cls;
    if (method.isAbstract || !method.body) this.fail(node, 'Cannot invoke an abstract method');
    if (self?.constructing && [...self.fields.values()].some(binding => binding.value === UNSET)) this.fail(node, 'Cannot call an instance method before all fields are initialized');
    if (args.length !== method.params.length) this.fail(node, `${method.name} expects ${method.params.length} arguments, got ${args.length}`);
    if (++this.depth > 256) { this.depth--; this.fail(node, 'Call depth limit exceeded'); }
    let transitionStarted = false;
    try {
      const scope = new Scope(null, cls, self);
      method.params.forEach((p, i) => this.declare(scope, p.name, p.type, args[i], p));
      if (method.native) {
        const result = invokeStandard(this, method.native, self, method.params.map(p => scope.find(p.name).value), node);
        return method.type === 'void' ? undefined : this.checkType(method.type, result, cls, method);
      }
      if (method.from) {
        const state = this.read(self.fields.get(cls.lifecycle.name), method);
        if (state.name !== method.from) this.fail(node, `Expected state ${method.from}; actual: ${state.name}`);
      }
      if (method.to) {
        if (self.transitioning) this.fail(node, 'A lifecycle transition is already in progress on this object');
        self.transitioning = true; transitionStarted = true;
      }
      let value;
      try { this.statement(method.body, scope); }
      catch (flow) { if (!(flow instanceof Flow) || flow.kind !== 'return') throw flow; value = flow.value; }
      if (method.type === 'void') { if (value !== undefined) this.fail(method, 'A void method cannot return a value'); }
      else value = this.checkType(method.type, value, cls, method);
      if (method.to) self.fields.get(cls.lifecycle.name).value = cls.enums.get(cls.lifecycle.type).values.get(method.to);
      return value;
    } catch (error) {
      if (!(error instanceof Flow)) (error.koleStack ??= []).push({ method: cls.name + '.' + method.name, ...node?.token });
      throw error;
    } finally { this.depth--; if (transitionStarted) self.transitioning = false; }
  }
  run(entry, args = []) {
    const cls = this.classes.get(entry);
    if (!cls) this.fail(null, `Entry class '${entry}' was not found`);
    const method = cls.methods.get('main');
    if (!method || !method.isStatic || method.access !== 'public' || method.type !== 'void') this.fail(cls.declaration, 'Entry requires public static main() -> void or main(args: string[]) -> void');
    if (method.params.length > 1 || (method.params.length === 1 && method.params[0].type !== 'string[]')) this.fail(method, 'main accepts either no parameters or args: string[]');
    return this.invoke({ cls, self: null, method }, method.params.length ? [this.collection('array', 'string', args, cls, method)] : [], method);
  }
}

export function run(source, entry, options = {}) {
  const program = parse(source);
  if (program.imports.length || program.packageName) throw new KoleError('Use loadProgram or the kole CLI for packages and imports');
  const runtime = new Runtime(program, options);
  check(program, runtime);
  runtime.run(entry, options.args ?? []);
  return runtime;
}
