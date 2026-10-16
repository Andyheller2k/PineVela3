import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
import {Worker} from 'node:worker_threads';

const library=createRequire(import.meta.url).resolve('source-map-js');
function consume(line:number):Promise<{output:string;milliseconds:number}>{
 return new Promise((resolve,reject)=>{
  const worker=new Worker(`
   const {parentPort,workerData}=require('node:worker_threads');
   const {performance}=require('node:perf_hooks');
   const {SourceMapConsumer,SourceNode}=require(workerData.library);
   const map={version:3,sections:[{offset:{line:workerData.line,column:0},map:{version:3,sources:['input.js'],names:[],mappings:'AAAA',sourcesContent:['const value = 1;']}}]};
   const start=performance.now();
   const output=SourceNode.fromStringWithSourceMap('const value = 1;\\n',new SourceMapConsumer(map)).toString();
   parentPort.postMessage({output,milliseconds:performance.now()-start});
  `,{eval:true,workerData:{library,line}});
  const deadline=setTimeout(()=>{void worker.terminate();reject(Error('Source-map consumption exceeded its bounded worker deadline'));},5000);
  worker.once('message',value=>{clearTimeout(deadline);resolve(value);});
  worker.once('error',error=>{clearTimeout(deadline);reject(error);});
  worker.once('exit',code=>{if(code!==0){clearTimeout(deadline);reject(Error('Source-map worker failed'));}});
 });
}
test('valid indexed source maps preserve the generated output',async()=>{
 const result=await consume(0);
 assert.equal(result.output,'const value = 1;\n');
});
test('an out-of-file indexed offset finishes without iterating over absent lines',async()=>{
 const result=await consume(9_999_999);
 assert.equal(result.output,'const value = 1;\n');
 assert.ok(result.milliseconds<1000,'A section beyond the available code must finish promptly');
});
test('a hostile trillion-line section offset is rejected inside the bounded worker',async()=>{
 await assert.rejects(()=>consume(1_000_000_000_000),/Section offset line must not exceed 10000000/);
});
