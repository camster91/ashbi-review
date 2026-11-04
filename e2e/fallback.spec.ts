import {execFileSync} from 'node:child_process';
import {test,expect,localHeaders} from './local';
test('saved screenshot fallback reuses persistent image pins on a phone',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const p=await page.request.post('/api/projects',{headers:localHeaders,data:{client_name:'Fallback QA',name:'Screenshot mode'}});const project=(await p.json()).project.id;
 const image=await page.request.post(`/api/projects/${project}/reviews`,{headers:{...localHeaders,'content-type':'image/png','x-file-name':'Capture.png'},data:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6RsAAAAASUVORK5CYII=','base64')});const imageId=(await image.json()).review.id;
 const site=await page.request.post(`/api/projects/${project}/sites`,{headers:localHeaders,data:{name:'Saved homepage',source_url:'https://client.example.com/'}});const id=(await site.json()).review.id;
 // Seed a saved capture from an uploaded local fixture. No remote data or rendering is used.
 expect(id).toMatch(/^[a-f0-9-]{36}$/);expect(imageId).toMatch(/^[a-f0-9-]{36}$/);
 execFileSync('npx',['wrangler','d1','execute','DB','--local','--persist-to','.wrangler/e2e','--command',`UPDATE reviews SET screenshot_mode=1,screenshot_key=(SELECT r2_key FROM reviews WHERE id='${imageId}'),screenshot_width=390,screenshot_path='/',captured_at=unixepoch() WHERE id='${id}'`],{stdio:'pipe'});
 await page.goto('/?review='+id);await expect(page.getByText('Saved page capture',{exact:false})).toBeVisible();const capture=page.getByRole('img',{name:'Saved homepage',exact:true});await expect(capture).toBeVisible();await capture.click();await page.getByRole('textbox',{name:'Comment',exact:true}).fill('Feedback on the saved capture');await page.getByRole('button',{name:'Save pin',exact:true}).click();await expect(page.getByRole('button',{name:'Pin 1, open',exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('button',{name:'Pin 1, open',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
