import { KoleError } from './lexer.mjs';
import { parse } from './parser.mjs';
import { check } from './checker.mjs';

const UNSET = Symbol('uninitialized');
class Flow { constructor(kind, value) { this.kind = kind; this.value = value; } }
class Scope {
  constructor(parent = null, owner = parent?.owner, self = parent?.self) {
    this.parent = parent; this.owner = owner; this.self = self; this.bindings = new Map();
  }
  find(name) { return this.bindings.get(name) ?? this.parent?.find(name); }
}

export class Runtime {
  constructor(program, { print = console.log, maxSteps = 1_000_000 } = {}) {
    this.classes = new Map(); this.print = print; this.steps = 0; this.maxSteps = maxSteps; this.depth = 0;
    for (const declaration of program.classes) {
      if (this.classes.has(declaration.name) || ['int', 'double', 'boolean', 'String', 'void', 'print'].includes(declaration.name)) this.fail(declaration, `Duplicate or reserved class '${declaration.name}'`);
      this.classes.set(declaration.name, { kind: 'class', name: declaration.name, fields: new Map(), methods: new Map(), enums: new Map(), declaration, lifecycle: null });
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
          if (new Set(m.values).size !== m.values.length) this.fail(m, 'Duplicate enum state');
          const values = new Map(m.values.map(name => [name, { kind: 'enumValue', owner: cls.name, type: m.name, name }]));
          cls.enums.set(m.name, { kind: 'enum', owner: cls.name, name: m.name, values, declaration: m });
        } else cls.methods.set(m.name, m);
      }
      if (cls.lifecycle && !cls.enums.has(cls.lifecycle.type)) this.fail(cls.lifecycle, 'Lifecycle type must be an enum declared in this class');
      for (const method of cls.methods.values()) {
        if (method.from) {
          if (!cls.lifecycle) this.fail(method, 'Lifecycle method requires a state field');
          const values = cls.enums.get(cls.lifecycle.type).values;
          if (!values.has(method.from) || (method.to && !values.has(method.to))) this.fail(method, 'Unknown lifecycle state');
        }
        const parameters = new Set();
        for (const p of method.params) {
          if (parameters.has(p.name)) this.fail(p, `Duplicate parameter '${p.name}'`);
          parameters.add(p.name);
        }
      }
    }
    for (const cls of this.classes.values()) {
      for (const field of cls.fields.values()) this.validateType(field.type, cls, field);
      for (const method of cls.methods.values()) {
        if (method.type !== 'void') this.validateType(method.type, cls, method);
        for (const p of method.params) this.validateType(p.type, cls, p);
      }
    }
  }
  fail(node, message) { throw new KoleError(message, node?.token ?? node); }
  tick(node) { if (++this.steps > this.maxSteps) this.fail(node, 'Execution step limit exceeded'); }
  validateType(type, owner, node) {
    if (type.endsWith('[]')) return this.validateType(type.slice(0, -2), owner, node);
    if (!['int', 'double', 'boolean', 'String'].includes(type) && !this.classes.has(type) && !owner?.enums.has(type)) this.fail(node, `Unknown type '${type}'`);
  }
  checkType(type, value, owner, node) {
    this.validateType(type, owner, node);
    let valid;
    if (type.endsWith('[]')) {
      valid = Array.isArray(value);
      if (valid) for (const item of value) this.checkType(type.slice(0, -2), item, owner, node);
    } else if (type === 'int') valid = Number.isSafeInteger(value) && value >= -2147483648 && value <= 2147483647;
    else if (type === 'double') valid = typeof value === 'number' && Number.isFinite(value);
    else if (type === 'boolean') valid = typeof value === 'boolean';
    else if (type === 'String') valid = typeof value === 'string' || value === null;
    else if (owner?.enums.has(type)) valid = value?.kind === 'enumValue' && value.owner === owner.name && value.type === type;
    else valid = value === null || (value?.kind === 'instance' && value.cls.name === type);
    if (!valid) this.fail(node, `Expected ${type}, received ${this.format(value)}`);
    return value;
  }
  bool(value, node) { if (typeof value !== 'boolean') this.fail(node, 'Condition must be boolean'); return value; }
  number(value, node) { if (typeof value !== 'number' || !Number.isFinite(value)) this.fail(node, 'Expected a finite number'); return value; }
  format(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'void';
    if (value === UNSET) return '<uninitialized>';
    if (value?.kind === 'enumValue') return `${value.type}.${value.name}`;
    if (value?.kind === 'instance') return `<${value.cls.name}>`;
    if (Array.isArray(value)) return `[${value.map(v => this.format(v)).join(', ')}]`;
    if (typeof value === 'object') return `<${value.kind}>`;
    return String(value);
  }
  declare(scope, name, type, value, node, readonly = false) {
    if (scope.bindings.has(name)) this.fail(node, `Variable '${name}' is already declared in this scope`);
    this.validateType(type, scope.owner, node);
    if (value !== UNSET) this.checkType(type, value, scope.owner, node);
    const binding = { type, value, owner: scope.owner, readonly };
    scope.bindings.set(name, binding); return binding;
  }
  read(binding, node) {
    if (binding.value === UNSET) this.fail(node, 'Variable or field has not been initialized');
    return binding.value;
  }
  access(member, cls, scope, node) {
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
    if ((typeof object === 'string' || Array.isArray(object)) && name === 'length') return object.length;
    if (object?.kind === 'enum') {
      if (!object.values.has(name)) this.fail(node, `Unknown enum value '${name}'`);
      return object.values.get(name);
    }
    const cls = object?.kind === 'class' ? object : object?.kind === 'instance' ? object.cls : null;
    if (!cls) this.fail(node, `Cannot access '${name}' on ${this.format(object)}`);
    if (object.kind === 'instance' && cls.fields.has(name)) return this.read(this.field(object, name, scope, node), node);
    if (cls.enums.has(name)) {
      const enumeration = cls.enums.get(name); this.access(enumeration.declaration, cls, scope, node); return enumeration;
    }
    const method = cls.methods.get(name);
    if (!method || method.constructor) this.fail(node, `Unknown member '${name}' on ${cls.name}`);
    this.access(method, cls, scope, node);
    if (!method.isStatic && object.kind === 'class') this.fail(node, `Method '${name}' needs an instance`);
    return { kind: 'method', cls, method, self: method.isStatic ? null : object };
  }
  resolve(name, scope, node) {
    if (name === 'this') { if (!scope.self) this.fail(node, 'this is unavailable in a static method'); return scope.self; }
    const binding = scope.find(name);
    if (binding) return this.read(binding, node);
    if (scope.self && scope.owner.fields.has(name)) return this.member(scope.self, name, scope, node);
    if (scope.owner?.enums.has(name)) return scope.owner.enums.get(name);
    // Bare state names refer to the current class's lifecycle enum.
    if (scope.owner?.lifecycle) {
      const value = scope.owner.enums.get(scope.owner.lifecycle.type).values.get(name);
      if (value) return value;
    }
    if (scope.owner?.methods.has(name)) return this.member(scope.self ?? scope.owner, name, scope, node);
    if (this.classes.has(name)) return this.classes.get(name);
    if (name === 'print') return { kind: 'print' };
    this.fail(node, `Unknown name '${name}'`);
  }
  reference(node, scope) {
    let binding;
    if (node.kind === 'name') {
      binding = scope.find(node.name);
      if (!binding && scope.self) binding = this.field(scope.self, node.name, scope, node);
    } else if (node.kind === 'member') binding = this.field(this.eval(node.object, scope), node.name, scope, node);
    if (!binding) this.fail(node, 'Unknown assignment target');
    if (binding.readonly) this.fail(node, 'Cannot assign to a loop counter or lifecycle field directly');
    return binding;
  }
  binary(op, a, b, node) {
    if (op === '==') return a === b;
    if (op === '!=') return a !== b;
    if (op === '+' && (typeof a === 'string' || typeof b === 'string')) return this.format(a) + this.format(b);
    this.number(a, node); this.number(b, node);
    if ((op === '/' || op === '%') && b === 0) this.fail(node, 'Division by zero');
    let value;
    switch (op) {
      case '+': value = a + b; break; case '-': value = a - b; break;
      case '*': value = a * b; break; case '/': value = a / b; break; case '%': value = a % b; break;
      case '<': return a < b; case '>': return a > b; case '<=': return a <= b; case '>=': return a >= b;
      default: this.fail(node, `Unknown operator '${op}'`);
    }
    return this.number(value, node);
  }
  eval(node, scope) {
    this.tick(node);
    switch (node.kind) {
      case 'literal': return node.value;
      case 'name': return this.resolve(node.name, scope, node);
      case 'member': return this.member(this.eval(node.object, scope), node.name, scope, node);
      case 'index': {
        const object = this.eval(node.object, scope), index = this.eval(node.index, scope);
        if (!(Array.isArray(object) || typeof object === 'string') || !Number.isInteger(index) || index < 0 || index >= object.length) this.fail(node, 'Invalid index or index out of bounds');
        return object[index];
      }
      case 'unary': {
        const value = this.eval(node.value, scope);
        if (node.op === '!') return !this.bool(value, node);
        return node.op === '-' ? -this.number(value, node) : this.number(value, node);
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
        const value = node.op === '=' ? right : this.binary(node.op[0], previous, right, node);
        binding.value = this.checkType(binding.type, value, binding.owner, node); return value;
      }
      case 'update': {
        const binding = this.reference(node.value, scope), previous = this.read(binding, node);
        binding.value = this.checkType(binding.type, this.number(previous, node) + node.step, binding.owner, node); return previous;
      }
      case 'new': return this.create(node.name, node.args.map(arg => this.eval(arg, scope)), scope, node);
      case 'call': {
        const callee = this.eval(node.callee, scope), args = node.args.map(arg => this.eval(arg, scope));
        if (callee?.kind === 'print') { this.print(args.map(value => this.format(value)).join(' ')); return undefined; }
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
      case 'for': {
        const start = this.checkType('int', this.eval(node.start, scope), scope.owner, node);
        const end = this.checkType('int', this.eval(node.end, scope), scope.owner, node);
        const local = new Scope(scope), counter = this.declare(local, node.name, 'int', start, node, true);
        for (let i = start; node.step > 0 ? i < end : i > end; i += node.step) {
          this.tick(node); counter.value = i;
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
  loopBody(body, scope) {
    try { this.statement(body, scope); }
    catch (flow) { if (flow instanceof Flow && ['break', 'continue'].includes(flow.kind)) return flow.kind; throw flow; }
  }
  create(name, args, caller, node) {
    const cls = this.classes.get(name);
    if (!cls) this.fail(node, `Unknown class '${name}'`);
    if (++this.depth > 256) { this.depth--; this.fail(node, 'Call depth limit exceeded during object construction'); }
    try {
    const object = { kind: 'instance', cls, fields: new Map(), transitioning: false };
    const scope = new Scope(null, cls, object);
    for (const field of cls.fields.values()) object.fields.set(field.name, { type: field.type, value: UNSET, owner: cls, readonly: field.lifecycle });
    for (const field of cls.fields.values()) {
      if (field.init) object.fields.get(field.name).value = this.checkType(field.type, this.eval(field.init, scope), cls, field);
    }
    const constructor = cls.methods.get(name);
    if (constructor) { this.access(constructor, cls, caller, node); this.invoke({ cls, self: object, method: constructor }, args, node); }
    else if (args.length) this.fail(node, `${name} has no constructor accepting arguments`);
    return object;
    } finally { this.depth--; }
  }
  invoke({ cls, self, method }, args, node) {
    if (args.length !== method.params.length) this.fail(node, `${method.name} expects ${method.params.length} arguments, got ${args.length}`);
    if (++this.depth > 256) { this.depth--; this.fail(node, 'Call depth limit exceeded'); }
    let transitionStarted = false;
    try {
      const scope = new Scope(null, cls, self);
      method.params.forEach((p, i) => this.declare(scope, p.name, p.type, args[i], p));
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
      else this.checkType(method.type, value, cls, method);
      if (method.to) self.fields.get(cls.lifecycle.name).value = cls.enums.get(cls.lifecycle.type).values.get(method.to);
      return value;
    } finally { this.depth--; if (transitionStarted) self.transitioning = false; }
  }
  run(entry, args = []) {
    const cls = this.classes.get(entry);
    if (!cls) this.fail(null, `Entry class '${entry}' was not found`);
    const method = cls.methods.get('main');
    if (!method || !method.isStatic || method.access !== 'public' || method.type !== 'void') this.fail(cls.declaration, 'Entry requires public static main() -> void or main(args: String[]) -> void');
    if (method.params.length > 1 || (method.params.length === 1 && method.params[0].type !== 'String[]')) this.fail(method, 'main accepts either no parameters or args: String[]');
    return this.invoke({ cls, self: null, method }, method.params.length ? [args] : [], method);
  }
}

export function run(source, entry, options = {}) {
  const program = parse(source);
  const runtime = new Runtime(program, options);
  check(program, runtime);
  runtime.run(entry, options.args ?? []);
  return runtime;
}
