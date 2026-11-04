import type {Env} from './index';
import {InputError} from './images';
import {siteAnchor} from './site-input';
import {text} from './input';
export type Author={name:string;email?:string|null;notify?:boolean};
export async function createPin(env:Env,review:{id:string;type:string},data:Record<string,unknown>,author:Author){
 for(const value of [data.x_pct,data.y_pct])if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100)throw new InputError('Pin coordinates must be between 0 and 100.');
 const anchor=review.type==='site'?siteAnchor(data):null,body=text(data.body,'Comment',10000),pinId=crypto.randomUUID(),commentId=crypto.randomUUID();
 const queries=[env.DB.prepare('INSERT INTO pins(id,review_id,x_pct,y_pct,page_path,selector,viewport,scroll_y,page_x_pct,page_y_pct,number) SELECT ?,?,?,?,?,?,?,?,?,?,COALESCE(MAX(number),0)+1 FROM pins WHERE review_id=?').bind(pinId,review.id,data.x_pct,data.y_pct,anchor?.page_path??'/',anchor?.selector??null,anchor?.viewport??null,anchor?.scroll_y??0,anchor?.page_x_pct??null,anchor?.page_y_pct??null,review.id),env.DB.prepare('INSERT INTO comments(id,pin_id,author_name,author_email,body) VALUES(?,?,?,?,?)').bind(commentId,pinId,author.name,author.email??null,body)];
 if(author.notify)queries.push(env.DB.prepare('INSERT INTO notification_queue(comment_id) VALUES(?)').bind(commentId));
 await env.DB.batch(queries);return env.DB.prepare('SELECT * FROM pins WHERE id=?').bind(pinId).first();
}
export async function createReply(env:Env,pinId:string,data:Record<string,unknown>,author:Author){
 const parent=data.parent_id===undefined||data.parent_id===null?null:text(data.parent_id,'Reply target',100);
 if(parent&&!await env.DB.prepare('SELECT id FROM comments WHERE id=? AND pin_id=?').bind(parent,pinId).first())throw new InputError('Reply must belong to the same pin.');
 const comment={id:crypto.randomUUID(),pin_id:pinId,author_name:author.name,body:text(data.body,'Comment',10000),parent_id:parent};
 const queries=[env.DB.prepare('INSERT INTO comments(id,pin_id,author_name,author_email,body,parent_id) VALUES(?,?,?,?,?,?)').bind(comment.id,pinId,author.name,author.email??null,comment.body,parent)];
 if(author.notify)queries.push(env.DB.prepare('INSERT INTO notification_queue(comment_id) VALUES(?)').bind(comment.id));
 await env.DB.batch(queries);return comment;
}
export async function reviewData(env:Env,review:{id:string;project_id:string;name:string;type:string;source_url:string|null;share_token:string;screenshot_mode:number}){
 const pins=await env.DB.prepare('SELECT * FROM pins WHERE review_id=? ORDER BY number').bind(review.id).all();
 const comments=await env.DB.prepare('SELECT c.id,c.pin_id,c.parent_id,c.author_name,c.body,c.created_at FROM comments c JOIN pins p ON p.id=c.pin_id WHERE p.review_id=? ORDER BY c.created_at,c.rowid').bind(review.id).all();
 const {proxyUrl}=await import('./proxy');
 return {review:{id:review.id,project_id:review.project_id,name:review.name,type:review.type,source_url:review.source_url,screenshot_mode:review.screenshot_mode,frame_url:review.type==='site'?proxyUrl(new URL(review.source_url!),`/p/${review.id}/${review.share_token}/`):undefined},pins:pins.results,comments:comments.results};
}
export async function imageResponse(env:Env,key:string){
 const file=await env.FILES.get(key);if(!file)return new Response('Image not found',{status:404});
 return new Response(file.body,{headers:{'Content-Type':file.httpMetadata?.contentType??'application/octet-stream','Content-Length':String(file.size),'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; sandbox"}});
}
