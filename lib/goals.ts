import {listingUrl} from './listing-url.ts';
export type Goal={title:string;notes:string;shortlist:string[]};
export const emptyGoal:Goal={title:'',notes:'',shortlist:[]};
export function goalValue(value:unknown):Goal{
 if(!value||typeof value!=='object')throw new Error('Enter a valid goal.');
 const v=value as Record<string,unknown>;
 if(typeof v.title!=='string'||v.title.length>120||typeof v.notes!=='string'||v.notes.length>2000||!Array.isArray(v.shortlist)||v.shortlist.length>20||v.shortlist.some(x=>typeof x!=='string'||x.length>100))throw new Error('Use a short goal title, notes under 2,000 characters and up to 20 items.');
 return {title:v.title.trim(),notes:v.notes.trim(),shortlist:[...new Set(v.shortlist)] as string[]};
}
export async function shareHash(token:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(n=>n.toString(16).padStart(2,'0')).join('');}

export async function readGoal(db:D1Database,owner:string):Promise<Goal>{
 const row=await db.prepare("SELECT content FROM profiles WHERE owner=? AND kind='goal'").bind(owner).first<{content:string}>();
 if(!row)return {...emptyGoal,shortlist:[]};
 return goalValue(JSON.parse(row.content));
}
export async function saveGoal(db:D1Database,owner:string,value:unknown,now=Date.now()){
 const goal=goalValue(value);
 const ids=(await db.prepare('SELECT id FROM opportunities WHERE owner=?').bind(owner).all<{id:string}>()).results.map(r=>r.id);
 if(goal.shortlist.some(id=>!ids.includes(id)))throw new Error('Choose items from your own workspace.');
 await db.prepare("INSERT INTO profiles (id,owner,kind,content,updated) VALUES (?,?,'goal',?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content,updated=excluded.updated").bind(`${owner}:goal`,owner,JSON.stringify(goal),now).run();
 return goal;
}
export async function createGoalShare(db:D1Database,owner:string,now=Date.now()){
 const goal=await readGoal(db,owner);
 if(!goal.title||!goal.shortlist.length)throw new Error('Save a goal title and at least one shortlisted item first.');
 const all=await db.prepare('SELECT id,name,url,category FROM opportunities WHERE owner=?').bind(owner).all<{id:string;name:string;url:string;category:string}>();
 const items=all.results.filter(r=>goal.shortlist.includes(r.id)).map(({name,url,category})=>({name,url:category==='housing'?listingUrl(url,url):url,category}));
 if(!items.length)throw new Error('Your shortlisted items are no longer available.');
 const token=[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const expires=now+7*86400000;
 await db.batch([db.prepare("DELETE FROM profiles WHERE owner=? AND kind='goal-share'").bind(owner),db.prepare("INSERT INTO profiles (id,owner,kind,content,updated) VALUES (?,?,'goal-share',?,?)").bind(`share:${await shareHash(token)}`,owner,JSON.stringify({title:goal.title,items,expires}),now)]);
 return {path:`/shared#${token}`,expires};
}
export async function readGoalShare(db:D1Database,token:string,now=Date.now()){
 if(!/^[a-f0-9]{64}$/.test(token))return null;
 const row=await db.prepare("SELECT content FROM profiles WHERE id=? AND kind='goal-share'").bind(`share:${await shareHash(token)}`).first<{content:string}>();
 if(!row)return null;
 const data=JSON.parse(row.content) as {title:string;items:{name:string;url:string;category:string}[];expires:number};
 return data.expires<=now?null:data;
}
export async function revokeGoalShare(db:D1Database,owner:string){await db.prepare("DELETE FROM profiles WHERE owner=? AND kind='goal-share'").bind(owner).run();}
