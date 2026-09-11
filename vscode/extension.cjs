const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function activate(context) {
  const service = await import(pathToFileURL(path.join(context.extensionPath,'language-service.mjs')).href);
  const diagnostics = vscode.languages.createDiagnosticCollection('kole');
  const indices = new Map(); let timer;
  const isKole = document => document.languageId === 'kole';
  const kinds = {class:vscode.CompletionItemKind.Class,interface:vscode.CompletionItemKind.Interface,method:vscode.CompletionItemKind.Method,field:vscode.CompletionItemKind.Field,parameter:vscode.CompletionItemKind.Variable,variable:vscode.CompletionItemKind.Variable,enum:vscode.CompletionItemKind.Enum,keyword:vscode.CompletionItemKind.Keyword};
  const update = document => {
    const file=document.uri.fsPath,source=document.getText();
    try {
      const index=service.indexDocument(source,file),previous=indices.get(file);
      // Preserve declarations for completion while an expression is unfinished.
      indices.set(file,index.classes.length||!previous?index:{...previous,source});
    } catch { if(indices.has(file))indices.set(file,{...indices.get(file),source}); }
    return indices.get(file)??{file,source,classes:[],symbols:[]};
  };
  const validate = () => {
    const open=vscode.workspace.textDocuments.filter(isKole),overlays=new Map(open.map(d=>[d.uri.fsPath,d.getText()]));
    const grouped=new Map();
    for(const document of open){
      update(document);
      if(document.uri.scheme!=='file'||document.getText().length>1_000_000)continue;
      for(const error of service.analyze(document.uri.fsPath,document.getText(),overlays)){
        if(error.file==='<kole>')continue;
        const uri=vscode.Uri.file(error.file),key=uri.toString();
        const range=new vscode.Range(error.line,error.column,error.line,error.column+1);
        const diagnostic=new vscode.Diagnostic(range,error.message,vscode.DiagnosticSeverity.Error);diagnostic.source='kole';
        if(!grouped.has(key))grouped.set(key,{uri,items:[]});
        const group=grouped.get(key);if(!group.items.some(d=>d.message===diagnostic.message&&d.range.isEqual(range)))group.items.push(diagnostic);
      }
    }
    diagnostics.clear();for(const group of grouped.values())diagnostics.set(group.uri,group.items);
  };
  const schedule = () => {clearTimeout(timer);timer=setTimeout(validate,200);};
  const selector={language:'kole'};
  context.subscriptions.push(diagnostics,{dispose:()=>clearTimeout(timer)},
    vscode.workspace.onDidOpenTextDocument(document=>{if(isKole(document))schedule();}),
    vscode.workspace.onDidChangeTextDocument(event=>{if(isKole(event.document))schedule();}),
    vscode.workspace.onDidCloseTextDocument(document=>{if(isKole(document))schedule();}),
    vscode.languages.registerCompletionItemProvider(selector,{provideCompletionItems(document,position){
      const index=update(document);
      return service.completions(index,document.offsetAt(position),indices.values()).map(value=>{
        const item=new vscode.CompletionItem(value.name,kinds[value.kind]??vscode.CompletionItemKind.Text);item.detail=value.detail;
        if(value.kind==='method'){item.insertText=new vscode.SnippetString(value.name+'(${1})');item.command={command:'editor.action.triggerParameterHints',title:'Parameters'};}
        return item;
      });
    }},'.'),
    vscode.languages.registerDefinitionProvider(selector,{provideDefinition(document,position){
      const symbol=service.definition(update(document),document.offsetAt(position),indices.values());
      return symbol?new vscode.Location(vscode.Uri.file(symbol.file),new vscode.Position(symbol.line,symbol.column)):null;
    }}),
    vscode.languages.registerHoverProvider(selector,{provideHover(document,position){
      const index=update(document),word=document.getWordRangeAtPosition(position);if(!word)return null;
      const item=service.completions(index,document.offsetAt(word.start),indices.values()).find(item=>item.name===document.getText(word));
      return item?new vscode.Hover(new vscode.MarkdownString().appendCodeblock(item.detail,'kole'),word):null;
    }}),
    vscode.languages.registerDocumentSymbolProvider(selector,{provideDocumentSymbols(document){
      const index=update(document);return index.symbols.filter(s=>['class','interface','method','field','enum'].includes(s.kind)).map(s=>new vscode.SymbolInformation(s.name,s.kind==='method'?vscode.SymbolKind.Method:s.kind==='field'?vscode.SymbolKind.Field:s.kind==='enum'?vscode.SymbolKind.Enum:s.kind==='interface'?vscode.SymbolKind.Interface:vscode.SymbolKind.Class,s.owner,new vscode.Location(document.uri,new vscode.Range(s.line,s.column,s.line,s.column+s.name.length))));
    }})
  );
  const watcher=vscode.workspace.createFileSystemWatcher('**/*.k');
  const refresh=async()=>{
    const files=await vscode.workspace.findFiles('**/*.k','**/{node_modules,.git,bin,obj,.kole-build}/**',300);
    for(const uri of files)try{if(!vscode.workspace.textDocuments.some(d=>d.uri.toString()===uri.toString()&&d.isDirty))indices.set(uri.fsPath,service.indexDocument(fs.readFileSync(uri.fsPath,'utf8'),uri.fsPath));}catch{}
    const core=path.join(context.extensionPath,'language/stdlib/core.k');indices.set(core,service.indexDocument(fs.readFileSync(core,'utf8'),core));schedule();
  };
  context.subscriptions.push(watcher,watcher.onDidCreate(refresh),watcher.onDidChange(refresh),watcher.onDidDelete(uri=>{indices.delete(uri.fsPath);schedule();}));
  await refresh();
  return { validate };
}
exports.activate=activate;
exports.deactivate=()=>{};
