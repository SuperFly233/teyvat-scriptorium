import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir,readFile,writeFile } from 'node:fs/promises'
import { extname,join } from 'node:path'
await mkdir('artifacts',{recursive:true})
const data=JSON.parse(await readFile('public/data/quest-1700.json','utf8'))
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml'}
const server=createServer(async(request,response)=>{try{const pathname=new URL(request.url,'http://local').pathname;if(pathname.startsWith('/api/quest/1700')){response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify(data));return}if(pathname.startsWith('/api/')){response.writeHead(503).end();return}const path=join(process.cwd(),'dist',pathname==='/'?'index.html':pathname.slice(1));response.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream'});response.end(await readFile(path))}catch{response.writeHead(404).end()}})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const browser=await chromium.launch({headless:true})


const results=[]
async function audit(page,label) {
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))})
 await page.waitForTimeout(150)
 const entries=await page.evaluate(()=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true})
  const rgba=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((x,i)=>i===3?x/255:x)}
  const over=(f,b)=>[0,1,2].map(i=>f[i]*f[3]+b[i]*(1-f[3])).concat(1)
  const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)
  const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
  return [...document.querySelectorAll('button,button span,button strong,button small,button b,select,summary,summary span,summary small,summary b,label:has(input) > span,[role="button"],.checkmark,.copy-notice,.reading-notice,.reading-storage-warning')].flatMap(el=>{
   if(!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return[];const r=el.getBoundingClientRect();if(r.width<2||r.height<2||r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth)return[]
   const cx=Math.max(0,Math.min(innerWidth-1,r.x+r.width/2)),cy=Math.max(0,Math.min(innerHeight-1,r.y+r.height/2));const hit=document.elementFromPoint(cx,cy);if(hit&&!el.contains(hit)&&el.closest('button,summary,label,[role=button]')!==hit)return[]
   const text=el.textContent.trim();if(!text&&!el.querySelector('svg'))return[]
   const chain=[];for(let e=el;e;e=e.parentElement)chain.push(e);let bg=[255,255,255,1];for(const e of chain.slice().reverse())bg=over(rgba(getComputedStyle(e).backgroundColor),bg)
   const style=getComputedStyle(el);let fg=rgba(style.color);let opacity=1;for(const e of chain)opacity*=Number(getComputedStyle(e).opacity);fg[3]*=opacity;fg=over(fg,bg)
   const disabled=Boolean(el.closest(':disabled,[aria-disabled="true"]'));const icon=!text;return[{text:(text||el.getAttribute('aria-label')||'icon').slice(0,65),tag:el.tagName,cls:el.className,disabled,ratio:Number(ratio(fg,bg).toFixed(2)),threshold:icon?3:4.5,fg:style.color,bg:bg.slice(0,3),x:cx,y:cy,opacity}]
  })
 })
 // Sample rendered backgrounds with foregrounds hidden, so gradients, overlays and
 // transparent ancestors are measured from actual pixels rather than guessed colors.
 const mask=await page.addStyleTag({content:'button,button *,select,summary,summary *,[role="button"],[role="button"] *,.checkmark,.copy-notice,.reading-notice,.reading-storage-warning {-webkit-text-fill-color:transparent!important;text-shadow:none!important} button svg,summary svg,[role="button"] svg,.checkmark svg {visibility:hidden!important}'})
 let pixels;try{pixels=(await page.screenshot()).toString('base64')}finally{await mask.evaluate(el=>el.remove())}
 const measured=await page.evaluate(async({entries,pixels})=>{
  const img=new Image();img.src='data:image/png;base64,'+pixels;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0)
  const sample=document.createElement('canvas').getContext('2d',{willReadFrequently:true});const lum=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)
  return entries.map(e=>{const bg=[...ctx.getImageData(Math.floor(e.x),Math.floor(e.y),1,1).data].slice(0,3);sample.clearRect(0,0,1,1);sample.fillStyle=e.fg;sample.fillRect(0,0,1,1);const color=[...sample.getImageData(0,0,1,1).data];const alpha=color[3]/255*e.opacity;const fg=color.slice(0,3).map((v,i)=>v*alpha+bg[i]*(1-alpha));const a=lum(fg),b=lum(bg);return {...e,bg,ratio:Number(((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2))}})
 },{entries,pixels})
 assert.ok(await page.evaluate(()=>document.scrollingElement.scrollWidth<=document.scrollingElement.clientWidth),`page overflow in ${label}`)
 assert.ok(measured.length,`no visible controls audited in ${label}`)
 const failures=measured.filter(e=>!e.disabled&&e.ratio<e.threshold);results.push({label,count:measured.length,failures,disabled:measured.filter(e=>e.disabled)})
 console.log(`${label}: ${measured.length} checks, ${failures.length} failures`)
}
try {
 for(const theme of ['light','dark']) {
  const context=await browser.newContext({viewport:{width:1440,height:900},permissions:['clipboard-read','clipboard-write']});const page=await context.newPage()
  await page.addInitScript(theme=>{localStorage.setItem('teyvat:settings:v5',JSON.stringify({theme,languages:['CHS','EN'],guideReader:false,guideScenes:false,guideCatalog:false}));localStorage.setItem('teyvat:reader-guide:v1','done')},theme)
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'networkidle'});await audit(page,`${theme}-catalog`)
  for(const name of ['类型','国家','版本','排序']){const btn=page.locator('.filter-trigger').filter({hasText:name}).first();assert.ok(await btn.count(),`missing ${name} filter`);await btn.click();await audit(page,`${theme}-filter-${name}`);await page.locator('.catalog-search').click()}
  const journey=page.getByRole('button',{name:'旅行历程',exact:true});if(await journey.count()){await journey.click();await audit(page,`${theme}-journey`)}
  await page.goto(`http://127.0.0.1:${server.address().port}/?chapter=1700`,{waitUntil:'networkidle'});await page.locator('.dialogue-row').first().waitFor();await audit(page,`${theme}-reader`)
  await page.locator('.selection-toggle').click();await audit(page,`${theme}-selection-empty-disabled`);await page.screenshot({path:`artifacts/theme-${theme}-selection-disabled.png`});await page.locator('.dialogue-row').first().locator('.line-select').click();await page.locator('.selection-bar').scrollIntoViewIfNeeded();await audit(page,`${theme}-selection`);await page.screenshot({path:`artifacts/theme-${theme}-selection-desktop.png`})
  await page.getByRole('button',{name:'复制这些文本',exact:true}).hover();await audit(page,`${theme}-selection-hover`);await page.getByRole('button',{name:'复制这些文本',exact:true}).focus();await audit(page,`${theme}-selection-focus`);await page.evaluate(()=>{const write=navigator.clipboard.write.bind(navigator.clipboard);navigator.clipboard.write=items=>{const pending=write(items);return pending.then(()=>new Promise(resolve=>setTimeout(resolve,1500)))}});await page.getByRole('button',{name:'复制这些文本',exact:true}).click();assert.ok(await page.getByRole('button',{name:'复制这些文本',exact:true}).isDisabled());await audit(page,`${theme}-copy-pending`);await page.waitForFunction(()=>!document.querySelector('button[aria-busy="true"]'));await audit(page,`${theme}-copy-notice`)
  await page.getByRole('button',{name:'复制这些文本的格式选项',exact:true}).click();let dialog=page.getByRole('dialog',{name:'复制选项'});await dialog.getByRole('button',{name:'Word 分语言稿',exact:true}).click();await audit(page,`${theme}-copy-dialog`)
  await dialog.getByText('日期与来源',{exact:true}).click();await dialog.getByLabel('来源格式',{exact:true}).scrollIntoViewIfNeeded();await audit(page,`${theme}-copy-dialog-scrolled`);await page.screenshot({path:`artifacts/theme-${theme}-copy-desktop.png`})
  await page.setViewportSize({width:390,height:844});await audit(page,`${theme}-copy-mobile`);await page.screenshot({path:`artifacts/theme-${theme}-copy-mobile.png`});await dialog.getByRole('button',{name:'关闭复制面板'}).click();await audit(page,`${theme}-selection-mobile`);await page.screenshot({path:`artifacts/theme-${theme}-selection-mobile.png`});await page.setViewportSize({width:1440,height:900})
  await page.locator('.queue-inline').click();await page.locator('.basket-dock .basket-print').click();await audit(page,`${theme}-print`);await page.screenshot({path:`artifacts/theme-${theme}-print-desktop.png`})
  await page.keyboard.press('Escape');await page.goto(`http://127.0.0.1:${server.address().port}/?chapter=1700`,{waitUntil:'networkidle'});await page.locator('.dialogue-row').first().waitFor()
  await page.locator('.dialogue-row').first().getByRole('button',{name:'收藏台词',exact:true}).click();await audit(page,`${theme}-reading-notice`);await page.locator('.reader-study-tools').getByRole('button',{name:/阅读资料/}).click();await audit(page,`${theme}-reading-library`);await page.keyboard.press('Escape');await page.locator('.dialogue-row').first().getByRole('button',{name:'编辑台词笔记',exact:true}).click();await audit(page,`${theme}-notes`);await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'设置',exact:true}).click();await audit(page,`${theme}-settings`);await page.screenshot({path:`artifacts/theme-${theme}-settings-desktop.png`});await page.setViewportSize({width:390,height:844});await audit(page,`${theme}-settings-mobile`);await page.getByRole('region',{name:'复制格式设置',exact:true}).scrollIntoViewIfNeeded();await audit(page,`${theme}-settings-scrolled`)
  await context.close()
 }
 const autoContext=await browser.newContext({viewport:{width:1440,height:900},colorScheme:'dark'});const autoPage=await autoContext.newPage();await autoPage.addInitScript(()=>localStorage.setItem('teyvat:settings:v5',JSON.stringify({theme:'auto',guideCatalog:false})));await autoPage.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'networkidle'});assert.equal(await autoPage.locator('html').getAttribute('data-theme'),'dark');await audit(autoPage,'auto-system-dark');await autoPage.emulateMedia({colorScheme:'light'});await autoPage.waitForFunction(()=>document.documentElement.dataset.theme==='light');assert.equal(await autoPage.locator('html').getAttribute('data-theme'),'light');await audit(autoPage,'auto-system-light');await autoContext.close()
 await writeFile('artifacts/theme-contrast-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify({states:results.length,checks:results.reduce((n,r)=>n+r.count,0),failures:results.filter(r=>r.failures.length).map(r=>({label:r.label,failures:r.failures}))},null,2))
 if(!process.argv.includes('--report-only'))assert.equal(results.flatMap(r=>r.failures).length,0,'interactive contrast failures; see artifacts/theme-contrast-results.json')
} finally {await browser.close();server.close()}
