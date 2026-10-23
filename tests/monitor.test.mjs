import test from 'node:test';
import assert from 'node:assert/strict';
import {validUrl,pageLines,pageData,matchingAdditions,readPage,lineHash,toSnapshot,readSnapshot,isMajorChange,linkFor,buildAlert,MAX_LINES,MAX_ALERT_ITEMS} from '../lib/monitor.ts';

const baselineOf=lines=>readSnapshot(toSnapshot(lines));
const html=items=>items.map(t=>`<p>${t}</p>`).join('');
const withFetch=async(impl,fn)=>{const original=globalThis.fetch;globalThis.fetch=impl;try{await fn();}finally{globalThis.fetch=original;}};
const page=body=>new Response(body,{headers:{'content-type':'text/html'}});
const longText='<p>'+'Our team is hiring across several departments this season. '.repeat(4)+'</p>';

test('URL checks reject non-public address forms and credentials',()=>{
 for(const url of ['http://example.com','https://127.0.0.1','https://[::1]','https://foo.local','https://user:pass@example.com','https://2130706433','https://foo.com:8443'])assert.throws(()=>validUrl(url));
 for(const url of ['https://localhost','https://app.internal','https://intranet.local','https://0x7f.0.0.1','https://[::ffff:127.0.0.1]','ftp://example.com','https://example.com:444','https://example.com.','not a url'])assert.throws(()=>validUrl(url),url);
 assert.equal(validUrl('https://example.com/jobs#top'),'https://example.com/jobs');
});

test('extract and compare new keyword matches without script or unchanged text',()=>{
 const old=pageLines('<script>Remote developer hidden</script><p>Administrative assistant in Moncton</p><p>Welcome to our company website</p>');
 const next=pageLines('<p>Administrative assistant in Moncton</p><p>Welcome to our company website</p><p>Remote software engineer opportunity</p><p>Retail associate Fredericton</p>');
 const prev=baselineOf(old);
 assert.deepEqual(matchingAdditions(prev,next,['REMOTE']),['Remote software engineer opportunity']);assert.equal(matchingAdditions(prev,old,[]).length,0);assert.equal(matchingAdditions(prev,next,[]).length,2);
});

test('fetching refuses an unsafe redirect, oversized response, and blocked page',async()=>{
 const original=globalThis.fetch;
 try{
 globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}});
 await assert.rejects(readPage('https://example.com/jobs'),/public HTTPS/);
 globalThis.fetch=async()=>new Response('x'.repeat(1000001),{headers:{'content-type':'text/html'}});
 await assert.rejects(readPage('https://example.com/jobs'),/too large/);
 globalThis.fetch=async()=>new Response('Forbidden',{status:403});
 await assert.rejects(readPage('https://example.com/jobs'),/403/);
 }finally{globalThis.fetch=original;}
});

test('fetching refuses redirects to odd ports, internal names, plain http and endless redirects',async()=>{
 for(const location of ['https://example.com:8443/x','https://db.internal/x','http://example.com/x','https://user:pw@example.com/x'])
  await withFetch(async()=>new Response(null,{status:301,headers:{location}}),()=>assert.rejects(readPage('https://example.com/jobs'),/public HTTPS/,location));
 let calls=0;
 await withFetch(async()=>{calls++;return new Response(null,{status:302,headers:{location:`https://example.com/hop${calls}`}});},()=>assert.rejects(readPage('https://example.com/jobs'),/Too many redirects/));
 assert.equal(calls,4);
 await withFetch(async()=>new Response(null,{status:302}),()=>assert.rejects(readPage('https://example.com/jobs'),/without a destination/));
});

test('fetching refuses non-HTML content and pages with too little readable text',async()=>{
 await withFetch(async()=>new Response('%PDF-1.7',{headers:{'content-type':'application/pdf'}}),()=>assert.rejects(readPage('https://example.com/jobs'),/HTML or text/));
 await withFetch(async()=>page('<div id="root"></div><script>app()</script>'),()=>assert.rejects(readPage('https://example.com/jobs'),/Not enough readable text/));
});

test('short job titles are kept, one-word noise under four characters is not',()=>{
 const lines=pageLines('<li>Plumber</li><li>Cook II</li><li>Hi</li><li>Menu</li>');
 assert.deepEqual(lines,['Plumber','Cook II','Menu']);
});

test('keywords start-match words, short and quoted keywords match whole words only',()=>{
 const none=new Set();
 const run=(lines,kw)=>matchingAdditions(none,lines,kw);
 assert.deepEqual(run(['Remotely based coordinator','Remote analyst role open'],['remote']),['Remotely based coordinator','Remote analyst role open']);
 assert.deepEqual(run(['Interpreter wanted soon','Subremote depot clerk'],['remote']),[]);
 assert.deepEqual(run(['IT support analyst','Item pickup clerk','Hands-on with training'],['it']),['IT support analyst']);
 assert.deepEqual(run(['Summer intern wanted','Internal auditor opening'],['"intern"']),['Summer intern wanted']);
 assert.equal(run(['Internal auditor opening'],['intern']).length,1);
});

test('keywords starting with a dash exclude lines, alone or combined',()=>{
 const lines=['Senior engineer wanted','Engineer in training','Retail associate Fredericton'];
 assert.deepEqual(matchingAdditions(new Set(),lines,['engineer','-senior']),['Engineer in training']);
 assert.deepEqual(matchingAdditions(new Set(),lines,['-senior']),['Engineer in training','Retail associate Fredericton']);
});

