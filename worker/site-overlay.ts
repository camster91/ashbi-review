import { anchorPosition, percentagePoint, pinMarkerStyle } from '../shared/pins';
// Self-contained code serialised into the isolated client document. No API credentials
// enter the frame; messages only select pins or propose drafts in the parent composer.
function install(parentOrigin:string,position:typeof anchorPosition,point:typeof percentagePoint,markerStyle:string) {
 if(window.parent===window)return;
 type FramePin={id:string;number:number;status:string;selector:string|null;x_pct:number;y_pct:number;page_x_pct:number|null;page_y_pct:number|null;page_path:string;viewport:number|null;scroll_y:number};
 let pins:FramePin[]=[];let mode='browse';let showAll=false;let currentWidth=1440;let selected:string|null=null;
 const host=document.createElement('div');host.dataset.ashbiLayer='';host.style.cssText='position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647';document.documentElement.appendChild(host);
 const shadow=host.attachShadow({mode:'open'});
 const path=()=>{const match=location.pathname.match(/^\/p\/[^/]+\/[^/]+\/[^/]+(\/.*)$/);return (match?.[1]??'/')+location.search;};
 const send=(type:string,data:object={})=>parent.postMessage({type,...data,page_path:path()},parentOrigin);
 function selector(el:Element){
  if(el.id && document.querySelectorAll('#'+CSS.escape(el.id)).length===1)return '#'+CSS.escape(el.id);
  const stable=['data-testid','data-id','name'];
  for(const attribute of stable){const value=el.getAttribute(attribute);if(value){const s=el.tagName.toLowerCase()+'['+attribute+'="'+CSS.escape(value)+'"]';if(document.querySelectorAll(s).length===1)return s;}}
  const parts:string[]=[];let node:Element|null=el;
  while(node&&node!==document.documentElement&&parts.length<15){const p:Element|null=node.parentElement;if(!p)break;const tag=node.tagName.toLowerCase();const siblings=Array.from(p.children).filter(s=>s.tagName.toLowerCase()===tag);parts.unshift(tag+(siblings.length>1?':nth-of-type('+(siblings.indexOf(node)+1)+')':''));node=p;}
  return 'html > '+parts.join(' > ');
 }
 let scheduled=false;
 function paint(){scheduled=false;const width=document.documentElement.scrollWidth,height=document.documentElement.scrollHeight;shadow.replaceChildren();
  for(const pin of pins){if(pin.page_path!==path()||(!showAll&&pin.viewport!==currentWidth))continue;let element:Element|null=null;
   try{if(pin.selector)element=document.querySelector(pin.selector);}catch{/* fallback for a selector no longer valid */}
   const rect=element?.getBoundingClientRect();const p=position(pin,rect?{left:rect.left+scrollX,top:rect.top+scrollY,width:rect.width,height:rect.height}:null,{width,height});
   const button=document.createElement('button');button.textContent=String(pin.number);button.setAttribute('aria-label','Pin '+pin.number+', '+pin.status);button.dataset.pinId=pin.id;button.style.cssText=markerStyle+';left:'+p.left+'px;top:'+p.top+'px;'+(pin.status==='resolved'?'background:#38654f;':'')+(pin.id===selected?'outline:3px solid #e8ab4f;outline-offset:2px;':'');
   button.onclick=e=>{e.stopPropagation();send('ashbi:select',{id:pin.id});};shadow.append(button);
  }
 }
 const schedule=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(paint);}};
 addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==parentOrigin||!event.data||event.data.type!=='ashbi:config')return;
  const data=event.data;pins=Array.isArray(data.pins)?data.pins:[];mode=data.mode==='comment'?'comment':'browse';showAll=data.showAll===true;currentWidth=data.width;selected=data.activeId??null;
  if(data.jump){const pin=pins.find(p=>p.id===data.jump);if(pin?.page_path===path()){let el:Element|null=null;try{el=pin.selector?document.querySelector(pin.selector):null;}catch{}if(el)el.scrollIntoView({block:'center',behavior:'smooth'});else scrollTo({top:pin.scroll_y??0,behavior:'smooth'});}else if(pin&&pin.page_path.startsWith('/')&&!pin.page_path.startsWith('//')){location.assign(location.pathname.split('/').slice(0,5).join('/')+pin.page_path);}}
  schedule();
 });
 document.addEventListener('click',event=>{
  if(mode!=='comment'||event.composedPath().includes(host))return;
  const el=event.target;if(!(el instanceof Element))return;event.preventDefault();event.stopImmediatePropagation();const rect=el.getBoundingClientRect();if(!rect.width||!rect.height)return;
  send('ashbi:draft',{point:{...point(event.clientX,event.clientY,rect),selector:selector(el),viewport:currentWidth,scroll_y:scrollY,page_x_pct:Math.max(0,Math.min(100,event.pageX/document.documentElement.scrollWidth*100)),page_y_pct:Math.max(0,Math.min(100,event.pageY/document.documentElement.scrollHeight*100)),page_path:path()}});
 },true);
 document.addEventListener('keydown',event=>{if(mode==='comment'&&event.key==='Enter'&&event.target instanceof Element&&!event.composedPath().includes(host)){const r=event.target.getBoundingClientRect();if(r.width&&r.height){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));}}},true);
 new ResizeObserver(schedule).observe(document.documentElement);
 new MutationObserver(records=>{if(records.some(r=>r.target!==host&&!host.contains(r.target)))schedule();}).observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true});
 addEventListener('load',schedule,true);addEventListener('resize',schedule);send('ashbi:ready');
}
export function siteOverlay(parentOrigin:string){return `(${install.toString()})(${JSON.stringify(parentOrigin)},${anchorPosition.toString()},${percentagePoint.toString()},${JSON.stringify(pinMarkerStyle)});`;}
