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

try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.addInitScript(()=>localStorage.setItem('teyvat:settings:v5',JSON.stringify({languages:['CHS','EN'],guideReader:false,guideScenes:false,guideCatalog:false})))
 await page.goto(`http://127.0.0.1:${server.address().port}/?chapter=1700`,{waitUntil:'networkidle'});await page.locator('.dialogue-row').first().waitFor()
 const open=async()=>{await page.locator('.dialogue-row').first().getByRole('button',{name:'复制这句台词的格式选项',exact:true}).click();return page.getByRole('dialog',{name:'复制选项'})}
 let dialog=await open();await dialog.getByRole('button',{name:'Word 分语言稿',exact:true}).click();await dialog.getByText('日期与来源',{exact:true}).click()
 assert.ok(await dialog.getByLabel('添加日期',{exact:true}).isChecked());assert.ok(await dialog.getByLabel('添加来源',{exact:true}).isChecked())
 await dialog.getByLabel('日期',{exact:true}).selectOption('custom');await dialog.getByLabel('指定日期',{exact:true}).fill('2026-10-26')
 const expected='《原神》7.0至冬 魔神任务 第七章 第一幕 「无神怜爱的雪国」—「逆风向苦寒之北」'
 const preview=await dialog.getByLabel('复制预览').inputValue();assert.ok(preview.startsWith(`2026.10.26\n${expected}\n`),preview);assert.equal(preview.split('2026.10.26').length,2)
 await dialog.getByRole('button',{name:'复制预览内容'}).click();await page.waitForFunction(()=>!document.querySelector('button[aria-busy="true"]'))
 const clipboard=await page.evaluate(async()=>{const items=await navigator.clipboard.read();const item=items.find(i=>i.types.includes('text/html'));return{text:await(await item.getType('text/plain')).text(),html:await(await item.getType('text/html')).text()}})
 assert.equal(clipboard.text.replace(/\r\n/g,'\n'),preview);assert.ok(clipboard.html.includes('<strong style="font-weight:700">2026.10.26</strong>'))
 await dialog.getByRole('button',{name:'关闭复制面板'}).click()
 await page.evaluate(()=>{const editor=document.createElement('div');editor.id='header-paste';editor.contentEditable='true';editor.style.cssText='position:fixed;inset:20px;z-index:30000;background:white;color:black;padding:20px;overflow:auto;font:18px/1.6 sans-serif';document.body.append(editor);editor.focus()});await page.locator('#header-paste').click();await page.keyboard.press('Control+V');await page.waitForTimeout(200)
 const pasted=await page.locator('#header-paste').evaluate(editor=>[...editor.querySelectorAll('strong,span')].filter(node=>Number.parseInt(getComputedStyle(node).fontWeight)>=600).map(node=>node.textContent));assert.equal(pasted[0],'2026.10.26');assert.equal(pasted[1],expected);await page.screenshot({path:'artifacts/copy-headers-pasted.png'});await page.locator('#header-paste').evaluate(editor=>editor.remove())
 dialog=await open();await dialog.getByText('日期与来源',{exact:true}).click()
 await page.screenshot({path:'artifacts/copy-headers-desktop.png'})
 await page.setViewportSize({width:390,height:844});await dialog.getByLabel('来源格式',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/copy-headers-mobile.png'});assert.ok(await page.evaluate(()=>document.scrollingElement.scrollWidth<=document.scrollingElement.clientWidth));const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=391)
 await dialog.getByLabel('来源格式',{exact:true}).selectOption('short');assert.ok((await dialog.getByLabel('复制预览').inputValue()).includes('第一幕 「无神怜爱的雪国」'))
 await dialog.getByRole('button',{name:'编辑来源',exact:true}).click();assert.equal(await dialog.getByLabel('来源格式',{exact:true}).inputValue(),'custom');await dialog.getByLabel('自定义来源',{exact:true}).fill('《原神》摘录 <自定义>');await dialog.getByLabel('题头与正文分隔',{exact:true}).selectOption('\n\n');assert.ok((await dialog.getByLabel('复制预览').inputValue()).startsWith('2026.10.26\n《原神》摘录 <自定义>\n\n'))
 await dialog.getByRole('button',{name:'关闭复制面板'}).click();await page.reload({waitUntil:'networkidle'});dialog=await open();assert.ok((await dialog.getByLabel('复制预览').inputValue()).includes('《原神》摘录 <自定义>'))
 await dialog.getByText('日期与来源',{exact:true}).click();await dialog.getByLabel('来源格式',{exact:true}).selectOption('full');await dialog.getByRole('button',{name:'关闭复制面板'}).click();await page.setViewportSize({width:1440,height:1000})
 await page.getByRole('button',{name:'沉寂之地的枪声',exact:false}).first().click();dialog=await open();const changed=await dialog.getByLabel('复制预览').inputValue();assert.ok(changed.includes('—「沉寂之地的枪声」'));assert.ok(!changed.includes('—「逆风向苦寒之北」'));await dialog.getByRole('button',{name:'关闭复制面板'}).click()
 await page.getByRole('button',{name:'复制任务标题',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('button[aria-busy="true"]'));const title=await page.evaluate(()=>navigator.clipboard.readText());assert.ok(!title.includes('2026.10.26'));assert.ok(!title.includes('《原神》'))
 assert.deepEqual(errors,[]);const result={date:'2026.10.26',source:expected,richHeaders:true,pastedHeadersBold:true,customSource:true,shortSource:true,persistence:true,questSwitch:true,titleCopyExcludesHeader:true,mobileOverflow:false,pageErrors:errors};await writeFile('artifacts/copy-headers-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result))
} finally {await browser.close();server.close()}
