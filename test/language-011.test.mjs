import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {run,Runtime} from '../src/runtime.mjs';
import {parse} from '../src/parser.mjs';
import {check} from '../src/checker.mjs';
const cases=JSON.parse(fs.readFileSync(new URL('./language-011-conformance.json',import.meta.url),'utf8'));
for(const [i,item] of cases.entries())test('0.11 conformance '+i,()=>{
 if(!item.success){assert.throws(()=>{const program=parse(item.source);check(program,new Runtime(program));});return;}
 const output=[];run(item.source,'Main',{print:x=>output.push(x)});assert.deepEqual(output,item.output);
});
