/** Inventory route replacements and guard against reintroducing JSON in the new
 * runtime. This reads source code only; it never reads application records or .env. */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
type Endpoint = { method: string; path: string; source: string; line: number; retired: boolean };
const methods = new Set(['get','post','put','patch','delete','all']);
function routes(file: string): Endpoint[] {
  const code = fs.readFileSync(file,'utf8'), source = ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true);
  const endpoints: Endpoint[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && methods.has(node.expression.name.text) && node.arguments.length) {
      const receiver = node.expression.expression.getText(source);
      if (['app','router'].includes(receiver)) {
        const route = node.arguments[0], values = ts.isArrayLiteralExpression(route) ? [...route.elements] : [route];
        for (const value of values) if (ts.isStringLiteralLike(value) && value.text.startsWith('/api/') && !value.text.includes('*')) endpoints.push({
          method: node.expression.name.text.toUpperCase(), path: value.text, source:file,
          line:source.getLineAndCharacterOfPosition(node.getStart()).line+1,
          retired:/\.status\(410\)/.test(node.getText(source)),
        });
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(source); return endpoints;
}
const rootFiles = fs.readdirSync('.').filter(file => file.endsWith('.ts') && file !== 'supabase-server.ts');
const legacy = rootFiles.flatMap(routes);
const replacement = fs.readdirSync('supabase').filter(file => file.endsWith('.ts')).flatMap(file => routes(path.join('supabase',file)));
const replacementKeys = new Set(replacement.map(r => `${r.method} ${r.path}`));
const oldKeys = new Map<string,Endpoint[]>();
for (const entry of legacy) { const key = `${entry.method} ${entry.path}`; oldKeys.set(key,[...(oldKeys.get(key)||[]),entry]); }
const inventory = [...oldKeys].map(([endpoint,sources]) => ({
  endpoint, status: replacementKeys.has(endpoint) ? 'implemented_requires_workflow_verification' : sources.every(s => s.retired) ? 'retired_do_not_port' : 'pending_review_and_port', sources,
})).sort((a,b) => a.endpoint.localeCompare(b.endpoint));
const seen = new Set<string>();
function imports(file: string) {
  const absolute = path.resolve(file);
  if (seen.has(absolute)) return; seen.add(absolute);
  if (['localDb.ts','persistentDb.ts','jsonStoreSafety.ts','adminWipeScope.ts','server.ts'].includes(path.basename(absolute))) throw new Error('Replacement runtime imports the JSON persistence layer.');
  const code = fs.readFileSync(absolute,'utf8'), source = ts.createSourceFile(absolute,code,ts.ScriptTarget.Latest,true);
  for (const node of source.statements) if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith('.')) {
    const stem = path.resolve(path.dirname(absolute),node.moduleSpecifier.text.replace(/\.js$/,'.ts'));
    const resolved = [stem,`${stem}.ts`,path.join(stem,'index.ts')].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (resolved) imports(resolved);
  }
}
imports('supabase-server.ts');
fs.writeFileSync('docs/migrations/api-cutover-inventory.json',JSON.stringify({
  note:'Generated from literal root Express routes. Mounted routers and frontend endpoint usage also need review. Implemented does not imply complete workflow validation.',
  endpoints:inventory,
},null,2)+'\n');
console.log(JSON.stringify({ legacyUniqueEndpoints:inventory.length, implementedEndpoints:inventory.filter(r => r.status.startsWith('implemented')).length,
  retiredEndpoints:inventory.filter(r => r.status.startsWith('retired')).length, pendingEndpoints:inventory.filter(r => r.status.startsWith('pending')).length,
  replacementModulesInspected:seen.size, jsonPersistenceReachable:false }));
