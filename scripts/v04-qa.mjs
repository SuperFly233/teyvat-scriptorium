import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseUrl = process.argv[2] || 'http://127.0.0.1:8790'
await mkdir('screenshots/v04', { recursive: true })
const browser = await chromium.launch({ headless: true })

async function pageAt(path, viewport) {
  const page = await browser.newPage({ viewport })
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle', timeout: 60000 })
  if (path.includes('chapter=')) await page.waitForSelector('.reader-page', { timeout: 60000 })
  return page
}

async function measure(page, name) {
  const metrics = await page.evaluate(() => {
    const doc = document.scrollingElement
    const rect = (selector) => { const value = document.querySelector(selector)?.getBoundingClientRect(); return value && { x:Math.round(value.x), top:Math.round(value.top), width:Math.round(value.width), height:Math.round(value.height) } }
    const style = (selector) => { const value = document.querySelector(selector); if (!value) return null; const css = getComputedStyle(value); return { fontSize:css.fontSize, lineHeight:css.lineHeight } }
    return { viewport:[innerWidth,innerHeight], overflow:Boolean(doc && doc.scrollWidth > doc.clientWidth), hero:rect('.catalog-hero'), workspace:rect('.reader-workspace'), script:rect('.script'), toolbar:rect('.reader-toolbar'), firstText:style('.utterance p'), roleText:style('.role-filter-list strong') }
  })
  console.log(name, JSON.stringify(metrics))
  await page.screenshot({ path:`screenshots/v04/${name}.png`, fullPage:false })
}

let page = await pageAt('/', { width:1440, height:900 }); await measure(page,'catalog-desktop'); await page.close()
page = await pageAt('/', { width:390, height:844 }); await measure(page,'catalog-mobile'); await page.close()

page = await pageAt('/?chapter=1700', { width:1440, height:900 })
await measure(page,'reader-desktop')
await page.locator('.role-filter > button').click()
console.log('roles', await page.evaluate(() => ({ featured:document.querySelectorAll('.featured-roles label').length, regular:document.querySelectorAll('.role-filter-list label').length })))
await measure(page,'reader-role-filter')
await page.locator('.role-filter > button').click()
await page.locator('.language-control > button').click()
await page.locator('.language-list label', { hasText:'日本語' }).click()
await page.waitForSelector('.loading-overlay', { state:'hidden', timeout:60000 })
await page.waitForFunction(() => document.querySelectorAll('.dialogue-row .utterance').length >= 3)
console.log('languages', await page.evaluate(() => ({ selected:document.querySelectorAll('.language-list label.active').length, utterances:document.querySelector('.dialogue-row')?.querySelectorAll('.utterance').length, japanese:Boolean([...document.querySelectorAll('.utterance')].some((el) => el.getAttribute('lang') === 'ja')) })))
await measure(page,'reader-three-languages')
await page.evaluate(() => scrollTo(0, 720)); await page.waitForTimeout(300); await measure(page,'reader-scrolled')
await page.close()

page = await pageAt('/?chapter=1700', { width:390, height:844 })
await page.locator('.language-control > button').click()
await page.locator('.language-list label', { hasText:'日本語' }).click()
await page.waitForSelector('.loading-overlay', { state:'hidden', timeout:60000 })
await measure(page,'reader-mobile-three-languages')
await page.locator('.language-control > button').click()
await page.locator('.role-filter > button').click()
await measure(page,'reader-mobile-role-filter')
await page.close()

page = await pageAt('/?chapter=1700', { width:1440, height:900 })
await page.locator('.settings-button').click(); await measure(page,'settings-light')
await page.locator('.theme-cards button', { hasText:'深色' }).click(); await page.waitForTimeout(200); await measure(page,'settings-dark')
await browser.close()
