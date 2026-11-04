import { test, expect } from '@playwright/test';
test.afterEach(async({page},info)=>{if(info.status!==info.expectedStatus)console.log('Acceptance screen:',(await page.locator('body').innerText()).slice(0,4000));});
for(const width of [390,768,1440]) test(`persistent image review at ${width}px`,async({page})=>{
 page.on('pageerror',error=>console.error('Browser application error:',error.message));
 await page.setViewportSize({width,height:900});
 const ready=await page.request.get('/api/projects');
 expect(ready.status(),await ready.text()).toBe(200);
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Projects',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'New project',exact:true}).click();
 await page.getByRole('textbox',{name:'Client name',exact:true}).fill(`QA ${width} ${Date.now()}`);
 await page.getByRole('textbox',{name:'Project name',exact:true}).fill('Image workflow');
 await page.getByRole('button',{name:'Save project',exact:true}).click();
 await page.locator('#image-upload').setInputFiles({name:'Design.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6RsAAAAASUVORK5CYII=','base64')});
 const image=page.getByRole('img',{name:'Design.png',exact:true});await expect(image).toBeVisible();
 await expect.poll(()=>image.evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(0);
 for(let n=1;n<=5;n++){
  if(n===5){await page.locator('.pin-surface').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');}
  else {const rect=await image.boundingBox();await image.click({position:{x:rect!.width*n/6,y:rect!.height*n/6}});}
  await expect(page.getByRole('textbox',{name:'Comment',exact:true})).toBeFocused();
  await page.getByRole('textbox',{name:'Comment',exact:true}).fill(`Feedback ${n}`);
  await page.getByRole('button',{name:'Save pin',exact:true}).click();
  await expect(page.getByRole('button',{name:`Pin ${n}, open`,exact:true})).toBeVisible();
 }
 await page.locator('.pin-list button').filter({hasText:'Feedback 1'}).click();
 await page.getByRole('button',{name:'Reply to Cameron',exact:true}).click();
 await page.getByRole('textbox',{name:'Reply to Cameron',exact:true}).fill('Updated in the next version.');
 await page.getByRole('button',{name:'Post reply',exact:true}).click();
 await expect(page.getByText('Updated in the next version.',{exact:true})).toBeVisible();
 for(const n of [1,2]){
  await page.locator('.pin-list button').filter({hasText:`Feedback ${n}`}).click();
  await page.getByRole('button',{name:'Resolve pin',exact:true}).click();
  await expect(page.getByRole('button',{name:'Reopen pin',exact:true})).toBeVisible();
 }
 await page.reload();await expect(page.locator('.pin-list>li')).toHaveCount(3);
 await page.getByLabel('Show',{exact:true}).selectOption('resolved');await expect(page.locator('.pin-list>li')).toHaveCount(2);
 await page.locator('.pin-list button').filter({hasText:'Feedback 1'}).click();
 await expect(page.getByText('Updated in the next version.',{exact:true})).toBeVisible();
 await page.getByLabel('Show',{exact:true}).selectOption('all');await expect(page.locator('.pin-surface button')).toHaveCount(5);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
