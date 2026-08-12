import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { mkdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.woff':'font/woff'}
await mkdir(join(process.cwd(),'artifacts'),{recursive:true})
const server=createServer(async(request,response)=>{ try { const pathname=new URL(request.url,'http://local').pathname; if(pathname==='/api/catalog'){ response.writeHead(503).end();return } const requested=pathname==='/'?'index.html':pathname.slice(1);const path=join(process.cwd(),'dist',requested);const body=await readFile(path).catch(()=>readFile(join(process.cwd(),'dist/index.html')));response.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream'});response.end(body) } catch { response.writeHead(500).end() } })
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:950}})
await page.addInitScript(()=>{localStorage.setItem('teyvat:settings:v5',JSON.stringify({guideReader:false,guideCatalog:false,guideScenes:false}));sessionStorage.clear()})
await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'})
const card=page.locator('.catalog-card').filter({hasText:'#1700'}).first();await card.scrollIntoViewIfNeeded();const cardText=await card.innerText()
await page.screenshot({path:'artifacts/catalog-desktop.jpg',type:'jpeg',quality:82,fullPage:false})
const typeFilter=page.locator('.multi-filter').first();await typeFilter.locator('summary').click();await typeFilter.getByText('魔神任务',{exact:true}).click();await typeFilter.getByText('传说任务',{exact:true}).click();const multiCount=await typeFilter.locator('summary strong').innerText();await typeFilter.locator('summary').click()
await page.getByRole('button',{name:/旅行历程/}).click();await page.waitForTimeout(180);const timelineStats={nodes:await page.locator('.timeline-node').count(),milestones:await page.locator('.timeline-node.milestone').count(),hangout:await page.locator('.journey-timeline aside').innerText()};await page.screenshot({path:'artifacts/timeline-desktop.jpg',type:'jpeg',quality:82,fullPage:false})
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(120);await page.screenshot({path:'artifacts/timeline-mobile.jpg',type:'jpeg',quality:82,fullPage:false});const mobile=await page.evaluate(()=>({pageOverflow:document.scrollingElement.scrollWidth>document.scrollingElement.clientWidth,timelineScrollable:document.querySelector('.timeline-scroll').scrollWidth>document.querySelector('.timeline-scroll').clientWidth}))
console.log(JSON.stringify({cardText,multiCount,timelineStats,mobile}))
await browser.close();server.close()
