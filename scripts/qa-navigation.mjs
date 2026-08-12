import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { mkdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.woff':'font/woff'}
await mkdir(join(process.cwd(),'artifacts'),{recursive:true})
const server=createServer(async(request,response)=>{ try { const pathname=new URL(request.url,'http://local').pathname; if(pathname.startsWith('/api/quest/1700')) { response.writeHead(200,{'content-type':'application/json'}); response.end(await readFile(join(process.cwd(),'public/data/quest-1700.json'))); return } const requested=pathname==='/'?'index.html':pathname.slice(1); const path=join(process.cwd(),'dist',requested); const body=await readFile(path).catch(()=>readFile(join(process.cwd(),'dist/index.html'))); response.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream'}); response.end(body) } catch { response.writeHead(500).end() } })
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); const port=server.address().port
const browser=await chromium.launch({headless:true}); const page=await browser.newPage({viewport:{width:1024,height:800}})
await page.addInitScript(()=>localStorage.setItem('teyvat:settings:v5',JSON.stringify({guideReader:false,guideCatalog:false,guideScenes:false})))
await page.goto(`http://127.0.0.1:${port}/?chapter=1700`,{waitUntil:'networkidle'})

const tabs=page.locator('.quest-tabs [role="tab"],.quest-tabs > button')
await tabs.last().click(); await page.waitForTimeout(450)
const afterSelect=await page.locator('.quest-tabs').evaluate((rail)=>{ const active=rail.querySelector('.active').getBoundingClientRect(); const box=rail.getBoundingClientRect(); return {scrollLeft:rail.scrollLeft,activeVisible:active.left>=box.left-1&&active.right<=box.right+1} })
await page.locator('.quest-tabs').evaluate((rail)=>{ rail.scrollLeft=0; rail.dispatchEvent(new WheelEvent('wheel',{deltaY:260,bubbles:true,cancelable:true})) }); await page.waitForTimeout(80)
const afterWheel=await page.locator('.quest-tabs').evaluate((rail)=>rail.scrollLeft)
await page.evaluate(()=>scrollTo(0,900)); await page.waitForTimeout(100)
const sticky=await page.locator('.chapter-nav-shell').evaluate((node)=>({top:node.getBoundingClientRect().top,height:node.getBoundingClientRect().height}))
await page.screenshot({path:'artifacts/navigation-desktop.jpg',type:'jpeg',quality:80,fullPage:false})

await page.locator('.act-queue-action').click(); await page.locator('.basket-dock button').click()
const items=page.locator('.basket-items article'); const firstBefore=await items.first().locator('strong').textContent(); const thirdBefore=await items.nth(2).locator('strong').textContent()
const transfer=await page.evaluateHandle(()=>new DataTransfer())
await items.first().dispatchEvent('dragstart',{dataTransfer:transfer}); await items.nth(2).dispatchEvent('dragenter',{dataTransfer:transfer}); await page.waitForTimeout(40)
const liveOrder=await page.locator('.basket-items article strong').allTextContents(); const activeAnimations=await page.locator('.basket-items').evaluate((node)=>node.getAnimations({subtree:true}).length)
await items.nth(2).dispatchEvent('dragend',{dataTransfer:transfer})
await page.screenshot({path:'artifacts/basket-live-sort.jpg',type:'jpeg',quality:80,fullPage:false})

await page.getByRole('button',{name:'继续选稿'}).click(); await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(120); await page.screenshot({path:'artifacts/navigation-mobile.jpg',type:'jpeg',quality:80,fullPage:false})
const mobile=await page.evaluate(()=>({noOverflow:document.scrollingElement.scrollWidth<=document.scrollingElement.clientWidth,nav:document.querySelector('.chapter-nav-shell').getBoundingClientRect().toJSON(),actTitle:document.querySelector('.act-identity strong')?.textContent,queueVisible:Boolean(document.querySelector('.act-queue-action'))}))
console.log(JSON.stringify({afterSelect,afterWheel,sticky,drag:{firstBefore,thirdBefore,liveOrder,activeAnimations,reorderedBeforeDrop:liveOrder[2]===firstBefore},mobile}))
await browser.close(); server.close()
