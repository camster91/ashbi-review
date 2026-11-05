import { InputError } from './images';
export function siteAnchor(data:Record<string,unknown>) {
 const percentage=(key:string)=>{const n=data[key];if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>100)throw new InputError('Invalid pin coordinates.');return n;};
 if(typeof data.page_path!=='string'||!data.page_path.startsWith('/')||data.page_path.startsWith('//')||data.page_path.length>2000||/[\r\n#]/.test(data.page_path))throw new InputError('Invalid page path.');
 if(typeof data.selector!=='string'||!data.selector.trim()||data.selector.length>1000)throw new InputError('Invalid element selector.');
 if(![390,768,1440].includes(Number(data.viewport))||typeof data.viewport!=='number')throw new InputError('Choose a supported viewport.');
 if(typeof data.scroll_y!=='number'||!Number.isFinite(data.scroll_y)||data.scroll_y<0||data.scroll_y>1e7)throw new InputError('Invalid scroll position.');
 return {x_pct:percentage('x_pct'),y_pct:percentage('y_pct'),page_x_pct:percentage('page_x_pct'),page_y_pct:percentage('page_y_pct'),page_path:data.page_path,selector:data.selector,viewport:data.viewport,scroll_y:data.scroll_y};
}
