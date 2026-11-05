export type Point = { x_pct:number; y_pct:number };
export function percentagePoint(clientX:number,clientY:number,rect:{left:number;top:number;width:number;height:number}):Point {
 const clamp=(n:number)=>Math.max(0,Math.min(100,n));
 return {x_pct:clamp((clientX-rect.left)/rect.width*100),y_pct:clamp((clientY-rect.top)/rect.height*100)};
}
export function anchorPosition(pin:Point & {page_x_pct?:number|null;page_y_pct?:number|null},element:{left:number;top:number;width:number;height:number}|null,page:{width:number;height:number}) {
 return element && element.width>0 && element.height>0 ? {left:element.left+element.width*pin.x_pct/100,top:element.top+element.height*pin.y_pct/100} : {left:page.width*(pin.page_x_pct??pin.x_pct)/100,top:page.height*(pin.page_y_pct??pin.y_pct)/100};
}
export const pinMarkerStyle='position:absolute;transform:translate(-50%,-50%);width:44px;height:44px;min-height:44px;border:2px solid white;border-radius:50%;background:#bd4d31;color:white;box-shadow:0 2px 6px #0004;font:700 13px system-ui;cursor:pointer;pointer-events:auto';
