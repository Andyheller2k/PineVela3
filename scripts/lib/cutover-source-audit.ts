/** Source-only inspection. Never import an application runtime or read records. */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export type Endpoint = { method:string; path:string; source:string; line:number; retired:boolean };
type Bindings = ReadonlyMap<string,string[]>;
function values(node:ts.Node|undefined,bindings:Bindings):string[] {
  if (!node) return [];
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isIdentifier(node)) return bindings.get(node.text)||[];
  if (ts.isAsExpression(node)||ts.isParenthesizedExpression(node)||ts.isSatisfiesExpression(node)) return values(node.expression,bindings);
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(n=>values(n,bindings));
  if (ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.PlusToken) {
    return values(node.left,bindings).flatMap(left=>values(node.right,bindings).map(right=>left+right));
  }
  if (ts.isTemplateExpression(node)) {
    let parts=[node.head.text];
    for (const span of node.templateSpans) {
      const substitutions=values(span.expression,bindings);
      // Unknown interpolation is not evidence of a registered route.
      if (!substitutions.length) return [];
      parts=parts.flatMap(prefix=>substitutions.map(value=>prefix+value+span.literal.text));
    }
    return parts;
  }
  return [];
}
export function readRoutes(file:string):Endpoint[] {
  const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  const endpoints:Endpoint[]=[],methods=new Set(['get','post','put','patch','delete','all']);
  function visit(node:ts.Node,bindings:Bindings) {
    if (ts.isBlock(node)||ts.isSourceFile(node)) {
      const nested=new Map(bindings);
      for (const statement of node.statements) {
        if (ts.isVariableStatement(statement)&&(statement.declarationList.flags&ts.NodeFlags.Const)) {
          for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name)) {
            const choices=values(declaration.initializer,nested);
            if (choices.length) nested.set(declaration.name.text,choices);
          }
        }
        visit(statement,nested);
      }
      return;
    }
    if (ts.isForOfStatement(node)&&ts.isVariableDeclarationList(node.initializer)) {
      const declaration=node.initializer.declarations[0],choices=values(node.expression,bindings);
      if (declaration&&ts.isIdentifier(declaration.name)&&choices.length) {
        const nested=new Map(bindings);nested.set(declaration.name.text,choices);
        visit(node.statement,nested);return;
      }
    }
    if (ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&methods.has(node.expression.name.text)
      &&['app','router'].includes(node.expression.expression.getText(source))) {
      for (const route of values(node.arguments[0],bindings)) if (route.startsWith('/api/')&&!route.includes('*')) endpoints.push({
        method:node.expression.name.text.toUpperCase(),path:route,source:file,
        line:source.getLineAndCharacterOfPosition(node.getStart()).line+1,
        retired:/\.status\(410\)/.test(node.getText(source)),
      });
    }
    ts.forEachChild(node,n=>visit(n,bindings));
  }
  visit(source,new Map());return endpoints;
}
/** Express parameter names do not change the URL contract. Keep method and every
 * literal segment, so a POST or a different suffix cannot masquerade as coverage. */
export function canonicalEndpoint(endpoint:Pick<Endpoint,'method'|'path'>):string {
  return endpoint.method+' '+endpoint.path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g,':parameter');
}
export function runtimeSources(roots:string[]):string[] {
  const seen=new Set<string>();
  function imports(file:string) {
    const absolute=path.resolve(file);
    if (seen.has(absolute)) return;seen.add(absolute);
    if (['localDb.ts','persistentDb.ts','jsonStoreSafety.ts','adminWipeScope.ts','server.ts'].includes(path.basename(absolute)))
      throw new Error('Replacement runtime imports the JSON persistence layer.');
    const source=ts.createSourceFile(absolute,fs.readFileSync(absolute,'utf8'),ts.ScriptTarget.Latest,true);
    for (const node of source.statements) if ((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier
      &&ts.isStringLiteral(node.moduleSpecifier)&&node.moduleSpecifier.text.startsWith('.')) {
      const stem=path.resolve(path.dirname(absolute),node.moduleSpecifier.text.replace(/\.js$/,'.ts'));
      const resolved=[stem,`${stem}.ts`,path.join(stem,'index.ts')].find(candidate=>fs.existsSync(candidate)&&fs.statSync(candidate).isFile());
      if (resolved) imports(resolved);
    }
  }
  roots.forEach(imports);return [...seen].map(file=>path.relative(process.cwd(),file)).sort();
}

/** References are evidence of text in source, not proof of reachability or of a
 * network request. Include templates but never interpret arbitrary client code. */
export function frontendApiReferences(directory='src') {
  const references:{path:string;source:string;line:number;method:string|null;dynamic:boolean}[]=[];
  function inspect(folder:string) {
    for (const file of fs.readdirSync(folder,{withFileTypes:true})) {
      const name=path.join(folder,file.name);
      if (file.isDirectory()) {inspect(name);continue;}
      if (!/\.tsx?$/.test(name)) continue;
      const source=ts.createSourceFile(name,fs.readFileSync(name,'utf8'),ts.ScriptTarget.Latest,true);
      function visit(node:ts.Node) {
        const value=ts.isStringLiteralLike(node)?node.text:ts.isTemplateExpression(node)
          ?node.head.text+node.templateSpans.map(span=>':parameter'+span.literal.text).join(''):'';
        if (value.startsWith('/api/')) {
          let method:string|null=null,child=node,parent=node.parent,dynamic=ts.isTemplateExpression(node);
          while(parent&&!ts.isStatement(parent)&&!ts.isJsxAttribute(parent)) {
            if(ts.isBinaryExpression(parent)&&parent.operatorToken.kind===ts.SyntaxKind.PlusToken)dynamic=true;
            if (ts.isCallExpression(parent)) {
              const callee=parent.expression.getText(source).split('.').pop();
              if (parent.arguments[0]===child&&['fetch','apiFetch','sessionFetch'].includes(callee||'')) {
                const options=parent.arguments[1];
                if (!options) method='GET';
                else if (ts.isObjectLiteralExpression(options)) {
                  const property=options.properties.find(p=>p.name?.getText(source).replace(/['"]/g,'')==='method');
                  if (!property) method='GET';
                  else if (ts.isPropertyAssignment(property)&&ts.isStringLiteralLike(property.initializer)) method=property.initializer.text.toUpperCase();
                }
              }
              break;
            }
            child=parent;parent=parent.parent;
          }
          references.push({path:value.split('?')[0],source:name,
            line:source.getLineAndCharacterOfPosition(node.getStart()).line+1,method,dynamic});
        }
        ts.forEachChild(node,visit);
      }
      visit(source);
    }
  }
  inspect(directory);return references;
}
