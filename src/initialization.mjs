import { KoleError } from './lexer.mjs';

const intersect = (a, b) => a === null ? b : b === null ? a : new Set([...a].filter(item => b.has(item)));
const merge = (...flows) => {
  const result = new Map();
  for (const flow of flows) for (const [kind, state] of flow) result.set(kind, intersect(result.get(kind) ?? null, state));
  return result;
};
class Scope {
  constructor(parent = null) { this.parent = parent; this.locals = new Map(); }
  find(name) { return this.locals.get(name) ?? this.parent?.find(name); }
}

/** Conservative definite assignment; never executes a source expression. */
export function checkInitialization(runtime) {
  for (const cls of runtime.classes.values()) {
    if (cls.kind === 'interface') continue;
    new Analysis(cls).check();
  }
}

class Analysis {
  constructor(cls) { this.cls = cls; this.constructing = false; this.instance = true; }
  fail(node, message) { throw new KoleError(message, node.token ?? node); }
  complete(state) { return [...this.cls.fields.values()].every(field => state.has(field)); }
  requireComplete(state, node) {
    if (this.constructing && !this.complete(state)) this.fail(node, 'Cannot use or expose me before all fields are initialized');
  }
  symbol(node, scope) {
    if (node.kind === 'name') return scope.find(node.name) ?? (this.instance ? this.cls.fields.get(node.name) : null);
    if (node.kind === 'member' && node.object.kind === 'name' && node.object.name === 'me') return this.cls.fields.get(node.name);
    return null;
  }
  read(symbol, state, node) {
    if (symbol && !state.has(symbol)) this.fail(node, `'${symbol.name}' may be used before it is initialized`);
  }
  target(node, scope, state, read) {
    const symbol = this.symbol(node, scope);
    if (symbol) { if (read) this.read(symbol, state, node); return { symbol, state }; }
    if (node.kind === 'member') state = this.expression(node.object, scope, state);
    if (node.kind === 'index') state = this.expression(node.index, scope, this.expression(node.object, scope, state));
    return { symbol: null, state };
  }
  expression(node, scope, incoming) {
    let state = new Set(incoming);
    switch (node.kind) {
      case 'literal': break;
      case 'name':
        if (node.name === 'me') this.requireComplete(state, node);
        else {
          const symbol = this.symbol(node, scope); this.read(symbol, state, node);
          if (!symbol && this.instance && this.cls.methods.has(node.name) && !this.cls.methods.get(node.name).isStatic) this.requireComplete(state, node);
        }
        break;
      case 'member': {
        const symbol = this.symbol(node, scope);
        if (symbol) this.read(symbol, state, node);
        else state = this.expression(node.object, scope, state);
        break;
      }
      case 'index': state = this.expression(node.index, scope, this.expression(node.object, scope, state)); break;
      case 'unary': state = this.expression(node.value, scope, state); break;
      case 'binary':
        if (node.op === '&&' || node.op === '||') {
          const paths = this.condition(node, scope, state); state = intersect(paths.yes, paths.no) ?? state;
        } else state = this.expression(node.right, scope, this.expression(node.left, scope, state));
        break;
      case 'assign': {
        const target = this.target(node.left, scope, state, node.op !== '=');
        state = this.expression(node.right, scope, target.state);
        if (target.symbol) state.add(target.symbol);
        break;
      }
      case 'update': {
        const target = this.target(node.value, scope, state, true); state = target.state; break;
      }
      case 'call':
        state = this.expression(node.callee, scope, state);
        for (const arg of node.args) state = this.expression(arg, scope, state);
        break;
      case 'new': for (const arg of node.args) state = this.expression(arg, scope, state); break;
      case 'array': for (const item of node.items) state = this.expression(item, scope, state); break;
      case 'newArray': state = this.expression(node.size, scope, state); break;
      case 'newList': for (const arg of node.args) state = this.expression(arg, scope, state); break;
    }
    return state;
  }
  condition(node, scope, state) {
    if (state === null) return { yes: null, no: null };
    if (node.kind === 'literal' && typeof node.value === 'boolean') return node.value ? { yes: state, no: null } : { yes: null, no: state };
    if (node.kind === 'unary' && node.op === '!') {
      const result = this.condition(node.value, scope, state); return { yes: result.no, no: result.yes };
    }
    if (node.kind === 'binary' && ['&&', '||'].includes(node.op)) {
      const left = this.condition(node.left, scope, state);
      const right = this.condition(node.right, scope, node.op === '&&' ? left.yes : left.no);
      return node.op === '&&' ? { yes: right.yes, no: intersect(left.no, right.no) } : { yes: intersect(left.yes, right.yes), no: right.no };
    }
    const result = this.expression(node, scope, state); return { yes: result, no: result };
  }
  statement(node, scope, state) {
    if (state === null) return new Map();
    switch (node.kind) {
      case 'block': {
        const local = new Scope(scope); let flow = new Map([['normal', state]]);
        for (const child of node.statements) {
          if (!flow.has('normal')) break;
          const next = this.statement(child, local, flow.get('normal')); flow.delete('normal'); flow = merge(flow, next);
        }
        return flow;
      }
      case 'declare':
        if (node.value) state = this.expression(node.value, scope, state);
        scope.locals.set(node.name, node);
        state = new Set(state); if (node.value) state.add(node);
        break;
      case 'expression': state = this.expression(node.expression, scope, state); break;
      case 'throw': return new Map([['throw', this.expression(node.value, scope, state)]]);
      case 'using': {
        state = this.expression(node.value, scope, state);
        const local = new Scope(scope); local.locals.set(node.name, node); const ready = new Set(state); ready.add(node);
        return this.statement(node.body, local, ready);
      }
      case 'try': {
        let flow = this.statement(node.body, new Scope(scope), state);
        for (const handler of node.catches) {
          const local = new Scope(scope), caught = new Set(state); local.locals.set(handler.name, handler); caught.add(handler);
          flow = merge(flow, this.statement(handler.body, local, caught));
        }
        if (node.finalizer) {
          // The finalizer can also run after an exception from any expression.
          this.statement(node.finalizer, new Scope(scope), state);
          let combined = new Map();
          for (const [kind, exit] of flow) {
            const final = this.statement(node.finalizer, new Scope(scope), exit), result = new Map();
            for (const [outcome, ready] of final) result.set(outcome === 'normal' ? kind : outcome, ready);
            combined = merge(combined, result);
          }
          flow = combined;
        }
        return flow;
      }
      case 'return': return new Map([['return', node.value ? this.expression(node.value, scope, state) : state]]);
      case 'break': case 'continue': return new Map([[node.kind, state]]);
      case 'require': {
        const { yes } = this.condition(node.condition, scope, state);
        return yes === null ? new Map() : new Map([['normal', yes]]);
      }
      case 'if': {
        const paths = this.condition(node.condition, scope, state);
        return merge(this.statement(node.yes, new Scope(scope), paths.yes), node.no ? this.statement(node.no, new Scope(scope), paths.no) : paths.no === null ? new Map() : new Map([['normal', paths.no]]));
      }
      case 'for': {
        state = this.expression(node.end, scope, this.expression(node.start, scope, state));
        const local = new Scope(scope); local.locals.set(node.name, node);
        const initialized = new Set(state); initialized.add(node);
        const flow = this.statement(node.body, local, initialized);
        return merge(new Map([['normal', state]]), flow.has('return') ? new Map([['return', flow.get('return')]]) : new Map());
      }
      case 'while': {
        const paths = this.condition(node.condition, scope, state);
        const flow = this.statement(node.body, new Scope(scope), paths.yes);
        const exit = intersect(paths.no, flow.get('break') ?? null);
        const result = new Map();
        if (exit !== null) result.set('normal', exit);
        if (flow.has('return')) result.set('return', flow.get('return'));
        return result;
      }
    }
    return new Map([['normal', state]]);
  }
  check() {
    this.constructing = true;
    let initialized = new Set([...this.cls.fields.values()].filter(f => f.relationship === 'belongsTo'));
    for (const field of this.cls.fields.values()) if (field.owner !== this.cls) initialized.add(field);
    for (const field of this.cls.ownFields.values()) {
      if (field.init) { initialized = this.expression(field.init, new Scope(), initialized); initialized.add(field); }
    }
    const constructor = this.cls.methods.get(this.cls.name);
    let exits = new Map([['normal', initialized]]);
    if (constructor) {
      const scope = new Scope(); const state = new Set(initialized);
      for (const param of constructor.params) { scope.locals.set(param.name, param); state.add(param); }
      const first = constructor.body.statements[0];
      if (first?.kind === 'superCall') {
        let before = new Set(constructor.params);
        for (const arg of first.args) before = this.expression(arg, scope, before);
      }
      exits = this.statement({ ...constructor.body, statements: constructor.body.statements.slice(first?.kind === 'superCall' ? 1 : 0) }, scope, state);
    }
    for (const [kind, state] of exits) if (kind === 'normal' || kind === 'return') {
      for (const field of this.cls.fields.values()) if (!state.has(field)) this.fail(constructor ?? field, `Field '${field.name}' must be initialized on every constructor path`);
    }
    this.constructing = false;
    for (const method of this.cls.ownMethods.values()) {
      if (method.constructor || !method.body) continue;
      this.instance = !method.isStatic;
      const scope = new Scope(), state = new Set(this.cls.fields.values());
      for (const param of method.params) { scope.locals.set(param.name, param); state.add(param); }
      this.statement(method.body, scope, state);
    }
  }
}
