import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseUrl = process.argv[2] || 'http://127.0.0.1:8790'
const pageAtTopLeft = process.argv.includes('--page-top-left')
await mkdir('tmp/pdfs', { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
await page.addInitScript(() => { window.print = () => { document.documentElement.dataset.printCalled = 'true' } })
await page.goto(`${baseUrl}/?chapter=1700`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('.reader-page', { timeout: 60000 })
await page.locator('.selection-toggle').click()
await page.locator('.queue-inline').click()
await page.locator('.desktop-print-fab').click()
await page.getByText('超紧凑', { exact: true }).click()
if (pageAtTopLeft) {
  await page.locator('.band-row').first().locator('select').first().selectOption('page')
  await page.locator('.band-row').nth(1).locator('select').nth(2).selectOption('none')
}
await page.getByRole('button', { name: '保存矢量 PDF' }).click()
await page.waitForFunction(() => document.documentElement.dataset.printCalled === 'true')
await page.pdf({ path: pageAtTopLeft ? 'tmp/pdfs/v04-native-vector-page-top-left.pdf' : 'tmp/pdfs/v04-native-vector-full.pdf', preferCSSPageSize: true, printBackground: true })
await browser.close()
