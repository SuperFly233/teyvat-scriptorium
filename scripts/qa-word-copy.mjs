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
try{
  const context=await browser.newContext({viewport:{width:1440,height:900},permissions:['clipboard-read','clipboard-write']});const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.addInitScript(()=>localStorage.setItem('teyvat:settings:v5',JSON.stringify({languages:['CHS','EN'],guideReader:false,guideScenes:false,guideCatalog:false})))
  await page.goto(`http://127.0.0.1:${server.address().port}/?chapter=1700`,{waitUntil:'networkidle'});await page.locator('.dialogue-row').first().waitFor()
  let pair
  for(const scene of data.quests[0].scenes){for(let index=1;index<scene.lines.length;index++){const a=scene.lines[index-1],b=scene.lines[index];if(a.kind!=='dialogue'||b.kind!=='dialogue'||!a.speaker.zh||a.speaker.zh!==b.speaker.zh)continue;const left=page.locator(`[data-line-key="${a.key}"]`),right=page.locator(`[data-line-key="${b.key}"]`);if(await left.count()&&await right.count()&&!await left.evaluate(row=>Boolean(row.closest('.choice-group')))&&!await right.evaluate(row=>Boolean(row.closest('.choice-group')))){pair=[left,right];break}}if(pair)break}
  assert.ok(pair,'fixture must contain adjacent same-speaker lines outside branches')
  const names={},texts={}
  for(const lang of ['CHS','EN']){names[lang]=await pair[0].locator(`[data-language=${lang}] strong`).innerText();texts[lang]=await Promise.all(pair.map(row=>row.locator(`[data-language=${lang}] p`).innerText()))}
  await page.locator('.selection-toggle').click();await pair[0].locator('.line-select').click();await pair[1].locator('.line-select').click();await page.getByRole('button',{name:'复制这些文本的格式选项',exact:true}).click()
  let dialog=page.getByRole('dialog',{name:'复制选项'});await dialog.getByRole('button',{name:'Word 分语言稿',exact:true}).click()
  const expected=`${names.CHS}：\n${texts.CHS.join('\n')}\n——\n${names.EN}:\n${texts.EN.join('\n')}`
  assert.equal(await dialog.getByLabel('复制预览').inputValue(),expected)
  assert.equal(await dialog.getByRole('region',{name:'富文本预览'}).locator('strong').count(),2)
  await dialog.getByRole('button',{name:'复制预览内容'}).click()
  await page.waitForFunction(()=>!document.querySelector('button[aria-busy="true"]'))
  const clipboard=await page.evaluate(async()=>{const items=await navigator.clipboard.read();const item=items.find(item=>item.types.includes('text/html'));return{types:item.types,text:await(await item.getType('text/plain')).text(),html:await(await item.getType('text/html')).text()}})
  assert.equal(clipboard.text.replace(/\r\n/g,'\n'),expected);assert.match(clipboard.html,/<strong/)
  await page.screenshot({path:'artifacts/word-copy-desktop.png'})
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);assert.ok(await page.evaluate(()=>document.scrollingElement.scrollWidth<=document.scrollingElement.clientWidth));await dialog.getByRole('region',{name:'富文本预览'}).scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/word-copy-mobile.png'})
  await dialog.getByRole('button',{name:'关闭复制面板'}).click()
  // Paste the actual clipboard into a rich-text receiver; this exercises browser MIME negotiation.
  await page.evaluate(()=>{const editor=document.createElement('div');editor.id='paste-receiver';editor.contentEditable='true';editor.setAttribute('aria-label','富文本粘贴验收');editor.style.cssText='position:fixed;inset:20px;z-index:30000;background:white;color:black;padding:20px;overflow:auto;font:18px/1.6 sans-serif';document.body.append(editor);editor.focus()})
  await page.locator('#paste-receiver').click();await page.keyboard.press('Control+V');await page.waitForTimeout(400)
  const paste=await page.locator('#paste-receiver').evaluate(editor=>{const names=[...editor.querySelectorAll('strong,span')].filter(node=>Number.parseInt(getComputedStyle(node).fontWeight)>=600);return{names:names.map(node=>node.textContent),paragraphs:editor.querySelectorAll('p').length,text:editor.innerText,bold:names.length===2}})
  assert.deepEqual(paste.names,[`${names.CHS}：`,`${names.EN}:`]);assert.ok(paste.bold);assert.ok(paste.paragraphs>=7)
  await page.screenshot({path:'artifacts/word-copy-pasted.png'});await page.locator('#paste-receiver').evaluate(editor=>editor.remove())
  await page.reload({waitUntil:'networkidle'});await page.locator('.dialogue-row').first().waitFor();await page.locator('.dialogue-row').first().getByRole('button',{name:'复制这句台词的格式选项',exact:true}).click();dialog=page.getByRole('dialog',{name:'复制选项'});assert.equal(await dialog.getByLabel('名字位置').inputValue(),'heading');assert.ok(await dialog.getByLabel('名字加粗').isChecked())
  await dialog.getByLabel('名字后加冒号').uncheck();assert.ok(!(await dialog.getByLabel('复制预览').inputValue()).startsWith('派蒙：'))
  await dialog.getByText('多段复制',{exact:true}).click();assert.equal(await dialog.getByLabel('连续署名').inputValue(),'changes');assert.equal(await dialog.getByLabel('段落分隔').inputValue(),'\n')
  await dialog.getByText('更多排版选项',{exact:true}).click();await dialog.getByLabel('复制格式',{exact:true}).selectOption('plain');await dialog.getByRole('button',{name:'复制预览内容'}).click();await page.waitForFunction(()=>!document.querySelector('button[aria-busy="true"]'));assert.equal((await page.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n'),await dialog.getByLabel('复制预览').inputValue())
  assert.deepEqual(errors,[]);const result={richClipboardTypes:clipboard.types,plainMatchesReference:true,oneHeadingPerSpeaker:true,pastedBold:paste.bold,pastedParagraphs:paste.paragraphs,presetPersists:true,plainMode:true,mobileOverflow:false,pageErrors:errors};await writeFile('artifacts/word-copy-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}finally{await browser.close();server.close()}
