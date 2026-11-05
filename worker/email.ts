import type {Env} from './index';
export async function sendEmail(env:Env,to:string[],subject:string,body:string){
 if(!env.EMAIL||!env.EMAIL_FROM)throw new Error('Email is not configured');
 const {messageId}=await env.EMAIL.send({from:{email:env.EMAIL_FROM,name:'Ashbi Review'},to,subject,text:body});
 if(!messageId)throw new Error('Invalid email provider response');
 return messageId;
}

// Cloudflare's binding does not expose an idempotency key. Hold ambiguous
// deliveries for reconciliation, including a crash after provider acceptance.
const reconciliationHold=Number.MAX_SAFE_INTEGER;
const retryableRejections=new Set(['E_RATE_LIMIT_EXCEEDED','E_DAILY_LIMIT_EXCEEDED']);
type DigestComment={id:string;review_id:string;name:string;author:string;body:string;number:number};
export async function sendCommentDigest(env:Env,time:number){
 // Keep the queue intact until the sender is configured.
 if(!env.EMAIL||!env.EMAIL_FROM)return;
 const now=Math.floor(Date.now()/1000),batchId='comments-'+Math.floor(time/900000);
 // Freeze the exact set and text in SQL. Retries always send the same payload.
 await env.DB.batch([
  env.DB.prepare(`INSERT OR IGNORE INTO email_batches(id,payload,created_at)
   SELECT ?,json_group_array(json_object('id',id,'review_id',review_id,'name',name,'author',author_name,'body',body,'number',number)),?
   FROM (SELECT c.id,p.review_id,r.name,c.author_name,substr(c.body,1,1000) AS body,p.number FROM notification_queue q JOIN comments c ON c.id=q.comment_id JOIN pins p ON p.id=c.pin_id JOIN reviews r ON r.id=p.review_id WHERE q.batch_id IS NULL ORDER BY c.created_at,c.rowid LIMIT 100) HAVING count(*)>0`).bind(batchId,now),
  env.DB.prepare("UPDATE notification_queue SET batch_id=? WHERE batch_id IS NULL AND comment_id IN(SELECT json_extract(value,'$.id') FROM json_each((SELECT payload FROM email_batches WHERE id=?)))").bind(batchId,batchId)
 ]);
 const batch=await env.DB.prepare('UPDATE email_batches SET lease_until=? WHERE id=(SELECT id FROM email_batches WHERE sent_at IS NULL AND lease_until<? ORDER BY created_at LIMIT 1) RETURNING *').bind(reconciliationHold,now).first<{id:string;payload:string;created_at:number}>();
 if(batch){
  const comments=JSON.parse(batch.payload) as DigestComment[];
  const users=await env.DB.prepare('SELECT email FROM users ORDER BY id').all<{email:string}>();
  const body=comments.map(c=>`${c.name} — Pin ${c.number}\n${c.author}: ${c.body}\n${env.APP_ORIGIN??'https://review.ashbi.ca'}/?review=${encodeURIComponent(c.review_id)}`).join('\n\n');
  try{
   const providerId=await sendEmail(env,users.results.map(u=>u.email),`${comments.length} new ${comments.length===1?'comment':'comments'} in Ashbi Review`,body);
   await env.DB.batch([env.DB.prepare('UPDATE email_batches SET sent_at=?,provider_id=?,lease_until=0 WHERE id=?').bind(now,providerId,batch.id),env.DB.prepare('DELETE FROM notification_queue WHERE batch_id=?').bind(batch.id)]);
  }catch(error){
   const code=(error as {code?:string}|null)?.code;
   if(code&&retryableRejections.has(code))await env.DB.prepare('UPDATE email_batches SET lease_until=0 WHERE id=?').bind(batch.id).run();
   else console.error('Digest delivery needs reconciliation',{batchId:batch.id});
   throw error;
  }
 }
 await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now),env.DB.prepare('DELETE FROM login_tokens WHERE expires_at<?').bind(now)]);
}
