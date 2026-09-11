import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const build=path.join(root,'.kole-build/vscode'),extension=path.join(build,'extension');
fs.mkdirSync(extension,{recursive:true});
fs.rmSync(path.join(extension,'smoke.cjs'),{force:true});
for(const file of fs.readdirSync(path.join(root,'vscode')).filter(file=>file!=='smoke.cjs'))fs.copyFileSync(path.join(root,'vscode',file),path.join(extension,file));
fs.cpSync(path.join(root,'src'),path.join(extension,'language/src'),{recursive:true});
fs.cpSync(path.join(root,'stdlib'),path.join(extension,'language/stdlib'),{recursive:true});
if(process.argv.includes('--stage-only')) { console.log(extension); process.exit(0); }
const version=JSON.parse(fs.readFileSync(path.join(root,'vscode/package.json'))).version;
fs.writeFileSync(path.join(build,'[Content_Types].xml'),'<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="mjs" ContentType="application/javascript"/><Default Extension="k" ContentType="text/plain"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="vsixmanifest" ContentType="text/xml"/></Types>');
fs.writeFileSync(path.join(build,'extension.vsixmanifest'),`<?xml version="1.0" encoding="utf-8"?><PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011"><Metadata><Identity Language="en-US" Id="kole-language" Version="${version}" Publisher="alexkull1130"/><DisplayName>Kole</DisplayName><Description xml:space="preserve">Kole language support</Description><Tags>kole,language</Tags><Categories>Programming Languages</Categories><GalleryFlags>Private</GalleryFlags><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.90.0"/><Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value=""/><Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/></Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>`);
fs.mkdirSync(path.join(root,'dist'),{recursive:true});const archive=path.join(root,'dist',`kole-language-${version}.vsix`);
if(fs.existsSync(archive))fs.unlinkSync(archive);
execFileSync('powershell.exe',['-NoProfile','-Command','Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:KOLE_EXTENSION_STAGE, $env:KOLE_EXTENSION_VSIX)'],{env:{...process.env,KOLE_EXTENSION_STAGE:build,KOLE_EXTENSION_VSIX:archive},stdio:'pipe'});
console.log(archive);
