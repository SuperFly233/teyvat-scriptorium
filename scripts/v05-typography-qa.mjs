import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseUrl = process.argv[2] || 'http://127.0.0.1:8791'
await mkdir('screenshots/v05', { recursive: true })
const browser = await chromium.launch({ headless: true })

function luminance([r, g, b]) {
  const values = [r, g, b].map((value) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
}

function parseRgb(value) {
  return [...value.matchAll(/[\d.]+/g)].slice(0, 3).map((match) => Number(match[0]))
}

async function inspect(page, name) {
  const metrics = await page.evaluate(() => {
    const style = (selector) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const css = getComputedStyle(element)
      return { fontFamily: css.fontFamily, fontSize: css.fontSize, lineHeight: css.lineHeight, color: css.color, background: css.backgroundColor }
    }
    const root = document.scrollingElement
    return {
      overflow: Boolean(root && root.scrollWidth > root.clientWidth),
      app: style('.app-shell'),
      body: style('.utterance p'),
      speaker: style('.utterance strong'),
      settingTitle: style('.setting-row strong'),
      activeSegment: style('.settings-list .segment button.active'),
      role: style('.role-filter-list strong'),
    }
  })
  const active = metrics.activeSegment
  if (active) {
    const light = luminance(parseRgb(active.color))
    const dark = luminance(parseRgb(active.background))
    metrics.activeContrast = Number(((Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05)).toFixed(2))
  }
  console.log(name, JSON.stringify(metrics))
  await page.screenshot({ path: `screenshots/v05/${name}.png`, fullPage: false })
  return metrics
}

async function openReader(viewport) {
  const page = await browser.newPage({ viewport })
  await page.addInitScript(() => localStorage.setItem('teyvat:reader-guide:v1', 'done'))
  await page.route('**/api/quest/1700?langs=*', async (route) => {
    const url = new URL(route.request().url())
    const response = await fetch(`https://teyvat-scriptorium.pages.dev/api/quest/1700${url.search}`)
    await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() })
  })
  await page.goto(`${baseUrl}/?chapter=1700`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.reader-page', { timeout: 60000 })
  return page
}

for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const catalog = await browser.newPage({ viewport })
  await catalog.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await catalog.waitForSelector('.catalog-page', { timeout: 60000 })
  const metrics = await catalog.evaluate(() => {
    const read = (selector) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const css = getComputedStyle(element)
      return { fontFamily: css.fontFamily, fontSize: css.fontSize }
    }
    const root = document.scrollingElement
    return { overflow: Boolean(root && root.scrollWidth > root.clientWidth), search: read('.catalog-search input'), cardTitle: read('.catalog-card h2'), meta: read('.card-meta') }
  })
  console.log(`catalog-${name}`, JSON.stringify(metrics))
  await catalog.screenshot({ path: `screenshots/v05/catalog-${name}.png`, fullPage: false })
  await catalog.close()
}

let page = await openReader({ width: 1440, height: 900 })
await inspect(page, 'desktop-reader')
await page.locator('.settings-button').click()
await page.locator('.theme-cards button').nth(1).click()
await page.locator('.settings-list .segment').nth(1).locator('button').nth(1).click()
await inspect(page, 'desktop-dark-sans-settings')
await page.locator('.settings-list .segment').nth(1).locator('button').nth(2).click()
await inspect(page, 'desktop-dark-yahei-settings')
await page.locator('.modal > header button').click()
await page.locator('.role-filter > button').click()
await inspect(page, 'desktop-dark-role-filter')
await page.locator('.role-filter > button').click()
await page.evaluate(() => scrollTo(0, 760))
await page.waitForTimeout(250)
await inspect(page, 'desktop-dark-scrolled')
await page.close()

page = await openReader({ width: 390, height: 844 })
await inspect(page, 'mobile-reader')
await page.locator('.settings-button').click()
await page.locator('.theme-cards button').nth(1).click()
await page.locator('.settings-list .segment').nth(1).locator('button').nth(1).click()
await inspect(page, 'mobile-dark-sans-settings')
await page.close()

await browser.close()
