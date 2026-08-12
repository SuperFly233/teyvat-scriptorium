import { chromium } from 'playwright'

const baseUrl = process.argv[2] || 'http://127.0.0.1:8790'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.route('**/api/quest/1700?langs=*', async (route) => { await new Promise((resolve) => setTimeout(resolve, 650)); await route.continue() })

await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.getByPlaceholder('搜索任务').fill('1700')
await page.locator('.catalog-card').first().click()
await page.waitForSelector('.reader-page', { timeout: 60000 })
const openedUrl = page.url()
await page.goBack()
await page.waitForSelector('.catalog-page')
const backUrl = page.url()
await page.goForward()
await page.waitForSelector('.reader-page')
const forwardUrl = page.url()

const search = page.getByPlaceholder('搜角色或台词')
await search.fill('派蒙')
await page.waitForSelector('.match-nav')
const locateMatches = await page.locator('.match-nav span').textContent()
const allRows = await page.locator('.dialogue-row').count()
await page.getByLabel('搜索方式').selectOption('filter')
const filteredRows = await page.locator('.dialogue-row').count()

await page.locator('.role-filter > button').click()
const roles = await page.evaluate(() => ({
  featured: [...document.querySelectorAll('.featured-roles strong')].map((el) => el.textContent),
  regularHeading: document.querySelector('.role-filter-actions span')?.textContent,
}))
await page.locator('.role-filter > button').click()

await search.fill('')
await page.getByLabel('搜索方式').selectOption('locate')
await page.locator('.selection-toggle').click()
await page.getByRole('button', { name: '取消当前结果' }).click()
await page.locator('.line-select').first().click()
await page.locator('.queue-inline').click()
const basketText = await page.locator('.desktop-print-fab span').textContent()
await page.locator('.quest-tabs button').nth(1).click()
await page.getByRole('button', { name: '取消当前结果' }).click()
await page.locator('.line-select').first().click()
await page.locator('.queue-inline').click()
const crossQuestBasketText = await page.locator('.desktop-print-fab span').textContent()

await page.locator('.language-control > button').click()
await page.locator('.language-list label', { hasText: '日本語' }).click()
await page.waitForSelector('.loading-overlay', { state: 'visible' })
const loading = await page.evaluate(() => ({
  title: document.querySelector('.loading-overlay strong')?.textContent,
  detail: document.querySelector('.loading-overlay span')?.textContent,
  progress: document.querySelector('.load-progress i')?.style.width,
}))
await page.waitForSelector('.loading-overlay', { state: 'hidden', timeout: 60000 })
await page.locator('.language-list label', { hasText: '简体中文' }).click()
await page.waitForSelector('.loading-overlay', { state: 'hidden', timeout: 60000 })
await page.locator('.language-list label', { hasText: 'English' }).click()
await page.waitForSelector('.loading-overlay', { state: 'hidden', timeout: 60000 })
const onlyJapanese = await page.evaluate(() => ({
  selectedLanguages: document.querySelectorAll('.language-list label.active').length,
  japaneseCells: document.querySelector('.dialogue-row')?.querySelectorAll('.utterance[lang="ja"]').length,
}))
await page.locator('.language-control > button').click()
await page.locator('.role-filter > button').click()
onlyJapanese.featuredRoles = [...await page.locator('.featured-roles strong').allTextContents()]
await page.locator('.role-filter > button').click()

await page.goBack()
await page.waitForSelector('.catalog-page')
await page.goForward()
await page.waitForSelector('.reader-page')
await page.waitForSelector('.loading-overlay', { state: 'hidden', timeout: 60000 })
const japaneseAfterHistory = await page.evaluate(() => ({
  selectedLanguages: document.querySelectorAll('.language-list label.active').length,
  japaneseCells: document.querySelector('.dialogue-row')?.querySelectorAll('.utterance[lang="ja"]').length,
}))

console.log(JSON.stringify({ openedUrl, backUrl, forwardUrl, locateMatches, allRows, filteredRows, roles, basketText, crossQuestBasketText, loading, onlyJapanese, japaneseAfterHistory }, null, 2))
await browser.close()
