import { mapType } from './generics.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from './parser.mjs';
import { KoleError } from './lexer.mjs';
import { primitiveTypes } from './numbers.mjs';

/** Load a file graph once, then qualify types while retaining each file's name scope. */
export function loadProgram(entryFile) {
  const modules = new Map();
  const read = file => {
    if (path.extname(file) !== '.k') throw new KoleError('Source files must use .k', { file });
    try {
      file = fs.realpathSync(file);
      if (modules.has(file)) return modules.get(file);
      const program = parse(fs.readFileSync(file, 'utf8'), file);
      const module = { file, program, dependencies: [], aliases: new Map() };
      modules.set(file, module); return module;
    } catch (error) {
      if (!(error instanceof KoleError)) throw new KoleError(`Cannot load ${file}: ${error.message}`, { file });
      throw error;
    }
  };
  const entry = read(path.resolve(entryFile));
  let root = path.dirname(entry.file);
  for (const segment of entry.program.packageName.split('.').filter(Boolean).reverse()) {
    if (path.basename(root) !== segment) throw new KoleError('Entry package must match its directory path', { file: entry.file });
    root = path.dirname(root);
  }
  const visited = new Set();
  const visit = module => {
    if (visited.has(module)) return;
    visited.add(module);
    for (const imported of module.program.imports) {
      const filename = imported.file ? path.resolve(path.dirname(module.file), imported.name) : path.join(root, ...imported.name.split('.')) + '.k';
      let dependency;
      try { dependency = read(filename); }
      catch (error) { throw new KoleError(`Import '${imported.name}': ${error.message}`, imported.token); }
      if (!imported.file) {
        const parts = imported.name.split('.'), className = parts.pop();
        if (dependency.program.packageName !== parts.join('.') || !dependency.program.classes.some(cls => cls.name === className))
          throw new KoleError(`Import '${imported.name}' does not match the file's package and class`, imported.token);
      }
      module.dependencies.push({ imported, dependency }); visit(dependency);
    }
  };
  visit(entry);
  const qualify = (module, name) => module.program.packageName ? module.program.packageName + '.' + name : name;
  const allNames = new Set();
  for (const module of modules.values()) {
    const add = (name, qualified, token) => {
      if (module.aliases.has(name)) throw new KoleError(`Duplicate or ambiguous imported name '${name}'`, token);
      module.aliases.set(name, qualified);
    };
    for (const cls of module.program.classes) {
      if ([...primitiveTypes, 'boolean', 'String', 'double', 'List', 'void', 'print'].includes(cls.name)) throw new KoleError(`Reserved class '${cls.name}'`, cls.token);
      const qualified = qualify(module, cls.name);
      if (allNames.has(qualified)) throw new KoleError(`Duplicate class '${qualified}'`, cls.token);
      allNames.add(qualified); add(cls.name, qualified, cls.token);
    }
    for (const { imported, dependency } of module.dependencies) {
      const names = imported.file ? dependency.program.classes.map(cls => cls.name) : [imported.name.split('.').at(-1)];
      for (const name of names) add(name, qualify(dependency, name), imported.token);
    }
  }
  for (const module of modules.values()) for (const cls of module.program.classes) {
    const enums = new Set(cls.members.filter(m => m.kind === 'enum').map(m => m.name));
    const type = name => mapType(name, base => {
      if ([...primitiveTypes, 'void', 'List', ...(cls.typeParams ?? [])].includes(base) || enums.has(base)) return base;
      return module.aliases.get(base) ?? base;
    });
    const walk = node => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (typeof node.type === 'string' && node.kind !== 'literal') node.type = type(node.type);
      if (node.kind === 'new' || node.kind === 'newList') node.name = type(node.name);
      if (node.kind === 'newArray') node.elementType = type(node.elementType);
      for (const [key, child] of Object.entries(node)) if (!['token', 'value'].includes(key) || (key === 'value' && node.kind !== 'literal')) walk(child);
    };
    walk(cls.members);
    const oldName = cls.name; cls.name = qualify(module, oldName);
    for (const m of cls.members) if (m.constructor === true) m.name = cls.name;
    cls.parent = cls.parent ? type(cls.parent) : null;
    cls.interfaces = cls.interfaces.map(type); cls.aliases = module.aliases;
  }
  return { classes: [...modules.values()].flatMap(m => m.program.classes), entry: qualify(entry, path.basename(entry.file, '.k')), files: [...modules.keys()] };
}
