const vscode=require('vscode');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
exports.run=async()=>{
 const extension=vscode.extensions.getExtension('alexkull1130.kole-language');assert.ok(extension);await extension.activate();
 const file=path.join(vscode.workspace.workspaceFolders[0].uri.fsPath,'Main.k');
 let document=await vscode.workspace.openTextDocument(file);document=await vscode.languages.setTextDocumentLanguage(document,'kole');
 const text=document.getText();
 const completion=await vscode.commands.executeCommand('vscode.executeCompletionItemProvider',document.uri,document.positionAt(text.indexOf('text.length')+5));
 assert.ok(completion.items.some(x=>x.label==='substring'),'String completion provider did not offer substring');
 const definitions=await vscode.commands.executeCommand('vscode.executeDefinitionProvider',document.uri,document.positionAt(text.indexOf('person.name')+9));
 assert.ok(definitions.length>0,'No member definition');assert.equal(definitions[0].uri.fsPath,file);assert.equal(definitions[0].range.start.line,1);
 const maps=await vscode.commands.executeCommand('vscode.executeCompletionItemProvider',document.uri,document.positionAt(text.indexOf('scores.get')+7));
 assert.ok(maps.items.some(x=>x.label==='getOrDefault'),'Map completion missing');
 const loop=await vscode.commands.executeCommand('vscode.executeCompletionItemProvider',document.uri,document.positionAt(text.indexOf('label.length')+6));
 assert.ok(loop.items.some(x=>x.label==='substring'),'Loop element completion missing');
 const replace=text.indexOf('count:int=1')+'count:int='.length;
 const edit=new vscode.WorkspaceEdit();edit.replace(document.uri,new vscode.Range(document.positionAt(replace),document.positionAt(replace+1)),'"bad"');await vscode.workspace.applyEdit(edit);
 const deadline=Date.now()+8000;while(Date.now()<deadline&&!vscode.languages.getDiagnostics(document.uri).some(x=>x.message.includes('Expected int'))){await new Promise(r=>setTimeout(r,100));}
 assert.ok(vscode.languages.getDiagnostics(document.uri).some(x=>x.message.includes('Expected int')),'Unsaved diagnostic was not published');
 fs.writeFileSync(process.env.KOLE_VSCODE_RESULT,JSON.stringify({completion:true,definition:true,unsavedDiagnostics:true,mapCompletion:true,collectionLoop:true}));
};
