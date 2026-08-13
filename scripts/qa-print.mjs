import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { mkdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.woff2':'font/woff2', '.woff':'font/woff' }
await mkdir(join(process.cwd(), 'artifacts'), { recursive:true })
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://local').pathname
    if (pathname.startsWith('/api/quest/1700')) {
      response.writeHead(200, { 'content-type':'application/json', 'cache-control':'no-store' })
      response.end(await readFile(join(process.cwd(), 'public/data/quest-1700.json')))
      return
    }
    const requested = pathname === '/' ? 'index.html' : pathname.slice(1)
    const path = join(process.cwd(), 'dist', requested)
    const body = await readFile(path).catch(() => readFile(join(process.cwd(), 'dist', 'index.html')))
    response.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream', 'cache-control':'no-store' })
    response.end(body)
  } catch { response.writeHead(500).end() }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1765, height: 1400 }, deviceScaleFactor: 1 })
await page.addInitScript(() => localStorage.setItem('teyvat:reader-guide:v1', 'done'))
await page.goto(`http://127.0.0.1:${port}/?chapter=1700`, { waitUntil: 'domcontentloaded' })
await page.locator('.selection-toggle').waitFor({ timeout: 30000 })
await page.locator('.selection-toggle').evaluate((element) => element.click())
await page.waitForTimeout(100)
if (!await page.locator('.selection-select-all').count()) {
  console.log(JSON.stringify({ debug: await page.locator('.selection-toggle').textContent(), bar: await page.locator('.selection-bar').count(), errors: await page.locator('.error-toast').allTextContents() }))
  await browser.close()
  server.close()
  process.exit(2)
}
await page.locator('.selection-select-all').click()
await page.locator('.queue-inline').click()
await page.locator('.basket-dock .basket-print').click()
await page.locator('.density-presets button').nth(1).click()
await page.waitForTimeout(300)

const printColumnsBefore = await page.locator('.preview-paper .print-line').first().evaluate((element) => getComputedStyle(element).gridTemplateColumns)
const printDividerBox = await page.locator('.preview-column-divider').first().boundingBox()
if (printDividerBox) {
  const x = printDividerBox.x + printDividerBox.width / 2
  const y = printDividerBox.y + printDividerBox.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 80, y, { steps: 12 })
  await page.mouse.up()
}
const printColumnsAfter = await page.locator('.preview-paper .print-line').first().evaluate((element) => getComputedStyle(element).gridTemplateColumns)

const desktop = await page.evaluate(() => {
  const modal = document.querySelector('.modal.wide')?.getBoundingClientRect()
  const footer = document.querySelector('.print-footer')?.getBoundingClientRect()
  const panel = document.querySelector('.print-options-panel')?.getBoundingClientRect()
  const preview = document.querySelector('.preview-paper')?.getBoundingClientRect()
  return {
    viewport: { width: innerWidth, height: innerHeight },
    modal, footer, panel, preview,
    footerVisible: Boolean(footer && footer.top >= 0 && footer.bottom <= innerHeight),
    noPageHorizontalOverflow: document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth,
    previewPages: document.querySelector('.preview-toolbar strong')?.textContent?.trim(),
    marginStatus: document.querySelector('.margin-safe,.margin-warning')?.textContent?.trim(),
    density: document.querySelector('.density-presets button.active')?.textContent?.trim(),
  }
})
await page.screenshot({ path: 'artifacts/print-studio-desktop.jpg', type:'jpeg', quality:72, fullPage: false })

await page.getByRole('button', { name: /保存矢量 PDF/ }).click()
await page.waitForFunction(() => !document.querySelector('.progress-overlay'))
await page.pdf({ path: 'artifacts/ultra-print.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true })

await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(200)
const mobile = await page.evaluate(() => {
  const modal = document.querySelector('.modal.wide')?.getBoundingClientRect()
  const footer = document.querySelector('.print-footer')?.getBoundingClientRect()
  return {
    viewport: { width: innerWidth, height: innerHeight }, modal, footer,
    footerVisible: Boolean(footer && footer.top >= 0 && footer.bottom <= innerHeight),
    noPageHorizontalOverflow: document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth,
  }
})
await page.screenshot({ path: 'artifacts/print-studio-mobile.jpg', type:'jpeg', quality:76, fullPage: false })
console.log(JSON.stringify({ desktop, mobile, printColumnsBefore, printColumnsAfter, printDividerChanged: printColumnsBefore !== printColumnsAfter }))
await browser.close()
server.close()
