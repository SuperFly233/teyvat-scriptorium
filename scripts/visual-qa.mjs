import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseUrl = process.argv[2] || 'http://127.0.0.1:4173'
await mkdir('screenshots', { recursive: true })
const browser = await chromium.launch({ headless: true })

async function inspect(name, viewport, options = {}) {
  const page = await browser.newPage({ viewport })
  if (options.print) await page.emulateMedia({ media: 'print' })
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.locator('.scene').first().waitFor()
  if (options.scroll) await page.evaluate(() => window.scrollTo(0, 850))
  await page.waitForTimeout(250)
  const metrics = await page.evaluate(() => {
    const doc = document.scrollingElement
    const toolbar = document.querySelector('.reader-toolbar')?.getBoundingClientRect()
    const search = document.querySelector('.search-box')?.getBoundingClientRect()
    const firstScene = document.querySelector('.scene')?.getBoundingClientRect()
    return {
      viewport: [window.innerWidth, window.innerHeight],
      pageWidth: doc?.scrollWidth,
      clientWidth: doc?.clientWidth,
      horizontalOverflow: Boolean(doc && doc.scrollWidth > doc.clientWidth),
      toolbar: toolbar && { top: Math.round(toolbar.top), height: Math.round(toolbar.height), width: Math.round(toolbar.width) },
      search: search && { width: Math.round(search.width), height: Math.round(search.height) },
      firstScene: firstScene && { top: Math.round(firstScene.top), height: Math.round(firstScene.height) },
    }
  })
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: Boolean(options.fullPage) })
  console.log(name, JSON.stringify(metrics))
  await page.close()
}

await inspect('desktop', { width: 1440, height: 900 })
await inspect('desktop-scrolled', { width: 1440, height: 900 }, { scroll: true })
await inspect('mobile', { width: 390, height: 844 })
await inspect('print-first-page', { width: 794, height: 1123 }, { print: true })

const printPage = await browser.newPage()
await printPage.goto(baseUrl, { waitUntil: 'networkidle' })
await printPage.locator('.scene').first().waitFor()
await printPage.pdf({ path: 'screenshots/print-parallel.pdf', format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })
console.log('print-pdf', JSON.stringify({ saved: true }))
await browser.close()
