/** Source contracts only: no application imports, records, credentials or network. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const retiredRoots = [
  'accountModeration.ts','accountSubmissionNotifications.ts','adminActivityNotifications.ts',
  'adminApprovalSecurity.ts','adminGovernance.ts','adminGovernanceRoutes.ts','adminMessages.ts',
  'adminWipeRecovery.ts','adminWipeScope.ts','credentialExposure.ts','developmentSignup.ts',
  'hostelSecurity.ts','issueReportSecurity.ts','issueWorkflowSecurity.ts','jsonStoreSafety.ts',
  'legacyCredentialPolicy.ts','localDb.ts','maintenanceNotice.ts','managerApprovalSecurity.ts',
  'marketMediaSecurity.ts','marketMessaging.ts','marketOrderSecurity.ts','marketOrderWorkflow.ts',
  'marketOwnership.ts','marketRatingSecurity.ts','marketStoreProfile.ts','onboardingSubmissionSecurity.ts',
  'paystackPayments.ts','persistentDb.ts','privateRecordAccess.ts','recordAccessSecurity.ts',
  'residenceDeletion.ts','residenceRequests.ts','roomKeySecurity.ts','server.ts','signupSecurity.ts',
  'staffManagement.ts','themePreferences.ts','verificationService.ts','sessionSecurity.ts',
] as const;
const root=process.cwd();
const read=(file:string)=>fs.readFileSync(path.join(root,file),'utf8');
const source=(file:string)=>ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true);
const retired=new Set<string>(retiredRoots);
function relativeTarget(file:string,specifier:string):string|undefined{
  if(!specifier.startsWith('.'))return;
  const base=path.resolve(root,path.dirname(file),specifier);
  const withoutJs=base.replace(/\.(?:js|mjs|cjs)$/,'');
  const possible=[base,withoutJs+'.ts',withoutJs+'.tsx',base+'.ts',base+'.tsx',path.join(base,'index.ts'),path.join(base,'index.tsx')];
  const found=possible.find(candidate=>fs.existsSync(candidate)&&fs.statSync(candidate).isFile());
  assert.ok(found,`Relative runtime import resolves: ${file} -> ${specifier}`);
  assert.ok(found.startsWith(root+path.sep),'Runtime imports stay within the repository');
  return path.relative(root,found);
}
function runtimeSources(roots:string[]):string[]{
  const seen=new Set<string>();
  function visit(file:string){
    if(seen.has(file))return;
    assert.ok(!retired.has(file),'Runtime cannot import a retired root module: '+file);
    seen.add(file);
    const sf=source(file);
    function inspect(node:ts.Node){
      let specifier:ts.Node|undefined;
      if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))specifier=node.moduleSpecifier;
      else if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword
        ||ts.isIdentifier(node.expression)&&node.expression.text==='require'))specifier=node.arguments[0];
      if(specifier&&ts.isStringLiteralLike(specifier)){
        const target=relativeTarget(file,specifier.text);
        if(target&&/\.(?:ts|tsx)$/.test(target))visit(target);
      }
      ts.forEachChild(node,inspect);
    }
    inspect(sf);
  }
  roots.forEach(visit);return [...seen];
}
function exportsOf(file:string){
  const names:string[]=[];
  for(const node of source(file).statements){
    if(!ts.canHaveModifiers(node)||!ts.getModifiers(node)?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword))continue;
    if(ts.isVariableStatement(node)){for(const declaration of node.declarationList.declarations){
      if(ts.isIdentifier(declaration.name))names.push(declaration.name.text);
    }}else if('name' in node&&node.name&&ts.isIdentifier(node.name as ts.Node))names.push((node.name as ts.Identifier).text);
  }
  return names;
}

test('legacy JSON runtime and custom session modules are retired from active source',()=>{
  for(const file of retiredRoots)assert.equal(fs.existsSync(path.join(root,file)),false,file+' must remain retired');
});
test('the native server, workers and frontend do not reach legacy persistence',()=>{
  const files=runtimeSources(['supabase-server.ts','supabase-residence-worker.ts','supabase-system-wipe-worker.ts','src/main.tsx']);
  assert.ok(files.includes('supabase/db.ts')&&files.includes('supabase/auth.ts')&&files.includes('src/context/AuthContext.tsx'));
  for(const file of files){
    const text=read(file);
    for(const marker of ['pinevela_store.json','PINEVELA_DATA_DIR','PINEVELA_UPLOADS_DIR','VITE_PERSISTENCE','PINEVELA_PERSISTENCE'])
      assert.equal(text.includes(marker),false,file+' retains '+marker);
  }
});
test('shared native helpers retain no legacy storage or account-array exports',()=>{
  const removed:Record<string,string[]>={
    'resourceSecurity.ts':['createResourceProtection','guardAsyncRoutes','asyncHandler','isImageUploadRoute'],
    'imageUploadSecurity.ts':['createImageStorage'],
    'googleAuth.ts':['googlePrimaryAccount'],
    'inspectionReportSecurity.ts':['activeOfficerAccount','currentReportOfficer','officerIsAssigned','inspectionSubmissionTarget'],
    'accountSecurity.ts':['accountData','accountRole','accountId','accountKey','hashCredential','verifyCredential','findAsync',
      'credentialValues','passwordIsReused','passwordIsReusedAsync','protectStoredCredentials','publicAccountData','canManageHostel','hasActiveRoom','releaseRoom'],
  };
  for(const[file,names]of Object.entries(removed))for(const name of names)
    assert.equal(exportsOf(file).includes(name),false,file+' exports retired '+name);
  const budgets=source('resourceSecurity.ts').statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='AttemptBudgets');
  assert.ok(budgets&&ts.isClassDeclaration(budgets));
  for(const member of budgets.members)if(member.name)
    assert.ok(!['load','persist','file','writing'].includes(member.name.getText()),'Native attempt budgets do not persist legacy JSON');
  assert.ok(exportsOf('src/lib/administratorApproval.ts').includes('needsApprovalKey'));
  assert.ok(read('src/context/AuthContext.tsx').includes("from '../lib/administratorApproval'"));
});
test('default package commands select the native server and preserve its workers',()=>{
  const scripts=JSON.parse(read('package.json')).scripts as Record<string,string>;
  const expanded=(name:string,seen=new Set<string>()):string=>{assert.ok(!seen.has(name),'Package command aliases cannot cycle');seen.add(name);return scripts[name]?.replace(/npm run ([\w:-]+)/g,(_match,alias)=>expanded(alias,new Set(seen)))||'';};
  assert.match(expanded('dev'),/supabase-server\.ts/);
  assert.match(expanded('build'),/supabase-server\.ts/);
  assert.match(expanded('start'),/supabase-server\.mjs/);
  for(const name of ['dev','build','start'])assert.doesNotMatch(expanded(name),/(?<!supabase-)\bserver\.(?:ts|cjs)|persistentDb|localDb|pinevela_store/);
  assert.ok(Object.values(scripts).some(command=>/supabase-residence-worker\.ts|residence-worker\.mjs/.test(command)));
  assert.ok(Object.values(scripts).some(command=>/supabase-system-wipe-worker\.ts|system-wipe-worker\.mjs/.test(command)));
});
