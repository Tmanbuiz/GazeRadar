import {normalizeEmail} from './login.ts';
import {from64,type ApplicationMail} from './user-mail.ts';
export function reviewedApplication(v:Record<string,unknown>):ApplicationMail & {id:string;sender:string;title:string;jobUrl:string}{
 const text=(k:string,max:number)=>{const s=v[k];if(typeof s!=='string'||!s.trim()||s.length>max)throw new Error('Review the application fields and try again.');return s.trim();};
 const recipient=normalizeEmail(text('recipient',254)),sender=normalizeEmail(text('sender',254));
 if(!recipient||!sender||v.confirmed!==true)throw new Error('Confirm the sender, employer address, message and CV before sending.');
 const id=text('id',36);if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Prepare a new application review.');
 const subject=text('subject',300);if(/[\r\n]/.test(subject)||new TextEncoder().encode(subject).length>500)throw new Error('Use a single-line subject.');
 const body=text('body',20000);if(body.includes('[Your name]'))throw new Error('Replace the name placeholder before sending.');
 const fileName=text('fileName',120);if(!/^[a-zA-Z0-9 _().-]+\.(pdf|docx|txt)$/i.test(fileName))throw new Error('Use a PDF, DOCX or TXT CV with a simple filename.');
 const fileBase64=text('fileBase64',2800000);if(!/^[A-Za-z0-9+/]+={0,2}$/.test(fileBase64)||fileBase64.length%4)throw new Error('Select the CV file again.');
 const bytes=from64(fileBase64);if(!bytes.length||bytes.length>2*1024*1024)throw new Error('Choose a CV no larger than 2 MB.');
 const ext=fileName.split('.').pop()!.toLowerCase();
 if(ext==='pdf'&&new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-'||ext==='docx'&&(bytes[0]!==80||bytes[1]!==75)||ext==='txt'&&bytes.includes(0))throw new Error('The CV contents do not match its file extension.');
 const fileType=ext==='pdf'?'application/pdf':ext==='docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'text/plain';
 const jobUrl=typeof v.jobUrl==='string'?v.jobUrl:'';if(jobUrl&&(jobUrl.length>2048||!jobUrl.startsWith('https://')))throw new Error('Use the original HTTPS job link.');
 return {id,sender,recipient,subject,body,fileName,fileType,fileBase64,title:text('title',200),jobUrl};
}
export async function reserveApplication(db:D1Database,owner:string,a:{id:string;recipient:string;sender:string;title:string;jobUrl:string},now:number){
 const r=await db.prepare(`INSERT OR IGNORE INTO applications (id,owner,recipient,sender,title,job_url,status,created)
 SELECT ?,?,?,?,?,?,'sending',? WHERE (SELECT COUNT(*) FROM applications WHERE owner=? AND created>?)<5 AND (SELECT COUNT(*) FROM applications WHERE created>?)<100 AND NOT EXISTS (SELECT 1 FROM applications WHERE owner=? AND recipient=? AND title=? AND created>?)`)
 .bind(a.id,owner,a.recipient,a.sender,a.title,a.jobUrl,now,owner,now-86400000,now-86400000,owner,a.recipient,a.title,now-300000).run();
 if(!r.meta.changes)throw new Error('This application was already attempted, or the daily sending limit was reached. Check application history and Sent mail.');
}
