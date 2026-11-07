import {test,expect,localHeaders} from './local';
import {siteOverlay} from '../worker/site-overlay';
test('website pins survive reload, content shifts, page and width filters',async({page})=>{
 const project=await page.request.post('/api/projects',{headers:localHeaders,data:{client_name:'Website QA',name:'Anchor proof'}});const projectId=(await project.json()).project.id;
 const create=await page.request.post(`/api/projects/${projectId}/sites`,{headers:localHeaders,data:{name:'Anchor fixture',source_url:'https://client.example.com/'}});const id=(await create.json()).review.id;
 let shifted=false;
 await page.route('**/p/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':"sandbox allow-scripts allow-forms allow-popups; frame-ancestors 'self'"},body:`<!doctype html><html><body style="margin:0"><a href="${path.replace(/\/[^/]*$/,'/about')}">About</a>${shifted?'<div style="height:80px">New content</div>':''}<h1 id="headline" tabindex="0" style="height:120px;margin:20px;background:#eee">A stable headline</h1><script>${siteOverlay('http://127.0.0.1:8788')}</script></body></html>`});});
 await page.goto('/?review='+id);const frame=page.frameLocator('iframe');await expect(frame.locator('#headline')).toBeVisible();
 const canvas=page.locator('.workspace-canvas');
 const initialWidth=(await canvas.boundingBox())!.width;
 await page.getByRole('button',{name:'Hide feedback'}).click();
 await expect(page.getByRole('complementary',{name:'Review feedback'})).toBeHidden();
 expect((await canvas.boundingBox())!.width).toBeGreaterThan(initialWidth);
 await page.getByRole('button',{name:'Comment',exact:true}).click();await frame.locator('#headline').click();
 await expect(page.getByRole('complementary',{name:'Review feedback'})).toBeVisible();
 await page.getByRole('textbox',{name:'Comment',exact:true}).fill('Persistent website feedback');await page.getByRole('button',{name:'Save pin',exact:true}).click();
 await expect(frame.getByRole('button',{name:'Pin 1, open',exact:true})).toBeVisible();
 const before=await frame.getByRole('button',{name:'Pin 1, open'}).boundingBox();const elementBefore=await frame.locator('#headline').boundingBox();
 shifted=true;await page.reload();await expect(frame.getByRole('button',{name:'Pin 1, open',exact:true})).toBeVisible();
 const after=await frame.getByRole('button',{name:'Pin 1, open'}).boundingBox();const elementAfter=await frame.locator('#headline').boundingBox();expect(elementAfter!.y-elementBefore!.y).toBeGreaterThan(70);expect(Math.abs((after!.y-elementAfter!.y)-(before!.y-elementBefore!.y))).toBeLessThanOrEqual(2);
 await page.getByRole('combobox',{name:'Width',exact:true}).selectOption('390');await expect(frame.getByRole('button',{name:'Pin 1, open'})).toHaveCount(0);
 expect(await frame.locator('body').evaluate(()=>innerWidth)).toBe(390);
 for(const viewport of [768,1440,390]){await page.getByRole('combobox',{name:'Width',exact:true}).selectOption(String(viewport));expect(await frame.locator('body').evaluate(()=>innerWidth)).toBe(viewport);await expect(frame.getByRole('button',{name:'Pin 1, open'})).toHaveCount(viewport===1440?1:0);}
 await page.getByLabel('Show all pages and widths').check();await expect(frame.getByRole('button',{name:'Pin 1, open'})).toBeVisible();
 await frame.getByRole('link',{name:'About',exact:true}).click();await expect(frame.getByRole('button',{name:'Pin 1, open'})).toHaveCount(0);
 await page.locator('.pin-list button').filter({hasText:'Persistent website feedback'}).click();await expect(frame.getByRole('button',{name:'Pin 1, open'})).toBeVisible();
});
test('real client page reattaches its selector after reload and a small local content shift',async({page})=>{
 test.setTimeout(90000);
 const p=await page.request.post('/api/projects',{headers:localHeaders,data:{client_name:'Real site QA',name:'Lalaland'}});const projectId=(await p.json()).project.id;
 const r=await page.request.post(`/api/projects/${projectId}/sites`,{headers:localHeaders,data:{name:'Lalaland local proof',source_url:'https://lalalandnails.ca/'}});const id=(await r.json()).review.id;
 await page.goto('/?review='+id);const frame=page.frameLocator('iframe');await expect(frame.locator('h1')).toBeVisible({timeout:30000});
 await page.getByRole('button',{name:'Comment',exact:true}).click();await frame.locator('h1').click();await page.getByRole('textbox',{name:'Comment',exact:true}).fill('Real site anchor proof');await page.getByRole('button',{name:'Save pin',exact:true}).click();await page.reload();
 const marker=frame.getByRole('button',{name:'Pin 1, open',exact:true});await expect(marker).toBeVisible({timeout:30000});
 // This changes only the local isolated document, never the origin client site.
 await frame.locator('h1').evaluate(el=>{const spacer=document.createElement('div');spacer.style.height='40px';el.before(spacer);});
 await expect.poll(async()=>{const a=await frame.locator('h1').boundingBox(),b=await marker.boundingBox();return !!a&&!!b&&b.y>=a.y-20&&b.y<=a.y+a.height;}).toBe(true);
 const read=await page.request.get('/api/reviews/'+id,{headers:localHeaders});expect((await read.json()).pins[0].selector).toBeTruthy();
});

test('fresh phone guest saves and reloads a selector-anchored website comment',async({page,browser})=>{
 const p=await page.request.post('/api/projects',{headers:localHeaders,data:{client_name:'Website guest QA',name:'Phone flow'}});const project=(await p.json()).project.id;
 const r=await page.request.post(`/api/projects/${project}/sites`,{headers:localHeaders,data:{name:'Guest website',source_url:'https://client.example.com/'}});const id=(await r.json()).review.id;
 const share=await page.request.get(`/api/reviews/${id}/share`,{headers:localHeaders});const link=new URL((await share.json()).url);
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const guest=await context.newPage();
 await guest.route('**/p/**',route=>route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':"sandbox allow-scripts allow-forms allow-popups; frame-ancestors 'self'"},body:`<!doctype html><html><body><h1 id="client-headline">A mobile website</h1><script>${siteOverlay('http://127.0.0.1:8788')}</script></body></html>`}));
 await guest.goto('http://127.0.0.1:8788/'+link.search);await guest.getByRole('textbox',{name:'Your name',exact:true}).fill('Website client');await guest.getByRole('button',{name:'Open review',exact:true}).click();const frame=guest.frameLocator('iframe');await expect(frame.locator('h1')).toBeVisible();expect(await frame.locator('body').evaluate(()=>innerWidth)).toBe(390);
 await guest.getByRole('button',{name:'Comment',exact:true}).click();await frame.locator('h1').click();await guest.getByRole('textbox',{name:'Comment',exact:true}).fill('Please adjust this heading.');await guest.getByRole('button',{name:'Save pin',exact:true}).click();await expect(frame.getByRole('button',{name:'Pin 1, open'})).toBeVisible();
 await guest.reload();await expect(frame.getByRole('button',{name:'Pin 1, open'})).toBeVisible();await expect(guest.getByRole('button',{name:'Open review',exact:true})).toHaveCount(0);await expect(guest.getByRole('button',{name:'Resolve pin',exact:true})).toHaveCount(0);expect(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await context.close();
});
