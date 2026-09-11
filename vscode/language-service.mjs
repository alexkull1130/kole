import fs from 'node:fs';
import path from 'node:path';
import { parse } from './language/src/parser.mjs';
import { tokenize } from './language/src/lexer.mjs';
import { loadProgram } from './language/src/modules.mjs';
import { Runtime } from './language/src/runtime.mjs';
import { check } from './language/src/checker.mjs';
import { builtinSignature } from './language/src/builtins.mjs';
import { mapType, genericParts } from './language/src/generics.mjs';

const memberNames = ['length','isEmpty','contains','startsWith','endsWith','indexOf','lastIndexOf','charAt','substring','toUpperCase','toLowerCase','trim','replace','split','repeat','toCharArray','get','set','first','last','reverse','copy','slice','join','toArray','toList','add','addAll','insert','remove','removeAt','clear'];
export const keywords = ['class','interface','extends','implements','abstract','override','public','private','static','me','super','new','return','if','else','for','while','break','continue','try','catch','finally','throw','using','require','requires','transitions','state','enum','owns','belongsTo','package','import','byte','short','int','long','float','char','bool','string','void','List','true','false','null','print'];
const key = file => path.resolve(file).toLowerCase();
export function analyze(file, source, overlays = new Map()) {
  const open = new Map([...overlays].map(([file,text]) => [key(file),text])); open.set(key(file),source);
  try {
    const program = loadProgram(file, {
      readFile: file => open.get(key(file)) ?? fs.readFileSync(file,'utf8'),
      realpath: file => open.has(key(file)) ? path.resolve(file) : fs.realpathSync(file)
    });
    check(program,new Runtime(program)); return [];
  } catch(error) {
    return [{ file:error.file??file, line:Math.max(0,(error.line??1)-1), column:Math.max(0,(error.column??1)-1), message:error.message }];
  }
}

export function indexDocument(source,file) {
  const lines=[0]; for(let i=0;i<source.length;i++) if(source[i]==='\n')lines.push(i+1);
  const offset=token=>(lines[token.line-1]??0)+token.column-1;
  const tokens=tokenize(source), symbols=[], classes=[];
  let program;
  try { program=parse(source,file); } catch { return {file,source,symbols,classes,imports:[],packageName:''}; }
  const tokenIndex=token=>tokens.findIndex(t=>t.line===token.line&&t.column===token.column);
  const end=token=>{
    let start=tokenIndex(token); if(start<0)return source.length;
    while(start<tokens.length&&!(tokens[start].kind==='symbol'&&tokens[start].text==='{'))start++;
    let depth=0;for(let i=start;i<tokens.length;i++)if(tokens[i].kind==='symbol'){
      if(tokens[i].text==='{')depth++;else if(tokens[i].text==='}'&&--depth===0)return offset(tokens[i])+1;
    }return source.length;
  };
  const add=(node,kind,owner,start,finish,depth)=>{
    const initial=tokenIndex(node.token), token=tokens.slice(Math.max(0,initial)).find(t=>t.kind==='identifier'&&t.text===node.name)??node.token;
    const symbol={name:node.name,type:node.type??'',kind,owner,file,line:token.line-1,column:token.column-1,offset:offset(token),start,end:finish,depth,node};symbols.push(symbol);return symbol;
  };
  for(const cls of program.classes){
    const owner=program.packageName?program.packageName+'.'+cls.name:cls.name;
    const start=offset(cls.token),finish=end(cls.token);
    const entry={...cls,fullName:owner,file,start,end:finish,packageName:program.packageName,imports:program.imports};classes.push(entry);
    add(cls,cls.isInterface?'interface':'class',owner,0,source.length,0);
    for(const m of cls.members){
      add(m,m.kind,owner,start,finish,1);
      if(m.kind!=='method'||!m.body)continue;
      const methodStart=offset(m.body.token),methodEnd=end(m.body.token);
      for(const p of m.params)add(p,'parameter',owner,methodStart,methodEnd,2);
      const walk=(node,scopeStart,scopeEnd,depth)=>{
        if(!node||typeof node!=='object')return;
        if(node.kind==='block'){scopeStart=offset(node.token);scopeEnd=end(node.token);depth++;}
        if(node.kind==='declare')add(node,'variable',owner,scopeStart,scopeEnd,depth);
        if(node.kind==='for'||node.kind==='using')add({...node,type:node.kind==='for'?'int':node.type},'variable',owner,offset(node.body.token),end(node.body.token),depth+1);
        if(node.kind==='try')for(const handler of node.catches)add(handler,'parameter',owner,offset(handler.body.token),end(handler.body.token),depth+1);
        for(const [k,child] of Object.entries(node))if(k!=='token'){
          if(Array.isArray(child))child.forEach(c=>walk(c,scopeStart,scopeEnd,depth));else if(child&&typeof child==='object')walk(child,scopeStart,scopeEnd,depth);
        }
      };walk(m.body,methodStart,methodEnd,2);
    }
  }
  return {file,source,symbols,classes,imports:program.imports,packageName:program.packageName};
}

