import { useCallback,useEffect,useRef,useState } from 'react';
import type { Pin } from './api';
export type SitePoint={x_pct:number;y_pct:number;page_x_pct:number;page_y_pct:number;page_path:string;selector:string;viewport:number;scroll_y:number};
export function SiteLayer({url,pins,activeId,width,showAll,onPage,onSelect,onCreate,jump}:{jump:number;url:string;pins:Pin[];activeId:string|null;width:number;showAll:boolean;onPage:(path:string)=>void;onSelect:(pin:Pin)=>void;onCreate:(point:SitePoint)=>void}) {
 const frame=useRef<HTMLIFrameElement>(null);const [mode,setMode]=useState('browse');const [loaded,setLoaded]=useState(false);const [error,setError]=useState(false);
 const config=useCallback((jump?:string)=>frame.current?.contentWindow?.postMessage({type:'ashbi:config',pins,mode,width,showAll,activeId,jump},'*'),[pins,mode,width,showAll,activeId]);
 const pagePath=useRef('/');const pendingJump=useRef<string|undefined>(undefined);
 useEffect(()=>{config();},[config]);
 useEffect(()=>{if(jump&&activeId){if(pins.find(p=>p.id===activeId)?.page_path!==pagePath.current)pendingJump.current=activeId;config(activeId);}},[jump]);
 useEffect(()=>{
  const listener=(event:MessageEvent)=>{
   if(event.source!==frame.current?.contentWindow||event.origin!=='null'||!event.data||typeof event.data!=='object')return;
   const data=event.data;
   if(typeof data.page_path!=='string'||!data.page_path.startsWith('/')||data.page_path.length>2000)return;
   if(data.type==='ashbi:ready'){setLoaded(true);setError(false);pagePath.current=data.page_path;onPage(data.page_path);config(pendingJump.current);pendingJump.current=undefined;}
   else if(data.type==='ashbi:select'){const pin=pins.find(p=>p.id===data.id);if(pin)onSelect(pin);}
   else if(data.type==='ashbi:draft'&&mode==='comment'){
    const p=data.point;if(!p||typeof p.selector!=='string'||p.selector.length>1000||p.page_path!==data.page_path||p.viewport!==width)return;
    if(![p.x_pct,p.y_pct,p.page_x_pct,p.page_y_pct].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100)||typeof p.scroll_y!=='number'||!Number.isFinite(p.scroll_y)||p.scroll_y<0)return;
    onPage(data.page_path);onCreate(p);
   }
  };
  addEventListener('message',listener);return()=>removeEventListener('message',listener);
 },[config,pins,mode,width,onPage,onCreate,onSelect]);
 useEffect(()=>{setLoaded(false);setError(false);const timer=setTimeout(()=>setError(true),15000);return()=>clearTimeout(timer);},[url]);
 return <div className="site-canvas"><div className="site-toolbar"><button className={mode==='browse'?'':'secondary'} aria-pressed={mode==='browse'} onClick={()=>setMode('browse')}>Browse</button><button className={mode==='comment'?'':'secondary'} aria-pressed={mode==='comment'} onClick={()=>setMode('comment')}>Comment</button><span>{mode==='comment'?'Click an element to place a pin.':'Links and menus are active.'}</span></div>
  {!loaded&&<p role="status">Loading website…</p>}{!loaded&&error&&<p role="alert">This site could not start the review layer. Try screenshot mode for sites that block the proxy.</p>}
  <div className="site-scroll"><iframe ref={frame} title="Website review" src={url} width={width} height={850} sandbox="allow-scripts allow-forms allow-popups" referrerPolicy="no-referrer" onLoad={()=>config()}/></div>
 </div>;
}
