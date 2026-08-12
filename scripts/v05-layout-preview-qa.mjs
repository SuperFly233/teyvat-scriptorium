import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseUrl = process.argv[2] || 'http://127.0.0.1:8796'
await mkdir('screenshots/v05', { recursive:true })
const browser = await chromium.launch({ headless:true })
const page = await browser.newPage({ viewport:{ width:1440,height:1000 } })
await page.addInitScript(() => localStorage.setItem('teyvat:reader-guide:v1','done'))
await page.route('**/api/quest/1700?langs=*', async (route) => {
  const url = new URL(route.request().url())
  const response = await fetch(`https://teyvat-scriptorium.pages.dev/api/quest/1700${url.search}`)
  await route.fulfill({ status:response.status,contentType:'application/json',body:await response.text() })
})
await page.goto(`${baseUrl}/?chapter=1700`, { waitUntil:'domcontentloaded',timeout:60000 })
await page.waitForSelector('.reader-page')

await page.locator('.view-pills button').nth(2).click()
const tableMetrics = await page.locator('.dialogue-row').nth(2).evaluate((row) => {
  const main = row.querySelector('.dialogue-main')
  const utterances = row.querySelector('.utterances')
  const cells = [...row.querySelectorAll('.utterance')]
  return { row:Math.round(row.getBoundingClientRect().width),main:Math.round(main.getBoundingClientRect().width),utterances:Math.round(utterances.getBoundingClientRect().width),cells:cells.map((cell) => Math.round(cell.getBoundingClientRect().width)) }
})
await page.screenshot({ path:'screenshots/v05/table-mode-fixed.png',fullPage:false })

await page.locator('.view-pills button').first().click()
const divider = page.locator('.reader-column-divider')
const before = await divider.evaluate((el) => Math.round(el.getBoundingClientRect().left))
const scriptBox = await page.locator('.script').boundingBox()
await divider.hover()
await page.mouse.down()
await page.mouse.move(scriptBox.x + scriptBox.width * .65,scriptBox.y + 200)
await page.mouse.up()
const after = await divider.evaluate((el) => Math.round(el.getBoundingClientRect().left))

await page.locator('.selection-toggle').click()
await page.locator('.selection-bar button').first().click()
await page.locator('.queue-inline').click()
await page.locator('.desktop-print-fab').click()
await page.locator('.print-group .segment').nth(1).locator('button').nth(2).click()
await page.waitForTimeout(500)
const preview = await page.evaluate(() => ({
  label:document.querySelector('.preview-label')?.textContent,
  pages:document.querySelector('.preview-toolbar strong')?.textContent,
  paper:{ width:Math.round(document.querySelector('.preview-paper')?.getBoundingClientRect().width || 0),height:Math.round(document.querySelector('.preview-paper')?.getBoundingClientRect().height || 0) },
  dividers:document.querySelectorAll('.preview-column-divider').length,
  columns:getComputedStyle(document.querySelector('.print-scene-lines')).columnCount,
}))
const next = page.locator('.preview-toolbar button').nth(1)
if (await next.isEnabled()) await next.click()
await page.screenshot({ path:'screenshots/v05/print-preview-paged.png',fullPage:false })

console.log(JSON.stringify({ tableMetrics,readerDivider:{ before,after },preview },null,2))
await browser.close()