test('odd keywords cannot break matching or match everything',()=>{
 assert.equal(matchingAdditions(new Set(),['C++ developer wanted today'],['c++']).length,1);
 for(const kw of ['(','[a-z]+','.*','\\','(a+)+$','-'])assert.doesNotThrow(()=>matchingAdditions(new Set(),['Some ordinary posting line'],[kw]));
 assert.deepEqual(matchingAdditions(new Set(),['Some ordinary posting line'],['".*"']),[]);
 assert.deepEqual(matchingAdditions(new Set(),['Some ordinary posting line'],['" "']),[]);
});

test('page text decoding does not double-decode and handles numeric entities',()=>{
 assert.deepEqual(pageLines('<p>Tom &amp;lt; Jerry coordinator</p>'),['Tom &lt; Jerry coordinator']);
 assert.deepEqual(pageLines('<p>Caf&#233; manager &#x2019;s role</p>'),['Café manager ’s role']);
 assert.deepEqual(pageLines('<p>Nurse &lt;b&gt;bold&lt;/b&gt; opening</p>'),['Nurse <b>bold</b> opening']);
});

test('baselines store hashes, not page text, and old full-text baselines still work',()=>{
 const lines=['Administrative assistant in Moncton','Retail associate Fredericton'];
 const snap=toSnapshot(lines);
 assert.ok(!snap.includes('Moncton'));
 assert.equal(JSON.parse(snap).v,2);
 assert.ok(snap.length<200);
 assert.equal(lineHash(lines[0]),lineHash(lines[0]));assert.notEqual(lineHash(lines[0]),lineHash(lines[1]));
 const legacy=readSnapshot(JSON.stringify(lines));
 assert.deepEqual(matchingAdditions(legacy,[...lines,'Remote software engineer opportunity'],[]),['Remote software engineer opportunity']);
 assert.deepEqual([...readSnapshot(snap)].sort(),[...legacy].sort());
 for(const bad of [null,'','not json','{"v":9}','42','null'])assert.equal(readSnapshot(bad),null);
});

test('a baseline for a full-size page stays far below the D1 row limit',()=>{
 const lines=Array.from({length:MAX_LINES},(_,i)=>`Posting ${i} `+'x'.repeat(1700));
 assert.ok(toSnapshot(lines).length<40000);
});

test('major change detection flags pages that stopped resembling the baseline',()=>{
 const base=Array.from({length:30},(_,i)=>`Open position number ${i}`);
 const prev=baselineOf(base);
 assert.equal(isMajorChange(prev,['Checking your browser before accessing this site']),true);
 assert.equal(isMajorChange(prev,base.slice(0,5)),true);
 assert.equal(isMajorChange(prev,[...base.slice(0,25),'Brand new opening here']),false);
 assert.equal(isMajorChange(baselineOf(base.slice(0,10)),['Completely different page text']),false);
});

test('truncation is reported when a page has more than the line limit',()=>{
 const many=pageData(html(Array.from({length:MAX_LINES+50},(_,i)=>`Line number ${i}`)));
 assert.equal(many.truncated,true);assert.equal(many.lines.length,MAX_LINES);
 assert.equal(pageData(html(['Line number one','Line number two'])).truncated,false);
});

test('links are resolved, restricted to https, and ambiguous anchor text is dropped',()=>{
 const {links}=pageData([
  '<li><a href="/jobs/1">Registered Nurse</a></li>',
  '<li><a class="x" href=\'https://other.example.org/p?id=2\'><span>Care Aide</span> Moncton</a></li>',
  '<li><a href="javascript:alert(1)">Click here now</a></li>',
  '<li><a href="http://example.com/insecure">Insecure link text</a></li>',
  '<li><a href="https://user:pw@example.com/x">Credential link</a></li>',
  '<li><a href="/a">Read more</a></li><li><a href="/b">Read more</a></li>',
  '<li><a href="/c">Same place</a></li><li><a href="/c">Same place</a></li>',
 ].join(''),'https://example.com/careers/');
 assert.deepEqual(links.sort((a,b)=>a.text.localeCompare(b.text)),[
  {text:'Care Aide Moncton',href:'https://other.example.org/p?id=2'},
  {text:'Registered Nurse',href:'https://example.com/jobs/1'},
  {text:'Same place',href:'https://example.com/c'},
 ]);
});

test('alerts attach the link next to a line and cap the number of items',()=>{
 const links=[{text:'Registered Nurse',href:'https://example.com/jobs/1'},{text:'Apply',href:'https://example.com/apply'}];
 assert.equal(linkFor('Registered Nurse',links),'https://example.com/jobs/1');
 assert.equal(linkFor('Registered Nurse - Fredericton - Full time',links),'https://example.com/jobs/1');
 assert.equal(linkFor('Apply today for a role in a very long description of duties',links),undefined);
 assert.equal(linkFor('Something unrelated',links),undefined);
 const alert=buildAlert(Array.from({length:MAX_ALERT_ITEMS+7},(_,i)=>`Line ${i} here`),links);
 assert.equal(alert.items.length,MAX_ALERT_ITEMS);assert.equal(alert.more,7);assert.equal(alert.v,2);
 assert.deepEqual(buildAlert(['Registered Nurse'],links).items,[{t:'Registered Nurse',h:'https://example.com/jobs/1'}]);
});

test('relative links are resolved against the final page after a redirect',async()=>{
 let n=0;
 await withFetch(async()=>++n===1?new Response(null,{status:301,headers:{location:'https://careers.example.com/openings/'}}):page(longText+'<li><a href="roles/42">Warehouse Supervisor</a></li>'),async()=>{
  const data=await readPage('https://example.com/jobs');
  assert.deepEqual(data.links,[{text:'Warehouse Supervisor',href:'https://careers.example.com/openings/roles/42'}]);
  assert.equal(data.truncated,false);assert.ok(data.lines.includes('Warehouse Supervisor'));
 });
});