export function completions(index, offset, indices) {
  indices=[...indices];
  const source=index.source, prefix=source.slice(0,offset);
  const owner=index.classes.find(c=>offset>=c.start&&offset<=c.end);
  const visible=index.symbols.filter(s=>offset>=s.start&&offset<=s.end&&(!['variable','parameter'].includes(s.kind)||s.offset<=offset));
  const local=name=>visible.filter(s=>s.name===name).sort((a,b)=>b.depth-a.depth||b.offset-a.offset)[0];
  const allClasses=[...indices].flatMap(i=>i.classes);
  const resolveClass=(type,context=owner)=>{
    const base=genericParts(type)?.base??type;
    const same=allClasses.find(c=>c.fullName===(context?.packageName?context.packageName+'.'+base:base));if(same)return same;
    const imported=context?.imports?.find(i=>!i.file&&i.name.split('.').at(-1)===base);
    if(imported)return allClasses.find(c=>c.fullName===imported.name);
    return allClasses.find(c=>c.fullName===base||c.name===base);
  };
  const classMembers=(type,staticOnly=false,seen=new Set(),context=owner)=>{
    const cls=resolveClass(type,context);if(!cls||seen.has(cls.fullName))return [];seen.add(cls.fullName);
    const args=genericParts(type)?.args??[], bindings=new Map((cls.typeParams??[]).map((param,i)=>[param,args[i]??param]));
    const result=[];
    for(const member of cls.members){
      if(member.constructor===true||member.access==='private'&&owner?.fullName!==cls.fullName||staticOnly&&!member.isStatic&&member.kind!=='enum')continue;
      const type=member.type?mapType(member.type,t=>bindings.get(t)??t):'';
      const symbol=[...indices].flatMap(i=>i.symbols).find(s=>s.owner===cls.fullName&&s.name===member.name);
      result.push({name:member.name,type,kind:member.kind,detail:member.kind==='method'?`${member.name}(${member.params.map(p=>`${p.name}: ${mapType(p.type,t=>bindings.get(t)??t)}`).join(', ')}) -> ${type}`:`${member.name}: ${type}`,symbol});
    }
    if(cls.parent)for(const parentMember of classMembers(mapType(cls.parent,t=>bindings.get(t)??t),staticOnly,seen,cls))if(!result.some(m=>m.name===parentMember.name))result.push(parentMember);
    return result;
  };
  const receiver=prefix.match(/(me|super|[A-Za-z_]\w*)(\s*\[[^\]]*\])?\s*\.\s*[A-Za-z_\w]*$/);
  if(receiver){
    const name=receiver[1];let type=name==='me'?owner?.name:name==='super'?owner?.parent:local(name)?.type;
    let staticOnly=false;if(!type&&resolveClass(name)){type=name;staticOnly=true;}
    // An unfinished member expression may prevent a full parse; declarations still provide useful completion.
    if(!type){const declarations=[...prefix.matchAll(new RegExp(`\\b${name}\\s*:\\s*([A-Za-z_][\\w<>?,\\[\\].]*)`,'g'))];type=declarations.at(-1)?.[1];}
    if(!type)return [];
    type=type.replace(/\?$/,'');if(receiver[2])type=type.endsWith('[]')?type.slice(0,-2):type.startsWith('List<')?type.slice(5,-1):type==='string'?'char':type;
    const builtins=memberNames.flatMap(name=>{
      if(name==='length'&&(type==='string'||type.endsWith('[]')||type.startsWith('List<')))return [{name,type:'int',kind:'field',detail:'length: int'}];
      const signature=builtinSignature(type,name);return signature?[{name,type:signature[1],kind:'method',detail:`${name}(${signature[0].join(', ')}) -> ${signature[1]}`}]:[];
    });return builtins.length?builtins:classMembers(type,staticOnly);
  }
  const unique=new Map();for(const symbol of visible.sort((a,b)=>a.depth-b.depth))unique.set(symbol.name,{name:symbol.name,type:symbol.type,kind:symbol.kind,detail:symbol.type?`${symbol.name}: ${symbol.type}`:symbol.name,symbol});
  for(const cls of allClasses)if(!unique.has(cls.name))unique.set(cls.name,{name:cls.name,kind:cls.isInterface?'interface':'class',detail:cls.fullName,symbol:[...indices].flatMap(i=>i.symbols).find(s=>s.owner===cls.fullName&&s.kind==='class')});
  for(const name of keywords)if(!unique.has(name))unique.set(name,{name,kind:'keyword',detail:'Kole keyword'});
  return [...unique.values()];
}

export function definition(index, offset, indices) {
  const before=index.source.slice(0,offset), after=index.source.slice(offset);
  const left=before.match(/[A-Za-z_]\w*$/)?.[0]??'',right=after.match(/^\w*/)?.[0]??'',name=left+right;
  return completions(index,offset-left.length,indices).find(item=>item.name===name)?.symbol??null;
}
