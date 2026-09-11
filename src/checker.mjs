import { KoleError } from './lexer.mjs';
import { checkInitialization } from './initialization.mjs';

const value = type => ({ kind: 'value', type });
const numeric = type => type === 'int' || type === 'double';

class Scope {
  constructor(parent, owner = parent?.owner, instance = parent?.instance) {
    this.parent = parent; this.owner = owner; this.instance = instance; this.locals = new Map();
    this.facts = new Map(parent?.facts);
  }
  find(name) { return this.locals.get(name) ?? this.parent?.find(name); }
}

/** Checks every body without executing user code. Runtime owns the class registry. */
export function check(program, runtime) {
  new Checker(runtime).program(program);
  checkInitialization(runtime);
  return program;
}

class Checker {
  constructor(runtime) { this.runtime = runtime; this.classes = runtime.classes; }
  fail(node, message) { throw new KoleError(message, node.token ?? node); }
  type(name, owner, node) {
    this.runtime.validateType(name, owner, node);
    if (name.endsWith('?')) return this.type(name.slice(0, -1), owner, node) + '?';
    if (name.endsWith('[]')) return this.type(name.slice(0, -2), owner, node) + '[]';
    if (owner.enums.has(name)) return `${owner.name}.${name}`;
    return name;
  }
  requireValue(info, node) {
    if (info.kind !== 'value' || info.type === 'void') this.fail(node, 'Expected a value, not a class, method, enum namespace, or void result');
    return info.type;
  }
  assignable(expected, actual) {
    if (expected.endsWith('?')) return actual === 'null' || this.assignable(expected.slice(0, -1), actual.endsWith('?') ? actual.slice(0, -1) : actual);
    if (actual === 'null' || actual.endsWith('?')) return expected === actual;
    return expected === actual || (expected === 'double' && actual === 'int') ||
      (this.classes.get(actual)?.interfaces.has(expected) ?? false);
  }
  expect(expected, info, node) {
    const actual = this.requireValue(info, node);
    if (!this.assignable(expected, actual)) this.fail(node, `Expected ${expected}, received ${actual}`);
  }
  access(member, cls, scope, node) {
    this.runtime.access(member, cls, scope, node);
  }
  declare(scope, name, type, node, readonly = false) {
    if (scope.locals.has(name)) this.fail(node, `Variable '${name}' is already declared in this scope`);
    const binding = { ...value(type), writable: !readonly };
    scope.locals.set(name, binding); return binding;
  }
  field(cls, field, scope, node) {
    this.access(field, cls, scope, node);
    return { ...value(this.type(field.type, cls, field)), writable: !field.lifecycle && field.relationship !== 'belongsTo' };
  }
  member(object, name, scope, node) {
    if (object.kind === 'value' && (object.type === 'null' || object.type.endsWith('?'))) this.fail(node, `Cannot access '${name}' on nullable ${object.type}; check a local value against null first`);
    if (object.kind === 'value' && (object.type === 'String' || object.type.endsWith('[]')) && name === 'length') return value('int');
    if (object.kind === 'enum') {
      if (!object.enum.values.has(name)) this.fail(node, `Unknown enum value '${name}'`);
      return value(`${object.cls.name}.${object.enum.name}`);
    }
    const cls = object.kind === 'class' ? object.cls : object.kind === 'value' ? this.classes.get(object.type) : null;
    if (!cls) this.fail(node, `Cannot access '${name}' on ${object.type ?? object.kind}`);
    if (cls.fields.has(name) && object.kind !== 'class') return this.field(cls, cls.fields.get(name), scope, node);
    if (cls.enums.has(name)) {
      const enumeration = cls.enums.get(name);
      this.access(enumeration.declaration, cls, scope, node);
      return { kind: 'enum', cls, enum: enumeration };
    }
    const method = cls.methods.get(name);
    if (!method || method.constructor) this.fail(node, `Unknown member '${name}' on ${cls.name}`);
    this.access(method, cls, scope, node);
    if (!method.isStatic && object.kind === 'class') this.fail(node, `Method '${name}' needs an instance`);
    return { kind: 'method', cls, method };
  }
  name(name, scope, node) {
    if (name === 'me') {
      if (!scope.instance) this.fail(node, 'me is unavailable in a static method');
      return value(scope.owner.name);
    }
    const local = scope.find(name);
    if (local) return { ...local, type: scope.facts.get(local) ?? local.type, declaredType: local.type, binding: local };
    if (scope.instance && scope.owner.fields.has(name)) return this.field(scope.owner, scope.owner.fields.get(name), scope, node);
    if (scope.owner.enums.has(name)) return { kind: 'enum', cls: scope.owner, enum: scope.owner.enums.get(name) };
    if (scope.owner.lifecycle) {
      const enumeration = scope.owner.enums.get(scope.owner.lifecycle.type);
      if (enumeration.values.has(name)) return value(`${scope.owner.name}.${enumeration.name}`);
    }
    if (scope.owner.methods.has(name)) return this.member(scope.instance ? value(scope.owner.name) : { kind: 'class', cls: scope.owner }, name, scope, node);
    if (this.classes.has(name)) return { kind: 'class', cls: this.classes.get(name) };
    if (name === 'print') return { kind: 'print' };
    this.fail(node, `Unknown name '${name}'`);
  }
  target(node, scope) {
    const target = this.expression(node, scope);
    if (!target.writable) this.fail(node, 'Cannot assign to a loop counter, lifecycle field, belongsTo reference, or non-writable expression');
    return { ...target, readType: target.type, type: target.declaredType ?? target.type };
  }
  arguments(method, cls, args, scope, node) {
    if (args.length !== method.params.length) this.fail(node, `${method.name} expects ${method.params.length} arguments, got ${args.length}`);
    method.params.forEach((param, i) => this.expect(this.type(param.type, cls, param), this.expression(args[i], scope), args[i]));
  }
  binary(op, left, right, node) {
    const a = this.requireValue(left, node), b = this.requireValue(right, node);
    if (op === '==' || op === '!=') {
      if (a === 'null' || b === 'null') return value('boolean');
      if (!this.assignable(a, b) && !this.assignable(b, a)) this.fail(node, `Cannot compare ${a} with ${b}`);
      return value('boolean');
    }
    if (op === '&&' || op === '||') {
      this.expect('boolean', left, node); this.expect('boolean', right, node); return value('boolean');
    }
    if (op === '+' && (a === 'String' || b === 'String')) return value('String');
    if (!numeric(a) || !numeric(b)) this.fail(node, `Operator '${op}' requires numeric operands, received ${a} and ${b}`);
    if (['<', '>', '<=', '>='].includes(op)) return value('boolean');
    return value(op === '/' || a === 'double' || b === 'double' ? 'double' : 'int');
  }
  expression(node, scope) {
    switch (node.kind) {
      case 'literal': return value(node.value === null ? 'null' : typeof node.value === 'string' ? 'String' : typeof node.value === 'boolean' ? 'boolean' : node.token.text.includes('.') ? 'double' : 'int');
      case 'name': return this.name(node.name, scope, node);
      case 'member': return this.member(this.expression(node.object, scope), node.name, scope, node);
      case 'index': {
        const object = this.requireValue(this.expression(node.object, scope), node.object);
        if (object.endsWith('?') || object === 'null') this.fail(node, 'Cannot index a nullable value; check a local value against null first');
        this.expect('int', this.expression(node.index, scope), node.index);
        if (object === 'String') return value('String');
        if (object.endsWith('[]')) return value(object.slice(0, -2));
        this.fail(node, 'Indexing requires an array or String');
        break;
      }
      case 'unary': {
        const operand = this.expression(node.value, scope);
        if (node.op === '!') { this.expect('boolean', operand, node); return value('boolean'); }
        if (!numeric(this.requireValue(operand, node))) this.fail(node, `Operator '${node.op}' requires a number`);
        return value(operand.type);
      }
      case 'binary': {
        const left = this.expression(node.left, scope);
        if (node.op === '&&' || node.op === '||') {
          const rightScope = new Scope(scope);
          this.refine(node.left, node.op === '&&', rightScope);
          const right = this.expression(node.right, rightScope);
          scope.facts = this.commonFacts([scope, rightScope]);
          return this.binary(node.op, left, right, node);
        }
        return this.binary(node.op, left, this.expression(node.right, scope), node);
      }
      case 'assign': {
        const target = this.target(node.left, scope), right = this.expression(node.right, scope);
        this.expect(target.type, node.op === '=' ? right : this.binary(node.op[0], value(target.readType), right, node), node);
        if (target.binding) {
          scope.facts.delete(target.binding);
          if (target.type.endsWith('?') && right.kind === 'value' && right.type !== 'null' && !right.type.endsWith('?')) scope.facts.set(target.binding, target.type.slice(0, -1));
        }
        return value(target.type);
      }
      case 'update': {
        const target = this.target(node.value, scope);
        if (!numeric(target.readType)) this.fail(node, 'Increment/decrement requires a number');
        return value(target.readType);
      }
      case 'new': {
        const cls = this.classes.get(node.name);
        if (!cls) this.fail(node, `Unknown class '${node.name}'`);
        if (cls.kind === 'interface') this.fail(node, `Cannot construct interface '${node.name}'`);
        const constructor = cls.methods.get(cls.name);
        if (constructor) { this.access(constructor, cls, scope, node); this.arguments(constructor, cls, node.args, scope, node); }
        else if (node.args.length) this.fail(node, `${cls.name} has no constructor accepting arguments`);
        return value(cls.name);
      }
      case 'call': {
        const callee = this.expression(node.callee, scope);
        if (callee.kind === 'print') { node.args.forEach(arg => this.requireValue(this.expression(arg, scope), arg)); return value('void'); }
        if (callee.kind !== 'method') this.fail(node, 'Value is not callable');
        this.arguments(callee.method, callee.cls, node.args, scope, node);
        return value(callee.method.type === 'void' ? 'void' : this.type(callee.method.type, callee.cls, callee.method));
      }
      default: this.fail(node, `Unknown expression '${node.kind}'`);
    }
  }
  commonFacts(scopes) {
    if (!scopes.length) return new Map();
    return new Map([...scopes[0].facts].filter(([key, type]) => scopes.every(scope => scope.facts.get(key) === type)));
  }
  assignedNames(node, names = new Set()) {
    if (!node || typeof node !== 'object') return names;
    const target = node.kind === 'assign' ? node.left : node.kind === 'update' ? node.value : null;
    if (target?.kind === 'name') names.add(target.name);
    for (const [key, child] of Object.entries(node)) if (key !== 'token') {
      if (Array.isArray(child)) child.forEach(item => this.assignedNames(item, names));
      else if (child && typeof child === 'object') this.assignedNames(child, names);
    }
    return names;
  }
  refine(condition, truth, scope, assigned = this.assignedNames(condition)) {
    if (condition.kind === 'unary' && condition.op === '!') return this.refine(condition.value, !truth, scope, assigned);
    if (condition.kind !== 'binary') return;
    if ((condition.op === '&&' && truth) || (condition.op === '||' && !truth)) {
      this.refine(condition.left, truth, scope, assigned); this.refine(condition.right, truth, scope, assigned); return;
    }
    if (!['==', '!='].includes(condition.op) || truth !== (condition.op === '!=')) return;
    const name = condition.left.kind === 'name' && condition.right.kind === 'literal' && condition.right.value === null ? condition.left.name :
      condition.right.kind === 'name' && condition.left.kind === 'literal' && condition.left.value === null ? condition.right.name : null;
    const binding = name && scope.find(name);
    if (binding?.type.endsWith('?') && !assigned.has(name)) scope.facts.set(binding, binding.type.slice(0, -1));
  }
  killLoopFacts(node, scope) {
    for (const name of this.assignedNames(node)) {
      const binding = scope.find(name); if (binding) scope.facts.delete(binding);
    }
  }
  // Completion sets track all paths; unreachable statements are still type checked.
  statement(node, scope, returnType) {
    switch (node.kind) {
      case 'block': {
        const local = new Scope(scope);
        let paths = new Set(['normal']);
        for (const child of node.statements) {
          const next = this.statement(child, local, returnType);
          if (paths.delete('normal')) paths = new Set([...paths, ...next]);
        }
        scope.facts = local.facts;
        return paths;
      }
      case 'declare': {
        const type = this.type(node.type, scope.owner, node);
        const initial = node.value ? this.expression(node.value, scope) : null;
        if (initial) this.expect(type, initial, node.value);
        const binding = this.declare(scope, node.name, type, node);
        if (type.endsWith('?') && initial && initial.type !== 'null' && !initial.type.endsWith('?')) scope.facts.set(binding, type.slice(0, -1));
        break;
      }
      case 'expression': this.expression(node.expression, scope); break;
      case 'require': this.expect('boolean', this.expression(node.condition, scope), node.condition); this.refine(node.condition, true, scope); break;
      case 'return': {
        if (returnType === 'void') { if (node.value) this.fail(node, 'A void method cannot return a value'); }
        else if (!node.value) this.fail(node, `Expected return value of type ${returnType}`);
        else this.expect(returnType, this.expression(node.value, scope), node.value);
        return new Set(['return']);
      }
      case 'break': case 'continue': return new Set([node.kind]);
      case 'if': {
        this.expect('boolean', this.expression(node.condition, scope), node.condition);
        const yesScope = new Scope(scope), noScope = new Scope(scope);
        this.refine(node.condition, true, yesScope); this.refine(node.condition, false, noScope);
        const yes = this.statement(node.yes, yesScope, returnType);
        const no = node.no ? this.statement(node.no, noScope, returnType) : new Set(['normal']);
        if (node.condition.kind === 'literal') { scope.facts = node.condition.value ? yesScope.facts : noScope.facts; return node.condition.value ? yes : no; }
        scope.facts = this.commonFacts([...(yes.has('normal') ? [yesScope] : []), ...(no.has('normal') ? [noScope] : [])]);
        return new Set([...yes, ...no]);
      }
      case 'for': {
        this.expect('int', this.expression(node.start, scope), node.start);
        this.expect('int', this.expression(node.end, scope), node.end);
        this.killLoopFacts(node.body, scope);
        const local = new Scope(scope); this.declare(local, node.name, 'int', node, true);
        const paths = this.statement(node.body, local, returnType);
        return new Set(['normal', ...(paths.has('return') ? ['return'] : [])]);
      }
      case 'while': {
        this.killLoopFacts(node, scope);
        this.expect('boolean', this.expression(node.condition, scope), node.condition);
        const local = new Scope(scope); this.refine(node.condition, true, local);
        const paths = this.statement(node.body, local, returnType);
        this.killLoopFacts(node.body, scope);
        const result = new Set(paths.has('return') ? ['return'] : []);
        if (!(node.condition.kind === 'literal' && node.condition.value === true) || paths.has('break')) result.add('normal');
        return result;
      }
      default: this.fail(node, `Unknown statement '${node.kind}'`);
    }
    return new Set(['normal']);
  }
  program() {
    for (const cls of this.classes.values()) {
      if (cls.kind === 'interface') continue;
      const fields = new Scope(null, cls, true);
      for (const field of cls.fields.values()) {
        if (field.init) this.expect(this.type(field.type, cls, field), this.expression(field.init, fields), field.init);
      }
      for (const method of cls.methods.values()) {
        const scope = new Scope(null, cls, !method.isStatic);
        method.params.forEach(p => this.declare(scope, p.name, this.type(p.type, cls, p), p));
        const type = method.type === 'void' ? 'void' : this.type(method.type, cls, method);
        const paths = this.statement(method.body, scope, type);
        if (type !== 'void' && paths.has('normal')) this.fail(method, `Method '${method.name}' may finish without returning ${type}`);
      }
    }
  }
}
