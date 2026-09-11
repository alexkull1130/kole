import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
const executable = path.resolve(process.argv[2] ?? 'dist/kole.exe');
const corpus = JSON.parse(fs.readFileSync(new URL('../test/native-conformance.json', import.meta.url), 'utf8'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kole-conformance-'));
const failures=[];
try {
 for (const [index, item] of corpus.entries()) {
  const file=path.join(root,(item.entry??'Main')+'.k');fs.writeFileSync(file,item.source);
  const command=executable.endsWith('.dll')?'dotnet':executable;
  const args=[...(executable.endsWith('.dll')?[executable]:[]),item.mode,file,...(item.args??[])];
  const result=spawnSync(command,args,{encoding:'utf8',input:'',timeout:10000});
  const output=result.stdout?.replaceAll('\r\n','\n')??'';
  if((result.status===0)!==item.success||(item.mode==='run'&&output!==(item.output.length?item.output.join('\n')+'\n':''))) failures.push({index,...item,actualStatus:result.status,actualOutput:output,error:result.stderr??String(result.error)});
 }
 const launch=(file,input='',args=[])=>spawnSync(executable.endsWith('.dll')?'dotnet':executable,[...(executable.endsWith('.dll')?[executable]:[]),'run',file,...args],{encoding:'utf8',input,timeout:10000});
 const repository=fileURLToPath(new URL('../',import.meta.url)),data=path.join(root,'tasks.txt');
 const first=launch(path.join(repository,'examples/tasks/TaskManager.k'),'add Build kole\nadd Write tests\ndone 1\nlist\nquit\n',[data]);
 assert.equal(first.status,0,first.stderr);assert.match(first.stdout,/\[x\] Build kole/);assert.equal(fs.readFileSync(data,'utf8'),'1\tBuild kole\n0\tWrite tests\n');
 const second=launch(path.join(repository,'examples/tasks/TaskManager.k'),'list\nremove 1\nquit\n',[data]);
 assert.equal(second.status,0,second.stderr);assert.match(second.stdout,/\[x\] Build kole/);assert.equal(fs.readFileSync(data,'utf8'),'0\tWrite tests\n');
 const multi=launch(path.join(repository,'examples/multifile/Main.k'));assert.equal(multi.status,0,multi.stderr);assert.equal(multi.stdout.trim(),'Rex says woof');
 const io=path.join(root,'Main.k');fs.writeFileSync(io,`class Main {static main() -> void {using(f:TextFile=File.open(${JSON.stringify(data)},"r")){print(f.readLine(),f.readLine());f.close();try {f.readLine();}catch(e:IOError){print("closed");}}}}`);
 const ioRun=launch(io);assert.equal(ioRun.status,0,ioRun.stderr);assert.equal(ioRun.stdout.replaceAll('\r\n','\n'),'0\tWrite tests null\nclosed\n');
 console.log('Native task persistence, console input, module loading, and file cleanup passed');
}finally{fs.rmSync(root,{recursive:true,force:true});}
if(failures.length){const file=path.join(os.tmpdir(),'kole-native-failures.json');fs.writeFileSync(file,JSON.stringify(failures,null,2));console.error(`${failures.length}/${corpus.length} conformance failures; details: ${file}`);for(const f of failures)console.error(`${f.index}: ${f.error?.split('\n')[0]}`);process.exitCode=1;}else console.log(`${corpus.length} native conformance cases passed`);
