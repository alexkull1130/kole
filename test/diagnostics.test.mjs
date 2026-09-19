import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
const native=process.env.KOLE_TEST_NATIVE;
test('CLI diagnostics include imported source, a caret and a fixing hint',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kole-diagnostic-'));
 try{
 const main=path.join(dir,'Main.k'),helper=path.join(dir,'Helper.k');
 fs.writeFileSync(main,'import "Helper.k";\nclass Main {static main()->void {}}\n');
 fs.writeFileSync(helper,'class Helper {\n static f()->void {\n  const count:int=1;\n  count=2;\n }\n}\n');
 const result=spawnSync(native&& !native.endsWith('.dll')?native:native?'dotnet':process.execPath,[...(native?(native.endsWith('.dll')?[native]:[]):['src/cli.mjs']),'check',main],{encoding:'utf8',timeout:10000});
 assert.equal(result.status,1,result.stderr);assert.match(result.stderr,/Helper\.k:4:/);assert.match(result.stderr,/count=2;/);assert.match(result.stderr,/\^/);assert.match(result.stderr,/hint: Use a mutable declaration/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
