export class KoleError extends Error {
  constructor(message, token) {
    super(message);
    this.name = 'KoleError';
    this.line = token?.line ?? 1;
    this.column = token?.column ?? 1;
  }
}

export function tokenize(source) {
  const tokens = [];
  let pos = 0, line = 1, column = 1;
  const advance = () => {
    const c = source[pos++];
    if (c === '\n') { line++; column = 1; } else column++;
    return c;
  };
  while (pos < source.length) {
    const c = source[pos];
    if (/\s/.test(c)) { advance(); continue; }
    if (source.startsWith('//', pos)) {
      while (pos < source.length && source[pos] !== '\n') advance();
      continue;
    }
    const token = { line, column };
    if (source.startsWith('/*', pos)) {
      advance(); advance();
      while (pos < source.length && !source.startsWith('*/', pos)) advance();
      if (pos === source.length) throw new KoleError('Unterminated comment', token);
      advance(); advance(); continue;
    }
    if (c === '"') {
      advance();
      let value = '';
      while (pos < source.length && source[pos] !== '"') {
        let next = advance();
        if (next === '\n' || next === '\r') throw new KoleError('Unterminated string', token);
        if (next === '\\') {
          const escape = advance();
          const escapes = { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' };
          if (!Object.hasOwn(escapes, escape)) throw new KoleError('Unsupported string escape', token);
          next = escapes[escape];
        }
        value += next;
      }
      if (pos === source.length) throw new KoleError('Unterminated string', token);
      advance(); tokens.push({ ...token, kind: 'string', text: value }); continue;
    }
    if (/[0-9]/.test(c)) {
      let text = '';
      while (pos < source.length && /[0-9]/.test(source[pos])) text += advance();
      if (source[pos] === '.' && /[0-9]/.test(source[pos + 1] ?? '')) {
        text += advance();
        while (pos < source.length && /[0-9]/.test(source[pos])) text += advance();
      }
      tokens.push({ ...token, kind: 'number', text }); continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let text = '';
      while (pos < source.length && /[A-Za-z0-9_]/.test(source[pos])) text += advance();
      tokens.push({ ...token, kind: 'identifier', text }); continue;
    }
    const pair = source.slice(pos, pos + 2);
    if (['->', '==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '++', '--'].includes(pair)) {
      advance(); advance(); tokens.push({ ...token, kind: 'symbol', text: pair }); continue;
    }
    if ('{}()[];,:.=+-*/%!<>?'.includes(c)) {
      tokens.push({ ...token, kind: 'symbol', text: advance() }); continue;
    }
    throw new KoleError(`Unexpected character '${c}'`, token);
  }
  tokens.push({ kind: 'eof', text: '<eof>', line, column });
  return tokens;
}
