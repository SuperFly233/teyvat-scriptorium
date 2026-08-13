import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { mkdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.woff':'font/woff'}
await mkdir(join(process.cwd(),'artifacts'),{recursive:true})
const server=createServer(async(request,response)=>{ try { const pathname=new URL(request.url,'http://local').pathname; if(pathname.startsWith('/api/quest/1700')) { response.writeHead(200,{'content-type':'application/json'}); response.end(await readFile(join(process.cwd(),'public/data/quest-1700.json'))); return } const requested=pathname==='/'?'index.html':pathname.slice(1); const path=join(process.cwd(),'dist',requested); const body=await readFile(path).catch(()=>readFile(join(process.cwd(),'dist/index.html'))); response.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream'}); response.end(body) } catch { response.writeHead(500).end() } })
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); const port=server.address().port
const browser=await chromium.launch({headless:true}); const page=await browser.newPage({viewport:{width:1440,height:900}})
await page.addInitScript(()=>{ localStorage.setItem('teyvat:reader-guide:v1','done'); localStorage.setItem('teyvat:catalog-guide:v1','done'); localStorage.setItem('teyvat:settings:v5',JSON.stringify({languages:['CHS','EN','JP'],languageWidths:[33.33,33.34,33.33],guideReader:false,guideCatalog:false,guideScenes:true})) })
await page.goto(`http://127.0.0.1:${port}/?chapter=1700`,{waitUntil:'networkidle'})
await page.locator('.choice-group').first().scrollIntoViewIfNeeded()
const before=await page.locator('.choice-group').first().getAttribute('class')
await page.locator('.selection-toggle').click()
const row=page.locator('.choice-group .dialogue-row').first(); await row.locator('.dialogue-main').click(); const selected=await row.getAttribute('class')
const handles=await page.locator('.reader-column-divider').count(); const beforeColumns=await page.locator('.utterances').first().evaluate(element=>getComputedStyle(element).gridTemplateColumns)
const divider=page.locator('.reader-column-divider').nth(1);const box=await divider.locator('svg').boundingBox();const hit=box?await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('.reader-column-divider')?.className||document.elementFromPoint(x,y)?.className||'',{x:box.x+box.width/2,y:box.y+box.height/2}):'no-box';if(box){const x=box.x+box.width/2,y=box.y+box.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+65,y,{steps:12});await page.mouse.up()}await page.waitForTimeout(100)
const columns=await page.locator('.utterances').first().evaluate(element=>getComputedStyle(element).gridTemplateColumns);const savedWidths=await page.evaluate(()=>JSON.parse(localStorage.getItem('teyvat:settings:v5')||'{}').languageWidths)
await page.screenshot({path:'artifacts/dialogue-desktop.jpg',type:'jpeg',quality:78,fullPage:false})
const optionLabels=await page.locator('.choice-group').first().locator('.line-select small').allTextContents()
await page.setViewportSize({width:390,height:844}); await page.locator('.choice-group').first().scrollIntoViewIfNeeded(); await page.waitForTimeout(200); await page.screenshot({path:'artifacts/dialogue-mobile.jpg',type:'jpeg',quality:78,fullPage:false})
console.log(JSON.stringify({choiceGroups:await page.locator('.choice-group').count(),before,selectedByBody:selected?.includes('selected'),optionLabels,languageHandles:handles,dividerBox:box,dividerHit:hit,beforeColumns,computedColumns:columns,savedWidths,secondDividerChanged:beforeColumns!==columns,noHorizontalOverflow:await page.evaluate(()=>document.scrollingElement.scrollWidth<=document.scrollingElement.clientWidth)}))
await browser.close(); server.close()
