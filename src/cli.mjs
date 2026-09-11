#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { KoleError } from './lexer.mjs';
import { parse } from './parser.mjs';
import { Runtime } from './runtime.mjs';
import { check } from './checker.mjs';

const [command, file, ...args] = process.argv.slice(2);
if (command === 'alex' && !file) {
  console.log('Every language starts with a name.\nThis one started with Alex Kull.');
} else if (!['run', 'check'].includes(command) || !file) {
  console.error('Usage: kole <run|check> <file.k> [program arguments]');
  process.exitCode = 2;
} else {
  try {
    if (path.extname(file) !== '.k') throw new KoleError('Source files must use .k');
    const source = fs.readFileSync(file, 'utf8');
    const program = parse(source);
    const runtime = new Runtime(program);
    check(program, runtime);
    if (command === 'run') runtime.run(path.basename(file, '.k'), args);
    else console.log(`${file}: static checks passed`);
  } catch (error) {
    if (error instanceof KoleError) console.error(`${file}:${error.line}:${error.column}: ${error.message}`);
    else if (error.code) console.error(`kole: ${error.message}`);
    else { console.error(`kole: internal error: ${error.message}`); }
    process.exitCode = 1;
  }
}
