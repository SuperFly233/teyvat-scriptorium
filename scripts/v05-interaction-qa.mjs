import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseUrl = process.argv[2] || 'http://127.0.0.1:8794'
await mkdir('screenshots/v05', { recursive: true })
const browser = await chromium.launch({ headless: true })

async function routeQuest(page) {
  await page.route('**/api/quest/1700?langs=*', async (route) => {
    const url = new URL(route.request().url())
    const response = await fetch(`https://teyvat-scriptorium.pages.dev/api/quest/1700${url.search}`)
    await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() })
  })
}

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.addInitScript(() => localStorage.setItem('teyvat:reader-guide:v1', 'done'))
await routeQuest(page)
await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('.catalog-page')
await page.locator('.catalog-search input').fill('1700')
await page.locator('.select-filter select').nth(0).selectOption('aq')
await page.locator('.select-filter select').nth(3).selectOption('id')
await page.locator('.catalog-card').first().click()
await page.waitForSelector('.reader-page', { timeout: 60000 })
await page.goBack()
await page.waitForSelector('.catalog-page')
const restoredFilters = await page.evaluate(() => ({
  query: document.querySelector('.catalog-search input')?.value,
  type: document.querySelectorAll('.select-filter select')[0]?.value,
  sort: document.querySelectorAll('.select-filter select')[3]?.value,
}))

await page.locator('.catalog-card').first().click()
await page.waitForSelector('.reader-page', { timeout: 60000 })
await page.locator('.scene-locate').nth(8).click()
await page.waitForTimeout(700)
const sceneLocation = await page.locator('.scene-block').nth(8).evaluate((element) => ({
  top: Math.round(element.getBoundingClientRect().top),
  scrollY: Math.round(scrollY),
  documentHeight: Math.round(document.documentElement.scrollHeight),
  key: element.getAttribute('data-scene-key'),
  scrollParents: Array.from(document.querySelectorAll('*')).filter((candidate) => candidate.scrollHeight > candidate.clientHeight && getComputedStyle(candidate).overflowY !== 'visible').map((candidate) => ({ className: candidate.className, scrollTop: Math.round(candidate.scrollTop), clientHeight: candidate.clientHeight, scrollHeight: candidate.scrollHeight })).slice(0, 8),
}))

const initialSelected = await page.locator('.dialogue-row.selected').count()
await page.locator('.selection-toggle').click()
await page.locator('.selection-bar button', { hasText: '全选当前显示' }).click()
const allSelected = await page.locator('.dialogue-row.selected').count()
await page.locator('.selection-bar button', { hasText: '清空' }).click()
const clearedSelected = await page.locator('.dialogue-row.selected').count()
await page.locator('.line-select').first().click()
const oneSelected = await page.locator('.dialogue-row.selected').count()
await page.locator('.queue-inline').click()
const basket = await page.locator('.desktop-print-fab span').textContent()

await page.locator('.role-filter > button').click()
await page.locator('.role-filter-list input').first().uncheck()
await page.locator('.role-filter > button').click()
const filterState = await page.locator('.role-filter > button').evaluate((element) => ({ className: element.className, text: element.textContent }))
await page.screenshot({ path: 'screenshots/v05/interaction-reader.png', fullPage: false })

const guidePage = await browser.newPage({ viewport: { width: 390, height: 844 } })
await routeQuest(guidePage)
await guidePage.goto(`${baseUrl}/?chapter=1700`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await guidePage.waitForSelector('.reader-guide', { timeout: 60000 })
const guide = await guidePage.evaluate(() => ({ title: document.querySelector('.reader-guide h2')?.textContent, focused: document.querySelectorAll('.guide-focus').length }))
await guidePage.screenshot({ path: 'screenshots/v05/mobile-guide.png', fullPage: false })

console.log(JSON.stringify({ restoredFilters, sceneLocation, initialSelected, allSelected, clearedSelected, oneSelected, basket, filterState, guide }, null, 2))
await browser.close()
