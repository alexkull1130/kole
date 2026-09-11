import { KoleError, tokenize } from './lexer.mjs';

const reserved = new Set(['class', 'interface', 'implements', 'public', 'private', 'static', 'enum', 'state', 'requires', 'transitions', 'require', 'if', 'else', 'while', 'for', 'return', 'break', 'continue', 'new', 'me', 'this', 'true', 'false', 'null', 'owns', 'belongsTo', 'atomic']);
const precedence = { '=': 1, '+=': 1, '-=': 1, '||': 2, '&&': 3, '==': 4, '!=': 4, '<': 5, '>': 5, '<=': 5, '>=': 5, '+': 6, '-': 6, '*': 7, '/': 7, '%': 7 };

export function parse(source) { return new Parser(tokenize(source)).program(); }

class Parser {
  constructor(tokens) { this.tokens = tokens; this.pos = 0; this.loops = 0; }
  peek(n = 0) { return this.tokens[Math.min(this.pos + n, this.tokens.length - 1)]; }
  at(text) { return this.peek().text === text && this.peek().kind !== 'string'; }
  take() { return this.tokens[this.pos++]; }
  match(text) { if (this.at(text)) return this.take(); return null; }
  expect(text) {
    if (!this.at(text)) throw new KoleError(`Expected '${text}', found '${this.peek().text}'`, this.peek());
    return this.take();
  }
  name() {
    const t = this.peek();
    if (t.kind !== 'identifier' || reserved.has(t.text)) throw new KoleError('Expected an identifier', t);
    return this.take().text;
  }
  type() {
    let type = this.name();
    while (true) {
      if (this.match('[')) { this.expect(']'); type += '[]'; }
      else if (this.match('?')) {
        if (type.endsWith('?')) throw new KoleError('A type cannot have repeated nullable markers', this.peek());
        type += '?';
      } else break;
    }
    return type;
  }
  modifiers() {
    let access = 'public', isStatic = false;
    const seen = new Set();
    while (['public', 'private', 'static'].some(v => this.at(v))) {
      const t = this.take();
      if (seen.has(t.text) || (t.text !== 'static' && (seen.has('public') || seen.has('private')))) throw new KoleError('Duplicate or conflicting modifier', t);
      seen.add(t.text);
      if (t.text === 'static') isStatic = true; else access = t.text;
    }
    return { access, isStatic };
  }
  program() {
    const classes = [];
    while (this.peek().kind !== 'eof') classes.push(this.classDecl());
    if (!classes.length) throw new KoleError('Expected at least one class', this.peek());
    return { classes };
  }
  classDecl() {
    const token = this.peek();
    this.match('public'); const isInterface = !!this.match('interface');
    if (!isInterface) this.expect('class');
    const name = this.name();
    const interfaces = [];
    if (!isInterface && this.match('implements')) do { interfaces.push(this.name()); } while (this.match(','));
    this.expect('{');
    const members = [];
    while (!this.at('}')) {
      const token = this.peek(), modifiers = this.modifiers();
      if (this.match('enum')) {
        if (isInterface) throw new KoleError('Interfaces contain method signatures only', token);
        const name = this.name(), values = [];
        this.expect('{');
        do { values.push(this.name()); } while (this.match(',') && !this.at('}'));
        this.expect('}'); this.match(';');
        members.push({ kind: 'enum', name, values, token, ...modifiers }); continue;
      }
      const lifecycle = !!this.match('state');
      const relationship = this.match('owns') ? 'owns' : this.match('belongsTo') ? 'belongsTo' : null;
      if (lifecycle && relationship) throw new KoleError('A lifecycle field cannot also be a relationship', token);
      if (this.at('atomic')) throw new KoleError("'atomic' is planned but not implemented", this.peek());
      const modern = this.peek(1).text === ':' || this.peek(1).text === '(';
      let type, memberName, constructor = false;
      if (modern) {
        memberName = this.name();
        if (this.match(':')) type = this.type();
        else if (memberName === name) { constructor = true; type = 'void'; }
      } else {
        // Temporary compatibility with programs written for the first bootstrap.
        type = this.type(); memberName = this.name();
      }
      if (this.match('(')) {
        if (modern && type && !constructor) throw new KoleError('Methods use name(parameters) -> Type, not name: Type(parameters)', token);
        if (lifecycle || relationship) throw new KoleError('state, owns, and belongsTo apply to fields only', token);
        const params = [];
        if (!this.at(')')) do {
          const token = this.peek();
          let type, name;
          if (this.peek(1).text === ':') { name = this.name(); this.expect(':'); type = this.type(); }
          else { type = this.type(); name = this.name(); }
          params.push({ type, name, token });
        } while (this.match(','));
        this.expect(')');
        if (modern && !constructor) { this.expect('->'); type = this.type(); }
        else if (this.at('->')) throw new KoleError('Constructors and legacy methods do not take a return arrow', this.peek());
        let from = null, to = null;
        if (this.match('requires')) from = this.name();
        else if (this.match('transitions')) { from = this.name(); this.expect('->'); to = this.name(); }
        if (to && type !== 'void') throw new KoleError('Transition methods must return void', token);
        if (from && (modifiers.isStatic || constructor)) throw new KoleError('Lifecycle clauses require an instance method', token);
        if (constructor && modifiers.isStatic) throw new KoleError('A constructor cannot be static', token);
        let body;
        if (isInterface) {
          if (constructor || modifiers.isStatic || modifiers.access !== 'public' || from) throw new KoleError('Interface methods must be public instance signatures without lifecycle restrictions', token);
          this.expect(';'); body = null;
        } else body = this.block();
        members.push({ kind: 'method', name: memberName, type, params, body, from, to, constructor, token, ...modifiers });
      } else {
        if (isInterface) throw new KoleError('Interfaces contain method signatures only', token);
        if (modifiers.isStatic) throw new KoleError('Static fields are not implemented yet', token);
        const init = this.match('=') ? this.expression() : null;
        this.expect(';');
        members.push({ kind: 'field', name: memberName, type, init, lifecycle, relationship, token, ...modifiers });
      }
    }
    this.expect('}');
    return { name, members, token, isInterface, interfaces };
  }
  block() {
    const token = this.expect('{'), statements = [];
    while (!this.at('}')) {
      if (this.peek().kind === 'eof') throw new KoleError('Unclosed block', token);
      statements.push(this.statement());
    }
    this.expect('}'); return { kind: 'block', statements, token };
  }
  statement() {
    const token = this.peek();
    if (this.at('{')) return this.block();
    if (this.match('for')) {
      this.expect('('); const name = this.name(); this.expect('=');
      const start = this.expression(); this.expect(':');
      const end = this.expression(); this.expect(':');
      const step = this.match('+') ? 1 : this.match('-') ? -1 : null;
      if (!step) throw new KoleError("Expected '+' or '-' loop step", this.peek());
      this.expect(')');
      this.loops++; const body = this.block(); this.loops--;
      return { kind: 'for', name, start, end, step, body, token };
    }
    if (this.match('while')) {
      this.expect('('); const condition = this.expression(); this.expect(')');
      this.loops++; const body = this.block(); this.loops--;
      return { kind: 'while', condition, body, token };
    }
    if (this.match('if')) {
      this.expect('('); const condition = this.expression(); this.expect(')');
      const yes = this.block(), no = this.match('else') ? this.statement() : null;
      return { kind: 'if', condition, yes, no, token };
    }
    if (this.match('return')) {
      const value = this.at(';') ? null : this.expression(); this.expect(';');
      return { kind: 'return', value, token };
    }
    if (this.at('break') || this.at('continue')) {
      if (!this.loops) throw new KoleError(`${token.text} requires a loop`, token);
      this.take(); this.expect(';'); return { kind: token.text, token };
    }
    if (this.match('require')) {
      const condition = this.expression(); this.expect(';');
      return { kind: 'require', condition, token };
    }
    if (token.kind === 'identifier' && !reserved.has(token.text) && this.peek(1).text === ':') {
      const name = this.name(); this.expect(':'); const type = this.type();
      const value = this.match('=') ? this.expression() : null;
      this.expect(';'); return { kind: 'declare', type, name, value, token };
    }
    // A declaration begins with a type name (optionally array brackets) and a name.
    let look = 1;
    while (true) {
      if (this.peek(look).text === '[' && this.peek(look + 1).text === ']') look += 2;
      else if (this.peek(look).text === '?') look++;
      else break;
    }
    if (token.kind === 'identifier' && !reserved.has(token.text) && this.peek(look).kind === 'identifier') {
      const type = this.type(), name = this.name();
      const value = this.match('=') ? this.expression() : null;
      this.expect(';'); return { kind: 'declare', type, name, value, token };
    }
    const expression = this.expression(); this.expect(';');
    return { kind: 'expression', expression, token };
  }
  expression(min = 1) {
    let left = this.unary();
    while (this.peek().kind === 'symbol' && (precedence[this.peek().text] ?? 0) >= min) {
      const token = this.take(), op = token.text, rank = precedence[op];
      const right = this.expression(rank === 1 ? rank : rank + 1);
      if (rank === 1 && !['name', 'member'].includes(left.kind)) throw new KoleError('Invalid assignment target', token);
      left = { kind: rank === 1 ? 'assign' : 'binary', op, left, right, token };
    }
    return left;
  }
  unary() {
    if (['!', '-', '+'].some(v => this.at(v))) {
      const token = this.take(); return { kind: 'unary', op: token.text, value: this.unary(), token };
    }
    let value = this.primary();
    while (true) {
      const token = this.peek();
      if (this.match('.')) value = { kind: 'member', object: value, name: this.name(), token };
      else if (this.match('(')) value = { kind: 'call', callee: value, args: this.arguments(), token };
      else if (this.match('[')) { const index = this.expression(); this.expect(']'); value = { kind: 'index', object: value, index, token }; }
      else if (this.match('++') || this.match('--')) {
        if (!['name', 'member'].includes(value.kind)) throw new KoleError('Invalid update target', token);
        value = { kind: 'update', value, step: token.text === '++' ? 1 : -1, token };
      } else break;
    }
    return value;
  }
  arguments() {
    const args = [];
    if (!this.at(')')) do { args.push(this.expression()); } while (this.match(','));
    this.expect(')'); return args;
  }
  primary() {
    const token = this.peek();
    if (token.kind === 'number') { this.take(); return { kind: 'literal', value: Number(token.text), token }; }
    if (token.kind === 'string') { this.take(); return { kind: 'literal', value: token.text, token }; }
    if (this.match('true')) return { kind: 'literal', value: true, token };
    if (this.match('false')) return { kind: 'literal', value: false, token };
    if (this.match('null')) return { kind: 'literal', value: null, token };
    if (this.match('new')) { const name = this.name(); this.expect('('); return { kind: 'new', name, args: this.arguments(), token }; }
    if (this.match('(')) { const value = this.expression(); this.expect(')'); return value; }
    if (this.match('me')) return { kind: 'name', name: 'me', token };
    if (this.at('this')) throw new KoleError("Use 'me' for the current object in kole", token);
    if (token.kind === 'identifier') return { kind: 'name', name: this.name(), token };
    throw new KoleError(`Expected an expression, found '${token.text}'`, token);
  }
}
