import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

await mkdir('artifacts', { recursive: true })
const data = JSON.parse(await readFile('public/data/quest-1700.json', 'utf8'))
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://local').pathname
  try {
    if (path.startsWith('/api/quest/1700')) { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(data)); return }
    if (path.startsWith('/api/')) { response.writeHead(503).end(); return }
    const file = join(process.cwd(), 'dist', path === '/' ? 'index.html' : path.slice(1))
    response.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }); response.end(await readFile(file))
  } catch { response.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
const page = await context.newPage()
const errors = []; page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(() => { localStorage.setItem('teyvat:reader-guide:v1', 'done'); localStorage.setItem('teyvat:catalog-guide:v1', 'done'); localStorage.setItem('teyvat:settings:v5', JSON.stringify({ languages: ['CHS', 'EN'], guideScenes: false, guideReader: false, guideCatalog: false })) })
const loaded = async () => { await page.locator('.line-reading-actions').first().waitFor(); await page.locator('.loading-overlay').waitFor({ state: 'hidden' }) }
const row = () => page.locator('.dialogue-row').first()
const library = async () => JSON.parse(await page.evaluate(() => localStorage.getItem('teyvat:reading-library:v1')))
const measure = async () => page.evaluate(() => ({ overflow: document.scrollingElement.scrollWidth > document.scrollingElement.clientWidth,
  tools: document.querySelector('.reader-study-tools')?.getBoundingClientRect().toJSON(), toolbarTop: document.querySelector('.reader-toolbar')?.getBoundingClientRect().top,
  visibleRows: document.querySelectorAll('.dialogue-row').length }))
try {
  await page.goto(`${base}/?chapter=1700`, { waitUntil: 'networkidle' }); await loaded()
  await page.evaluate(() => scrollTo(0, 0))
  const initialDesktop = await measure(); assert.equal(initialDesktop.overflow, false)
  await page.screenshot({ path: 'artifacts/reading-tools-top-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => scrollTo(0, 0))
  await page.waitForTimeout(500)
  const initialMobile = await measure(); assert.equal(initialMobile.overflow, false)
  await page.screenshot({ path: 'artifacts/reading-tools-top-mobile.png' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await row().getByRole('button', { name: '收藏台词', exact: true }).click()
  assert.equal((await library()).entries.length, 1)
  await row().getByRole('button', { name: '编辑台词笔记' }).click()
  await page.getByRole('textbox', { name: '我的笔记' }).fill('学习笔记：对照 Paimon 的译法。')
  await page.getByRole('button', { name: '保存笔记' }).click()
  assert.match((await library()).entries[0].note, /Paimon/)
  await page.reload({ waitUntil: 'networkidle' }); await loaded()
  assert.equal(await row().getByRole('button', { name: '取消收藏台词' }).count(), 1)
  await page.getByLabel('遮译语言').selectOption('EN')
  const english = row().locator('[data-language=EN] p')
  assert.equal(await english.evaluate(element => getComputedStyle(element).visibility), 'hidden')
  await row().getByRole('button', { name: '揭晓译文' }).click()
  assert.equal(await english.evaluate(element => getComputedStyle(element).visibility), 'visible')
  await page.getByLabel('遮译语言').selectOption('CHS')
  assert.equal(await row().locator('[data-language=CHS] p').evaluate(element => getComputedStyle(element).visibility), 'hidden')
  await page.getByLabel('遮译语言').selectOption('')
  await row().getByRole('button', { name: '分享这句台词' }).click()
  const url = await page.evaluate(() => navigator.clipboard.readText())
  assert.match(url, /quest=.*&line=/)
  await page.goto(url, { waitUntil: 'networkidle' }); await loaded()
  await page.locator('.shared-line').waitFor()
  assert.equal(await page.locator('.shared-line').getAttribute('data-line-key'), new URL(url).searchParams.get('line'))
  await page.locator('.selection-toggle').click()
  await row().locator('.line-select').click()
  const before = await row().getAttribute('aria-checked')
  await row().getByRole('button', { name: '编辑台词笔记' }).focus()
  await page.keyboard.press('Enter')
  assert.equal(await row().getAttribute('aria-checked'), before)
  await page.getByRole('dialog', { name: '台词笔记' }).getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '导出台词', exact: true }).click()
  assert.equal(await page.getByLabel('导出范围').inputValue(), 'selected')
  let downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'TSV 表格' }).click(); let download = await downloadPromise
  const tsv = await readFile(await download.path(), 'utf8'); assert.equal(tsv.trim().split('\r\n').length, 2); assert.match(tsv, /EN 台词/)
  await page.getByLabel('导出范围').selectOption('visible')
  downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Markdown 文稿' }).click(); download = await downloadPromise
  assert.match(await readFile(await download.path(), 'utf8'), /\*\*EN/)
  await page.getByRole('dialog', { name: '导出台词' }).getByRole('button', { name: '关闭', exact: true }).click()
  // Language changes preserve picked lines and search, while stale responses are cancelled.
  await page.locator('.language-control > button').click()
  await page.getByRole('checkbox', { name: /日本語/ }).check()
  await page.locator('.loading-overlay').waitFor({ state: 'hidden' })
  assert.equal(await row().getAttribute('aria-checked'), before)
  await page.getByRole('checkbox', { name: /日本語/ }).uncheck()
  await page.locator('.loading-overlay').waitFor({ state: 'hidden' })
  await page.locator('.language-control > button').click()
  await page.locator('.selection-toggle').click()
  await page.locator('.reader-study-tools').getByRole('button', { name: /阅读资料/ }).click()
  await page.getByLabel('查找收藏与笔记').fill('Paimon')
  assert.equal(await page.locator('.reading-saved-list article').count(), 1)
  downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: '导出备份' }).click(); download = await downloadPromise
  const backup = await readFile(await download.path(), 'utf8')
  await page.locator('.reading-dialog input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) })
  assert.equal((await library()).entries.length, 1)
  await page.locator('.reading-dialog input[type=file]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"schema":9}') })
  await page.getByRole('status').filter({ hasText: '备份格式不正确' }).waitFor()
  assert.equal((await library()).entries.length, 1)
  await page.getByRole('dialog', { name: '阅读资料' }).getByRole('button', { name: '关闭', exact: true }).click()
  const secondQuest = data.quests[1]; const target = secondQuest.scenes.flatMap(scene => scene.lines)[3]
  await page.goto(`${base}/?chapter=1700&quest=${secondQuest.id}&line=${encodeURIComponent(target.key)}`, { waitUntil: 'networkidle' }); await loaded(); await page.locator('.shared-line').waitFor()
  assert.equal(await page.locator('.shared-line').getAttribute('data-line-key'), target.key)
  await page.evaluate(() => scrollBy(0, 800)); await page.waitForTimeout(600)
  assert.equal((await library()).recent[0].questId, secondQuest.id)
  const desktop = await measure(); assert.equal(desktop.overflow, false)
  await page.screenshot({ path: 'artifacts/reading-tools-desktop.png' })
  await page.getByRole('button', { name: '任务目录', exact: true }).click(); await page.locator('.reading-shelf a').waitFor()
  await page.locator('.reading-shelf a').click(); await loaded(); await page.locator('.shared-line').waitFor()
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(500)
  const mobile = await measure(); assert.equal(mobile.overflow, false)
  await page.screenshot({ path: 'artifacts/reading-tools-mobile.png' })
  await page.locator('.reader-study-tools').getByRole('button', { name: /阅读资料/ }).click()
  const dialogBox = await page.getByRole('dialog').boundingBox(); assert.ok(dialogBox.x >= 0 && dialogBox.x + dialogBox.width <= 390)
  await page.screenshot({ path: 'artifacts/reading-library-mobile.png' })
  await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 0)
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' }); await page.screenshot({ path: 'artifacts/reading-tools-dark.png' })
  assert.deepEqual(errors, [])
  // Storage access denial and corrupt chapter cache must still permit reading.
  const blocked = await context.newPage(); const blockedErrors = []; blocked.on('pageerror', error => blockedErrors.push(error.message))
  await blocked.addInitScript(() => { localStorage.setItem('teyvat:settings:v5', JSON.stringify({ guideReader: false, guideScenes: false })); Storage.prototype.getItem = () => { throw new DOMException('denied', 'SecurityError') }; Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError') } })
  await blocked.goto(`${base}/?chapter=1700`, { waitUntil: 'networkidle' })
  await blocked.locator('.dialogue-row').first().waitFor(); assert.deepEqual(blockedErrors, [])
  const racing = await context.newPage()
  await racing.goto(`${base}/?chapter=1700`, { waitUntil: 'networkidle' }); await racing.locator('.dialogue-row').first().waitFor()
  await racing.route('**/api/quest/1700*', async route => {
    if (!new URL(route.request().url()).searchParams.get('langs')?.includes('JP')) return route.continue()
    await new Promise(resolve => setTimeout(resolve, 900))
    const stale = structuredClone(data); stale.chapter.title.zh = '过期请求不应出现'
    await route.fulfill({ json: stale }).catch(() => {})
  })
  await racing.evaluate(() => sessionStorage.removeItem('chapter:v2:1700:CHS,EN,JP:auto'))
  await racing.locator('.language-control > button').click()
  await racing.getByRole('checkbox', { name: /日本語/ }).check()
  // Use the still-mounted checkbox while the loading overlay is active.
  await racing.getByRole('checkbox', { name: /日本語/ }).evaluate(element => element.click())
  await racing.locator('.loading-overlay').waitFor({ state: 'hidden' })
  await racing.waitForTimeout(1200)
  assert.equal(await racing.getByText('过期请求不应出现', { exact: true }).count(), 0)
  assert.equal(await racing.locator('.script').getAttribute('data-language-count'), '2')
  assert.equal(await racing.locator('.error-toast').count(), 0)
  const result = { initialDesktop, initialMobile, desktop, mobile, assertions: 'bookmarks, notes, reload, study/reveal/reset, precise share, keyboard selection, language selection preservation, selected TSV, Markdown, backup merge/rejection, second quest link, progress/resume, mobile dialog, dark, storage denial, stale request cancellation', pageErrors: errors }
  await writeFile('artifacts/reading-tools-results.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result))
} finally { await browser.close(); server.close() }
