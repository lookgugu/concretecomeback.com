import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { tempDir, writeBlog, postSource, writeLedger, livePage, fakeResponse } from './test-helpers.mjs';
import { PHOTO_ROOT, loadPhotos, selectPhotos, verifyHostedPhoto } from './photos.mjs';
import { generateDraft } from './draft.mjs';
const sha = b => createHash('sha256').update(b).digest('hex');
const now = new Date('2026-10-17T16:00:00Z');
function fixture(root = tempDir()) {
  for (const d of ['newsletter/photos/originals','newsletter/photos/evidence','public/images/newsletter']) mkdirSync(join(root,d), { recursive:true });
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');
  const p = { id:'scene', slugs:['one','two','three','four'], sourcePageUrl:'https://example.org/source?a=1&b=2', license:'CC-BY-4.0', licenseUrl:'https://creativecommons.org/licenses/by/4.0/', author:'A <script>', attribution:'Scene & author', original:{ file:'newsletter/photos/originals/scene.png',sha256:sha(bytes) }, derivative:{file:'public/images/newsletter/scene.png',sha256:sha(bytes),width:1,height:1,bytes:bytes.length}, alt:'A scene <img onerror="oops">',caption:'A bench & a tree',modifications:'Resized; no crop',checkedAt:'2026-10-17T12:00:00.000Z',visualInspection:{verified:true,reviewer:'Reviewer',notes:'Both files inspected'},identity:{verified:true,subject:'Anonymous park scene',context:'Visible bench and tree'},evidence:{file:'newsletter/photos/evidence/scene.json',sha256:''} };
  const e = Object.fromEntries(['sourcePageUrl','license','licenseUrl','author','identity','visualInspection','checkedAt'].map(k=>[k,p[k]]));
  Object.assign(e,{originalSha256:p.original.sha256,commercialUseAllowed:true,notes:'Source and license reviewed for this original'});
  const evidence = JSON.stringify(e); p.evidence.sha256=sha(evidence);
  writeFileSync(join(root,p.evidence.file),evidence);
  writeFileSync(join(root,p.original.file),bytes); writeFileSync(join(root,p.derivative.file),bytes);
  const save = () => writeFileSync(join(root,'newsletter/photos/manifest.json'),JSON.stringify({schemaVersion:1,photos:[p]})); save();
  return {root,p,bytes,save};
}
const chosen = ['one','two','three','four'].map(slug=>({post:{slug}}));
test('valid local evidence; exact mapping, deduplication and explicit preview', async()=>{
 const f=fixture(); assert.equal(loadPhotos({...f,now}).photos.length,1);
 const r=await selectPhotos(chosen,{...f,now,testOnlyLocalImageVerification:true});
 assert.equal(r.selected.size,1); assert.equal(r.diagnostics.length,3);
 assert.equal(r.selected.get('one').verification.status,'test-only-local');
 assert.equal((await selectPhotos([{post:{slug:'unknown'}}],{...f,now})).selected.size,0);
});
for (const [name,mutate] of Object.entries({
 'missing evidence':p=>delete p.evidence,
 'noncommercial license':p=>p.license='CC-BY-NC-4.0',
 'unknown license':p=>p.license='unknown',
 'unverified identity':p=>p.identity.verified=false,
 'unverified inspection':p=>p.visualInspection.verified=false,
 'mismatching identity evidence':p=>p.identity.context='Other place',
 'bad hash':p=>p.derivative.sha256='0'.repeat(64),
 'bad dimensions':p=>p.derivative.width=20,
 'bad bytes':p=>p.derivative.bytes=20,
 'traversal':p=>p.original.file='newsletter/photos/../secret',
 'unknown field':p=>p.heroImage='https://bad.example/image',
 'missing file':p=>p.original.file='newsletter/photos/missing.png',
 'bad license link':p=>p.licenseUrl='https://example.org/license',
})) test(name,()=>{const f=fixture();mutate(f.p);f.save();const r=loadPhotos({...f,now});assert.equal(r.photos.length,0);assert.equal(r.diagnostics.length,1);});
test('malformed and absent manifest remain optional',()=>{
 const root=tempDir();assert.equal(loadPhotos({root}).photos.length,0);
 mkdirSync(join(root,'newsletter/photos'),{recursive:true});writeFileSync(join(root,'newsletter/photos/manifest.json'),'{');assert.equal(loadPhotos({root}).diagnostics.length,1);
});
test('hosted GET is fixed, bounded, hashed, and rejects status/MIME/redirect/corruption/timeouts',async()=>{
 const f=fixture();const p=loadPhotos({...f,now}).photos[0];
 const good=()=>new Response(f.bytes,{headers:{'content-type':'image/png'}});
 assert.equal((await verifyHostedPhoto(p,{fetchImpl:async(url,opts)=>{assert.equal(url,'https://concretecomeback.com/images/newsletter/scene.png');assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');return good();}})).status,'hosted-verified');
 for(const fetchImpl of [async()=>new Response('',{status:404}),async()=>new Response('',{status:302}),async()=>new Response(f.bytes),async()=>new Response(Buffer.alloc(f.bytes.length),{headers:{'content-type':'image/png'}}),async()=>new Response(f.bytes,{headers:{'content-type':'image/png','content-length':'3000000'}}),async()=>new Response(Buffer.alloc(f.bytes.length+1),{headers:{'content-type':'image/png'}}),async()=>{throw Error('offline');}]) {
  await assert.rejects(verifyHostedPhoto(p,{fetchImpl}));
  const r=await selectPhotos(chosen,{...f,now,fetchImpl});assert.equal(r.selected.size,0);assert.ok(r.diagnostics.length);
 }
 await assert.rejects(verifyHostedPhoto(p,{fetchImpl:()=>new Promise(()=>{}),timeoutMs:5}),/timeout/);
});
test('draft integrates escaped images, credits and text fallback without altering send blockers',async()=>{
 const {root,blogDir}=writeBlog({'one.md':postSource()}); const f=fixture(root);
 const ledgerDir=writeLedger(root,{}),sendRequirementsPath=join(root,'requirements.json');writeFileSync(sendRequirementsPath,JSON.stringify({schemaVersion:1,physicalPostalAddress:null,preferenceCenterUrl:null}));
 const options={blogDir,ledgerDir,sendRequirementsPath,photoRoot:root,now,fetchImpl:async()=>fakeResponse({body:livePage({slug:'one',title:'A perfectly ordinary post title'})})};
 const outDir=join(root,'preview');const result=await generateDraft({...options,outDir,testOnlyLocalImageVerification:true});
 const html=readFileSync(join(outDir,'draft.html'),'utf8'), md=readFileSync(join(outDir,'draft.md'),'utf8');
 assert.match(html,/<img src="https:\/\/concretecomeback.com\/images\/newsletter\/scene.png"/);assert.match(html,/&lt;img onerror=&quot;oops&quot;&gt;/);assert.doesNotMatch(html,/object-fit|<script>/);
 for(const output of [html,md]) {assert.match(output,/creativecommons.org\/licenses\/by\/4.0/);assert.match(output,/Resized; no crop/);assert.doesNotMatch(output,/cures|prevents injury|boosts recovery/i);}
 assert.equal(result.manifest.sendable,false);assert.equal(result.manifest.sendBlockers.length,6);
 const preview=readFileSync(join(outDir,'preview-local.html'),'utf8');
 assert.match(preview,/LOCAL PREVIEW/);assert.match(preview,/audience-verification/);assert.doesNotMatch(preview,/<img /);
 assert.equal(result.manifest.localPreview.images[0].reason,'preview requires JPEG');
 const fallback=await generateDraft({...options,outDir:join(root,'fallback')});assert.equal(fallback.manifest.status,'draft');assert.equal(fallback.manifest.photography.items.length,0);assert.ok(fallback.manifest.photography.diagnostics.length);assert.doesNotMatch(readFileSync(join(root,'fallback/draft.html'),'utf8'),/<img /);
});
for (const [name, sourcePageUrl, reason] of [
 ['dotless host', 'https://localhost/', 'invalid source URL'],
 ['unsafe scheme', 'javascript:alert(1)', 'invalid source URL'],
 ['credentials', 'https://user:password@example.org/source', 'invalid source URL'],
 ['plain HTTP', 'http://example.org/source', 'invalid source URL'],
 ['newline', 'https://example.org/so\nurce', 'invalid text'],
 ['tab', 'https://example.org/so\turce', 'invalid text'],
 ['null character', 'https://example.org/so\u0000urce', 'invalid text'],
 ['overlong URL', 'https://example.org/' + 'a'.repeat(2000), 'invalid text'],
]) test(`draft omits photo with ${name} source URL and matching evidence`, async()=>{
 const {root,blogDir}=writeBlog({'one.md':postSource()}); const f=fixture(root);
 f.p.sourcePageUrl=sourcePageUrl;
 const evidence=JSON.parse(readFileSync(join(root,f.p.evidence.file),'utf8'));
 evidence.sourcePageUrl=sourcePageUrl;
 const evidenceBytes=JSON.stringify(evidence);
 writeFileSync(join(root,f.p.evidence.file),evidenceBytes);
 f.p.evidence.sha256=sha(evidenceBytes);f.save();
 const ledgerDir=writeLedger(root,{}),sendRequirementsPath=join(root,'requirements.json');
 writeFileSync(sendRequirementsPath,JSON.stringify({schemaVersion:1,physicalPostalAddress:null,preferenceCenterUrl:null}));
 const outDir=join(root,'draft');
 const result=await generateDraft({blogDir,ledgerDir,sendRequirementsPath,photoRoot:root,now,outDir,testOnlyLocalImageVerification:true,fetchImpl:async()=>fakeResponse({body:livePage({slug:'one',title:'A perfectly ordinary post title'})})});
 assert.equal(result.manifest.status,'draft');
 assert.deepEqual(result.manifest.photography.items,[]);
 assert.deepEqual(result.manifest.photography.diagnostics,[{index:0,status:'omitted',reason}]);
 const html=readFileSync(join(outDir,'draft.html'),'utf8'),md=readFileSync(join(outDir,'draft.md'),'utf8');
 assert.match(html,/A perfectly ordinary post title/);assert.match(md,/A perfectly ordinary post title/);
 assert.doesNotMatch(html,/<img /);assert.doesNotMatch(md,/!\[/);
});
test('caps three distinct photos, lead at 600 and supporting at 280, without filling weekend', async()=>{
 const root=tempDir(), photos=[];
 for (const [i,name] of ['one','two','three','four'].entries()) {
  const f=fixture(root),p=f.p;
  p.id=name;p.slugs=[name];
  const bytes=Buffer.concat([f.bytes,Buffer.from(name)]);
  // Header dimensions are checked independently of display size.
  bytes.writeUInt32BE(1200,16);bytes.writeUInt32BE(800,20);
  p.derivative={file:`public/images/newsletter/${name}.png`,sha256:sha(bytes),width:1200,height:800,bytes:bytes.length};
  p.original={file:`newsletter/photos/originals/${name}.png`,sha256:sha(bytes)};
  writeFileSync(join(root,p.original.file),bytes);writeFileSync(join(root,p.derivative.file),bytes);
  const e=JSON.parse(readFileSync(join(root,p.evidence.file),'utf8'));e.originalSha256=p.original.sha256;
  const evidence=JSON.stringify(e);p.evidence={file:`newsletter/photos/evidence/${name}.json`,sha256:sha(evidence)};writeFileSync(join(root,p.evidence.file),evidence);
  photos.push(p);
 }
 writeFileSync(join(root,'newsletter/photos/manifest.json'),JSON.stringify({schemaVersion:1,photos}));
 const r=await selectPhotos(chosen,{root,now,testOnlyLocalImageVerification:true});
 assert.equal(r.selected.size,3);assert.equal(r.selected.get('one').displayWidth,600);assert.equal(r.selected.get('two').displayWidth,280);assert.equal(r.selected.get('three').displayWidth,280);assert.equal(r.selected.has('four'),false);
});
test('curated repository photos validate and map only to the reviewed articles', async()=>{
 const currentNow=new Date();
 const configured=JSON.parse(readFileSync(join(PHOTO_ROOT,'newsletter/photos/manifest.json'),'utf8')).photos;
 const local=loadPhotos({now:currentNow});assert.deepEqual(local.diagnostics,[]);
 assert.deepEqual(local.photos.map(p=>p.id),configured.map(p=>p.id));
 const slugs=['viral-older-skaters-permission-structure','building-a-backyard-mini-ramp','skateboarding-for-people-who-were-never-the-athletic-one'];
 const r=await selectPhotos(slugs.map(slug=>({post:{slug}})),{now:currentNow,testOnlyLocalImageVerification:true});
 assert.deepEqual(r.diagnostics,[]);assert.deepEqual([...r.selected.keys()],slugs);
 assert.deepEqual([...r.selected.values()].map(p=>p.id),['crabtree','miniramp','griptape']);
 for(const [i,id] of ['crabtree','miniramp','griptape'].entries()) assert.deepEqual(local.photos.find(p=>p.id===id).slugs,[slugs[i]]);
 assert.deepEqual([...r.selected.values()].map(p=>p.displayWidth),[600,280,280]);
 assert.match(r.selected.get(slugs[0]).caption,/not Grandma Liu or the location/);
 assert.match(r.selected.get(slugs[1]).caption,/not a build from the article/);
 for(const p of r.selected.values()) {assert.equal(p.license,'CC0-1.0');assert.doesNotMatch(p.caption,/cures|prevents injury|boosts recovery/i);}
});
