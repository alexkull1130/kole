import fs from 'node:fs';
const rules=JSON.parse(fs.readFileSync(new URL('../stdlib/diagnostics.json',import.meta.url),'utf8'));
export function diagnosticHint(message) {
  return rules.find(rule=>new RegExp(rule.pattern,'i').test(message))?.hint??'';
}
export function diagnosticContext(error, fallbackFile) {
  const lines=[],file=error.file??fallbackFile;
  try {
    const text=fs.readFileSync(file,'utf8').split(/\r\n|\n|\r/)[(error.line??1)-1];
    if(text!==undefined){
      const column=Math.max(0,Math.min((error.column??1)-1,text.length));
      lines.push('  '+text.replaceAll('\t','    '),'  '+' '.repeat(text.slice(0,column).replaceAll('\t','    ').length)+'^');
    }
  } catch { /* A missing file or an embedded declaration has no disk excerpt. */ }
  const hint=diagnosticHint(error.message);if(hint)lines.push('  hint: '+hint);
  return lines.join('\n');
}
