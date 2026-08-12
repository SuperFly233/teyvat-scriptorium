import { chromium } from 'playwright'

const baseUrl = process.argv[2] || 'http://127.0.0.1:8792'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
await page.route('**/api/quest/1700?langs=*', async (route) => {
  const url = new URL(route.request().url())
  const response = await fetch(`https://teyvat-scriptorium.pages.dev/api/quest/1700${url.search}`)
  await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() })
})
await page.addInitScript(() => { localStorage.setItem('teyvat:reader-guide:v1', 'done'); window.print = () => { document.documentElement.dataset.printCalled = 'true' } })
await page.goto(`${baseUrl}/?chapter=1700`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('.reader-page', { timeout: 60000 })
await page.locator('.selection-toggle').click()
await page.locator('.selection-bar button').filter({ hasText: '全选当前显示' }).click()
await page.locator('.queue-inline').click()
await page.locator('.desktop-print-fab').click()
await page.getByText('超紧凑', { exact: true }).click()
await page.getByRole('button', { name: '保存矢量 PDF' }).click()
await page.waitForFunction(() => document.documentElement.dataset.printCalled === 'true')
await page.emulateMedia({ media: 'print' })
const metrics = await page.evaluate(() => {
  const lines = [...document.querySelectorAll('.print-only-root .print-line')]
  const cells = [...document.querySelectorAll('.print-only-root .print-cell')]
  const paragraphs = [...document.querySelectorAll('.print-only-root .print-cell p')]
  const heights = lines.map((line) => line.getBoundingClientRect().height)
  const read = (element) => {
    const css = getComputedStyle(element)
    return { height: element.getBoundingClientRect().height, minHeight: css.minHeight, padding: css.padding, margin: css.margin, fontSize: css.fontSize, lineHeight: css.lineHeight, display: css.display, breakInside: css.breakInside }
  }
  return {
    density: document.documentElement.dataset.printDensity,
    count: lines.length,
    documentHeight: document.querySelector('.print-only-root .print-document')?.getBoundingClientRect().height,
    averageLineHeight: heights.reduce((sum, value) => sum + value, 0) / heights.length,
    medianLineHeight: heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)],
    maxLineHeight: Math.max(...heights),
    line: read(lines[0]),
    cell: read(cells[0]),
    paragraph: read(paragraphs[0]),
  }
})
console.log(JSON.stringify(metrics, null, 2))
await browser.close()
