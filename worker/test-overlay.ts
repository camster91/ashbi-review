// Proof only: no persisted pins before #4. Inert by default so normal browsing works.
export const overlayScript = `(()=>{
const button=document.createElement('button');button.textContent='Comment mode: off';
button.style.cssText='position:fixed;bottom:16px;right:16px;z-index:2147483647;padding:12px 16px;background:#143e30;color:white;border:2px solid white;border-radius:8px;font:14px system-ui;cursor:pointer';
button.setAttribute('aria-pressed','false');document.body.append(button);let enabled=false;
button.onclick=()=>{enabled=!enabled;button.textContent='Comment mode: '+(enabled?'on':'off');button.setAttribute('aria-pressed',String(enabled));};
function selector(el){if(el.id)return '#'+CSS.escape(el.id);const parts=[];while(el&&el!==document.body&&parts.length<8){const p=el.parentElement;if(!p)break;parts.unshift(el.tagName.toLowerCase()+':nth-child('+(Array.from(p.children).indexOf(el)+1)+')');el=p;}return 'body > '+parts.join(' > ');}
document.addEventListener('click',e=>{if(!enabled||e.target===button)return;e.preventDefault();e.stopImmediatePropagation();const el=e.target;if(!(el instanceof Element))return;const r=el.getBoundingClientRect();const data={selector:selector(el),x_pct:r.width?(e.clientX-r.left)/r.width*100:0,y_pct:r.height?(e.clientY-r.top)/r.height*100:0,page_path:location.pathname,viewport:innerWidth,scroll_y:scrollY};console.info('Ashbi Review test pin',data);const dot=document.createElement('span');dot.textContent='•';dot.style.cssText='position:absolute;pointer-events:none;z-index:2147483646;color:#e14f39;font-size:48px;line-height:0;transform:translate(-50%,-50%);left:'+e.pageX+'px;top:'+e.pageY+'px';document.body.append(dot);},true);
})();`;
