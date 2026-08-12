import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const baseUrl = process.argv[2] || 'http://127.0.0.1:8788'
await mkdir('screenshots', { recursive: true })
const browser = await chromium.launch({ headless: true })

async function capture(name, path, viewport, { scroll = 0, action } = {}) {
  const page = await browser.newPage({ viewport })
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' })
  if (action) await action(page)
  if (scroll) await page.evaluate((y) => window.scrollTo(0, y), scroll)
  await page.waitForTimeout(250)
  const metrics = await page.evaluate(() => {
    const doc = document.scrollingElement
    const sticky = document.querySelector('.reader-toolbar')?.getBoundingClientRect()
    const search = (document.querySelector('.catalog-search') || document.querySelector('.reader-search'))?.getBoundingClientRect()
    const controls = (document.querySelector('.catalog-controls') || document.querySelector('.reader-toolbar'))?.getBoundingClientRect()
    const first = (document.querySelector('.catalog-card') || document.querySelector('.scene-block'))?.getBoundingClientRect()
    return {
      viewport: [innerWidth, innerHeight], pageWidth: doc?.scrollWidth, clientWidth: doc?.clientWidth,
      horizontalOverflow: Boolean(doc && doc.scrollWidth > doc.clientWidth),
      sticky: sticky && { top: Math.round(sticky.top), height: Math.round(sticky.height) },
      search: search && { width: Math.round(search.width), height: Math.round(search.height) },
      controls: controls && { top: Math.round(controls.top), height: Math.round(controls.height) },
      first: first && { top: Math.round(first.top), height: Math.round(first.height) },
    }
  })
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: false })
  console.log(name, JSON.stringify(metrics))
  await page.close()
}

await capture('catalog-desktop', '/', { width: 1440, height: 900 })
await capture('catalog-mobile', '/', { width: 390, height: 844 })
await capture('reader-desktop', '/?chapter=1700', { width: 1440, height: 900 })
await capture('reader-scrolled', '/?chapter=1700', { width: 1440, height: 900 }, { scroll: 650 })
await capture('reader-mobile', '/?chapter=1700', { width: 390, height: 844 })
await capture('reader-mobile-select', '/?chapter=1700', { width: 390, height: 844 }, { action: async (page) => { await page.locator('.mobile-action-dock button').nth(1).click() } })
await capture('print-studio', '/?chapter=1700', { width: 1440, height: 900 }, { action: async (page) => { await page.locator('.desktop-print-fab').click() } })

const pdfPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await pdfPage.goto(`${baseUrl}/?chapter=1700`, { waitUntil: 'networkidle' })
await pdfPage.locator('.desktop-print-fab').click()
await pdfPage.locator('.segment button', { hasText: '超紧凑' }).click()
await pdfPage.emulateMedia({ media: 'print' })
await pdfPage.pdf({ path: resolve('screenshots/print-ultra-compact.pdf'), format: 'A4', printBackground: true, margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' } })
console.log('print-pdf', JSON.stringify({ path: 'screenshots/print-ultra-compact.pdf' }))
const exportPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
await exportPage.goto(`${baseUrl}/?chapter=1700`, { waitUntil: 'networkidle' })
await exportPage.locator('.selection-toggle').click()
await exportPage.locator('.selection-bar button', { hasText: '取消当前结果' }).click()
await exportPage.locator('.line-select').first().click()
await exportPage.locator('.desktop-print-fab').click()
const downloadPromise = exportPage.waitForEvent('download', { timeout: 120000 })
await exportPage.locator('.primary-action').click()
const download = await downloadPromise
await mkdir('tmp/pdfs', { recursive: true })
await download.saveAs(resolve('tmp/pdfs/direct-export-selection.pdf'))
console.log('direct-export', JSON.stringify({ filename: download.suggestedFilename() }))
await browser.close()
