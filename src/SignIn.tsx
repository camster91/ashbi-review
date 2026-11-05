import {useState} from 'react';
import {api,json} from './api';
export function SignIn({token,onSignedIn}:{token:string|null;onSignedIn:()=>void}){
 const [email,setEmail]=useState('');const [message,setMessage]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 async function submit(){setBusy(true);setError('');try{if(token){await api('/auth/consume',json('POST',{token}));onSignedIn();}else{const result=await api<{message:string}>('/auth/request',json('POST',{email}));setMessage(result.message);}}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="empty-state"><p className="eyebrow">ASHBI WORKSPACE</p><h1>Sign in</h1><p>{token?'Open your workspace with this one-time link.':'Cameron and Bianca can sign in with an email link. Clients use their shared review link.'}</p>{error&&<p className="error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}<form className="auth-form" onSubmit={e=>{e.preventDefault();void submit();}}>{!token&&<label>Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></label>}<button disabled={busy}>{busy?'Please wait…':token?'Open workspace':'Email me a sign-in link'}</button></form>{token&&<a href="/">Request a new link</a>}</section>;
}
