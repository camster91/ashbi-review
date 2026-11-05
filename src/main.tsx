import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Projects} from './Projects';
import {ReviewWorkspace} from './ReviewWorkspace';
import {SignIn} from './SignIn';
import {api,json} from './api';
import './style.css';
function App(){
 const search=new URLSearchParams(location.search);const share=search.get('share'),guestToken=search.get('token');
 const readId=()=>new URLSearchParams(location.search).get('review');const [id,setId]=useState(readId);
 const [loginToken]=useState(()=>new URLSearchParams(location.hash.slice(1)).get('login'));
 const [user,setUser]=useState<{name:string}|null>(null);const [loading,setLoading]=useState(true);const [loginDone,setLoginDone]=useState(false);
 async function check(){try{setUser((await api<{user:{name:string}}>('/auth/me')).user);}catch{setUser(null);}finally{setLoading(false);}}
 useEffect(()=>{if(loginToken)history.replaceState(null,'',location.pathname+location.search);if(share){setLoading(false);return;}void check();},[]);
 useEffect(()=>{const back=()=>setId(readId());addEventListener('popstate',back);return()=>removeEventListener('popstate',back);},[]);
 function navigate(review:string|null){const url=new URL(location.href);if(review)url.searchParams.set('review',review);else url.searchParams.delete('review');history.pushState(null,'',url);setId(review);window.scrollTo(0,0);}
 async function logout(){await api('/auth/logout',json('POST',{}));setUser(null);navigate(null);}
 return <><div className="brandbar"><a href="/" onClick={e=>{if(!share){e.preventDefault();navigate(null);}}}>ASHBI <span>REVIEW</span></a>{user&&!share?<div>{user.name} <button className="secondary" onClick={()=>void logout()}>Sign out</button></div>:<span>Thoughtful feedback. Clear next steps.</span>}</div><main>{share&&guestToken?<ReviewWorkspace key={share} id={share} guestToken={guestToken} onBack={()=>{}}/>:loginToken&&!loginDone?<SignIn token={loginToken} onSignedIn={()=>{setLoginDone(true);void check();}}/>:loading?<p role="status">Opening workspace…</p>:!user?<SignIn token={null} onSignedIn={()=>void check()}/>:id?<ReviewWorkspace key={id} id={id} userName={user.name} onBack={()=>navigate(null)}/>:<Projects onReview={navigate}/>}</main></>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
