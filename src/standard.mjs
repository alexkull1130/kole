import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { number } from './numbers.mjs';
import { parse } from './parser.mjs';

export const standardNames = ['Error', 'RuntimeError', 'IOError', 'Closeable', 'Console', 'File', 'TextFile', 'Math', 'Int', 'Float'];
export function withStandard(program) {
  const standard = parse(`
    class Error {
      message: string;
      Error(message: string) { me.message = message; }
    }
    class RuntimeError extends Error { RuntimeError(message: string) { super(message); } }
    class IOError extends Error { IOError(message: string) { super(message); } }
    interface Closeable { close() -> void; }
    class Console {
      static readLine() -> string? { return null; }
      static write(text: string) -> void {}
      static writeLine(text: string) -> void {}
    }
    class File {
      static exists(path: string) -> bool { return false; }
      static readText(path: string) -> string { return ""; }
      static readLines(path: string) -> string[] { return []; }
      static writeText(path: string, text: string) -> void {}
      static appendText(path: string, text: string) -> void {}
      static writeLines(path: string, lines: string[]) -> void {}
      static open(path: string, mode: string) -> TextFile { throw new Error("native"); }
    }
    class TextFile implements Closeable {
      private TextFile() {}
      readLine() -> string? { return null; }
      write(text: string) -> void {}
      writeLine(text: string) -> void {}
      close() -> void {}
      isClosed() -> bool { return false; }
    }
    class Math {
      static abs(value: float) -> float { return 0; }
      static min(a: float, b: float) -> float { return 0; }
      static max(a: float, b: float) -> float { return 0; }
      static floor(value: float) -> float { return 0; }
      static ceil(value: float) -> float { return 0; }
      static round(value: float) -> float { return 0; }
      static sqrt(value: float) -> float { return 0; }
      static pow(value: float, exponent: float) -> float { return 0; }
    }
    class Int { static parse(text: string) -> int { return 0; } }
    class Float { static parse(text: string) -> float { return 0; } }
  `, '<kole>');
  for (const cls of standard.classes) if (['Console', 'File', 'TextFile', 'Math', 'Int', 'Float'].includes(cls.name)) for (const method of cls.members) if (method.kind === 'method' && !method.constructor) method.native = cls.name + '.' + method.name;
  for (const cls of program.classes) if (cls.aliases) for (const name of standardNames) cls.aliases.set(name, name);
  return { ...program, classes: [...standard.classes, ...program.classes] };
}

export class KoleThrown extends Error {
  constructor(value, token) {
    super(value.fields.get('message').value);
    this.value = value; this.file = token?.file; this.line = token?.line ?? 1; this.column = token?.column ?? 1;
    this.koleStack = []; this.suppressed = [];
  }
}

export function readConsoleLine() {
  const bytes = [], byte = Buffer.alloc(1);
  while (fs.readSync(0, byte, 0, 1, null)) {
    if (byte[0] === 10) break;
    bytes.push(byte[0]);
  }
  if (!bytes.length && byte[0] !== 10) return null;
  if (bytes.at(-1) === 13) bytes.pop();
  return Buffer.from(bytes).toString('utf8');
}

const handles = new WeakMap();
const lines = text => {
  if (!text) return [];
  const result = text.split(/\r\n|\n|\r/);
  if (result.at(-1) === '') result.pop();
  return result;
};
function replaceText(path, text) {
  const temporary = path + '.' + randomUUID() + '.tmp';
  const fd = fs.openSync(temporary, 'wx');
  try {
    try { fs.writeFileSync(fd, text, 'utf8'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temporary, path);
  } catch (error) { try { fs.unlinkSync(temporary); } catch {} throw error; }
}
export function invokeStandard(runtime, name, self, args, node) {
  const error = message => { throw new KoleThrown(runtime.create('IOError', [message], { owner: null }, node), node.token); };
  if (name === 'Console.readLine') return runtime.input();
  if (name === 'Console.write') { runtime.writeOutput(args[0]); return; }
  if (name === 'Console.writeLine') { runtime.print(args[0]); return; }
  if (name.startsWith('Math.')) {
    const values = args.map(arg => Number(arg.value));
    const method = name.slice(5);
    const result = method === 'round' ? Math.sign(values[0]) * Math.floor(Math.abs(values[0]) + 0.5) : Math[method](...values);
    return number('float', result, node);
  }
  if (name === 'Int.parse' || name === 'Float.parse') {
    const text = args[0].trim();
    if (name === 'Int.parse') {
      if (!/^[+-]?\d+$/.test(text)) runtime.fail(node, 'Invalid integer text');
      return number('int', BigInt(text), node);
    }
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) runtime.fail(node, 'Invalid float text');
    return number('float', Number(text), node);
  }
  try {
    switch (name) {
      case 'File.exists': return fs.existsSync(args[0]);
      case 'File.readText': return fs.readFileSync(args[0], 'utf8');
      case 'File.readLines': return runtime.collection('array', 'string', lines(fs.readFileSync(args[0], 'utf8')), null, node);
      case 'File.writeText': replaceText(args[0], args[1]); return;
      case 'File.appendText': fs.appendFileSync(args[0], args[1], 'utf8'); return;
      case 'File.writeLines': replaceText(args[0], args[1].items.join('\n') + (args[1].items.length ? '\n' : '')); return;
      case 'File.open': {
        if (!['r', 'w', 'a'].includes(args[1])) error('File mode must be r, w, or a');
        const fd = fs.openSync(args[0], args[1]);
        try {
          const cls = runtime.classes.get('TextFile'), value = runtime.create('TextFile', [], { owner: cls }, node);
          handles.set(value, { fd, mode: args[1], closed: false, lines: args[1] === 'r' ? lines(fs.readFileSync(fd, 'utf8')) : [], position: 0 });
          return value;
        } catch (failure) { fs.closeSync(fd); throw failure; }
      }
      default: {
        const handle = handles.get(self);
        if (!handle) error('Invalid file handle');
        if (name === 'TextFile.isClosed') return handle.closed;
        if (name === 'TextFile.close') { if (!handle.closed) { fs.closeSync(handle.fd); handle.closed = true; } return; }
        if (handle.closed) error('File is closed');
        if (name === 'TextFile.readLine') {
          if (handle.mode !== 'r') error('File is not open for reading');
          return handle.lines[handle.position++] ?? null;
        }
        if (handle.mode === 'r') error('File is not open for writing');
        fs.writeSync(handle.fd, args[0] + (name === 'TextFile.writeLine' ? '\n' : '')); return;
      }
    }
  } catch (failure) {
    if (failure instanceof KoleThrown || !failure.code) throw failure;
    error(failure.message);
  }
}
