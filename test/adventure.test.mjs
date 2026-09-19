import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const native=process.env.KOLE_TEST_NATIVE;
const executable=native?path.resolve(native):process.execPath;
function play(input,save){
    const result=spawnSync(executable,[...(native?[]:[path.join(root,'src/cli.mjs')]),'run',path.join(root,'examples/adventure/Adventure.k'),save],{encoding:'utf8',input,timeout:10000});
    assert.equal(result.status,0,result.stderr || String(result.error));
    return result.stdout.replaceAll('\r\n','\n');
}
function fixture(fn){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kole-adventure-'));
    try{fn(path.join(dir,'game.save'));}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
const reachChamber='go north\ntake lamp\nuse lamp\ngo north\ntake key\nuse key\ngo east\n';
test('adventure solves the puzzle across a saved and resumed session',()=>fixture(save=>{
    const first=play(reachChamber+'save\nquit\n',save);
    assert.match(first,/Coal chamber/);
    assert.match(first,/Saved\./);
    assert.deepEqual(fs.readFileSync(save,'utf8').trim().split(/\r?\n/),['KOLE-MINE-1','3','true','true','true','true','false']);
    const second=play('load\ntake coal\ngo west\ngo south\ngo south\ninventory\nsave\nquit\n',save);
    assert.match(second,/Loaded\./);assert.match(second,/YOU WIN!/);assert.match(second,/Carrying: lamp, brass key, coal/);
    assert.match(play('load\nquit\n',save),/YOU WIN!/);
}));
test('adventure enforces darkness, location, and gate rules',()=>fixture(save=>{
    const output=play('take coal\nuse key\ngo west\ngo north\ngo north\ntake lamp\ntake lamp\nuse lamp\ngo north\ngo east\ntake key\nuse key\ngo east\ntake coal\nquit\n',save);
    for(const text of ['no coal here','cannot use that','no exit that way','too dark','no lamp here','gate is locked','Taken: coal'])assert.ok(output.includes(text),text);
    assert.equal(output.includes('YOU WIN!'),false);
    assert.equal(fs.existsSync(save),false);
}));
test('adventure rejects corrupt saves without changing live progress',()=>fixture(save=>{
    for(const contents of [
        'bad\n',
        'UNKNOWN\n0\nfalse\nfalse\nfalse\nfalse\nfalse\n',
        'KOLE-MINE-1\n99\nfalse\nfalse\nfalse\nfalse\nfalse\n',
        'KOLE-MINE-1\n0\nmaybe\nfalse\nfalse\nfalse\nfalse\n',
        'KOLE-MINE-1\n0\nfalse\nfalse\nfalse\nfalse\ntrue\n'
    ]){
        fs.writeFileSync(save,contents);
        const output=play('go north\ntake lamp\nload\ninventory\nlook\nquit\n',save);
        assert.match(output,/Could not complete command:/);
        assert.match(output,/Carrying: lamp/);
        assert.equal(output.includes('Loaded.'),false);
        assert.ok(output.lastIndexOf('Equipment shed')>output.indexOf('Could not complete command:'));
        assert.equal(fs.readFileSync(save,'utf8'),contents);
    }
}));
test('adventure handles missing files, failed saves, whitespace, and EOF',()=>fixture(save=>{
    const output=play('load\n  GO   NORTH  \n\nhelp\nnonsense\ntake lamp\ninventory\n',save);
    assert.match(output,/Could not complete command:/);
    assert.match(output,/Equipment shed/);
    assert.match(output,/Unknown command/);
    assert.match(output,/Carrying: lamp/);
    assert.match(output,/Goodbye/);
    const failed=play('go north\ntake lamp\nsave\ninventory\nquit\n',path.join(save,'missing','game.save'));
    assert.match(failed,/Could not complete command:/);
    assert.match(failed,/Carrying: lamp/);
    assert.equal(failed.includes('Saved.'),false);
}));
