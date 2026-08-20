import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { writeStableSnapshot } from './lib/data-update.mjs'

const ROOT = 'https://gi.yatta.moe/api/v2'
const clean = (value = '') => String(value || '').replace(/\$(?:HIDDEN|UNRELEASED)/g, '').trim()
const hidden = (value = '') => String(value || '').includes('$HIDDEN')
const unreleased = (value = '') => String(value || '').includes('$UNRELEASED')

async function get(path) {
  const response = await fetch(`${ROOT}/${path}`, { headers: { 'user-agent': 'Teyvat-Scriptorium/0.2' } })
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  const payload = await response.json()
  if (payload.response !== 200 || !payload.data) throw new Error(`${path}: invalid payload`)
  return payload.data
}

function nationFor(item) {
  const hint = `${item.chapterIcon || ''} ${item.chapterImageTitle || ''} ${item.chapterTitle || ''}`.toLowerCase()
  const rules = [
    ['mondstadt', /mengde|mondstadt|dragonspine|fleurfair|goldenapple|aster/],
    ['liyue', /liyue|sealam|chasm|firmament|lantern|moonchase|qunyuge|roguelikediary/],
    ['inazuma', /inazuma|irodori|mikawa|onmyo|enkanomiya/],
    ['sumeru', /sumeru|deshret|fungus|aranara/],
    ['fontaine', /fontaine|meropide|remuria/],
    ['natlan', /natlan|easybreeze/],
    ['nodkrai', /nodkrai|nod-krai|nasha/],
    ['snezhnaya', /snezhnaya|zapolyarny/],
    ['traveler', /traveler|journey|dainsleif|khaenri|common/],
  ]
  return rules.find(([, pattern]) => pattern.test(hint))?.[0] || 'unknown'
}

const avatarRegion = (region = '') => ({ MONDSTADT:'mondstadt',LIYUE:'liyue',INAZUMA:'inazuma',SUMERU:'sumeru',FONTAINE:'fontaine',NATLAN:'natlan',NODKRAI:'nodkrai',NODKRAI_ZIBAI:'nodkrai',SNEZHNAYA:'snezhnaya',SNEZHNAYA_STAR:'snezhnaya' }[region] || null)
const commissionNation = (item) => item.type === 'iq' ? ({ '2':'inazuma','3':'sumeru','4':'fontaine','5':'natlan','6':'nodkrai' }[item.version?.split('.')[0]] || null) : null
// These characters have a cross-national or non-national affiliation in the
// avatar dataset, so classify their Story Quest by its verified main location.
const storyQuestLocationNation = {
  2012: 'liyue',
  2047: 'fontaine',
  2075: 'liyue',
}

const WIKI_API = 'https://genshin-impact.fandom.com/api.php'
const WIKI_CACHE = resolve('public/data/wiki-metadata.json')
const nationCategories = [
  ['mondstadt', /Category:Mondstadt Quests$/], ['liyue', /Category:Liyue Quests$/],
  ['inazuma', /Category:Inazuma Quests$/], ['sumeru', /Category:Sumeru Quests$/],
  ['fontaine', /Category:Fontaine Quests$/], ['natlan', /Category:Natlan Quests$/],
  ['nodkrai', /Category:Nod-Krai Quests$/], ['snezhnaya', /Category:Snezhnaya Quests$/],
  ['traveler', /Category:Traveler Quests$/],
]

async function getWikiMetadata(titles) {
  let cache = {}
  try { cache = JSON.parse(await readFile(WIKI_CACHE, 'utf8')) } catch { /* first catalog build */ }
  const pending = titles.filter((title) => title && !cache[title])
  for (let start = 0; start < pending.length; start += 40) {
    const batch = pending.slice(start, start + 40)
    const params = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', prop: 'categories', cllimit: 'max', redirects: '1', origin: '*', titles: batch.join('|') })
    let payload = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(`${WIKI_API}?${params}`, { headers: { 'user-agent': 'Teyvat-Scriptorium/0.2 (catalog metadata)' }, signal: AbortSignal.timeout(30000) })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        payload = await response.json()
        break
      } catch (error) {
        if (attempt === 3) console.warn(`Wiki batch ${start / 40 + 1} skipped: ${error.message}`)
        else await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 1200))
      }
    }
    if (!payload) continue
    const aliases = new Map(batch.map((title) => [title, title]))
    for (const entry of [...(payload.query?.normalized || []), ...(payload.query?.redirects || [])]) aliases.set(entry.to, aliases.get(entry.from) || entry.from)
    for (const page of payload.query?.pages || []) {
      const sourceTitle = aliases.get(page.title) || page.title
      const categories = (page.categories || []).map((category) => category.title)
      const version = categories.map((name) => name.match(/^Category:Released in Version (\d+\.\d+)$/)?.[1]).find(Boolean) || null
      const nation = nationCategories.find(([, pattern]) => categories.some((name) => pattern.test(name)))?.[0] || null
      cache[sourceTitle] = page.missing ? { matched: false } : { matched: true, page: page.title, version, nation }
    }
    for (const title of batch) cache[title] ||= { matched: false }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 120))
  }
  await writeFile(WIKI_CACHE, `${JSON.stringify(cache)}\n`, 'utf8')
  return cache
}

const [zhPayload, enPayload, changelog,avatars] = await Promise.all([
  get('CHS/quest'),
  get('EN/quest'),
  get('static/changelog'),
  get('CHS/avatar'),
])

const zhItems = zhPayload.items || {}
const enItems = enPayload.items || {}
const versionById = new Map()
for (const [rawVersion, release] of Object.entries(changelog)) {
  const version = `${rawVersion[0]}.${rawVersion.slice(1)}`
  for (const id of release.items?.quest || []) versionById.set(String(id), version)
}

const ids = [...new Set([...Object.keys(zhItems), ...Object.keys(enItems)])]
const avatarItems=Object.values(avatars.items||{})
const avatarNationByIcon=new Map(avatarItems.map((avatar)=>[String(avatar.icon||'').replace('UI_AvatarIcon_','').toLowerCase(),avatarRegion(avatar.region)]).filter(([,nation])=>nation))
const avatarNationByName=new Map(avatarItems.map((avatar)=>[clean(avatar.name),avatarRegion(avatar.region)]).filter(([name,nation])=>name&&nation))
let items = ids.map((id) => {
  const zh = zhItems[id]
  const en = enItems[id]
  const base = zh || en
  const version = versionById.get(id) || null
  return {
    id: Number(id),
    type: base.type || 'other',
    title: { zh: clean(zh?.chapterTitle) || clean(en?.chapterTitle) || `任务 ${id}`, en: clean(en?.chapterTitle) || clean(zh?.chapterTitle) || `Quest ${id}` },
    chapter: { zh: clean(zh?.chapterNum), en: clean(en?.chapterNum) },
    imageTitle: { zh: zh?.chapterImageTitle || '', en: en?.chapterImageTitle || '' },
    route: en?.route || zh?.route || '',
    chapterCount: Math.max(zh?.chapterCount || 0, en?.chapterCount || 0),
    icon: base.chapterIcon || null,
    nation: nationFor(base),
    nationSource: nationFor(base) === 'unknown' ? 'unknown' : 'title-inference',
    version,
    versionSource: version ? 'yatta-changelog' : 'unknown',
    versionGroup: version ? version.split('.')[0] : 'legacy',
    hidden: hidden(zh?.chapterTitle) || hidden(en?.chapterTitle),
    unreleased: unreleased(zh?.chapterTitle) || unreleased(en?.chapterTitle),
    languages: { zh: Boolean(zh), en: Boolean(en) },
  }
}).sort((a, b) => b.id - a.id)

const wikiMetadata = await getWikiMetadata([...new Set(items.map((item) => item.title.en))])
items = items.map((item) => {
  const wiki = wikiMetadata[item.title.en]
  const iconKey=String(item.icon||'').replace('UI_ChapterIcon_','').toLowerCase()
  const questLocationNation=item.type==='lq'?storyQuestLocationNation[item.id]||null:null
  const characterNation=item.type==='lq'?(avatarNationByIcon.get(iconKey)||avatarNationByName.get(item.imageTitle.zh)):null
  const inferredCommissionNation=commissionNation(item)
  const nation=wiki?.nation||questLocationNation||characterNation||inferredCommissionNation||item.nation
  return {
    ...item,
    version: item.version || wiki?.version || null,
    versionSource: item.version ? item.versionSource : wiki?.version ? 'wiki' : 'unknown',
    versionGroup: (item.version || wiki?.version)?.split('.')[0] || 'unknown',
    nation,
    nationSource: wiki?.nation?'wiki':questLocationNation?'quest-location':characterNation?'yatta-avatar':inferredCommissionNation?'version-series':item.nationSource,
    wikiPage: wiki?.matched ? wiki.page : null,
  }
})

const counts = {
  total: items.length,
  byType: Object.fromEntries([...new Set(items.map((item) => item.type))].map((type) => [type, items.filter((item) => item.type === type).length])),
  byNation: Object.fromEntries([...new Set(items.map((item) => item.nation))].map((nation) => [nation, items.filter((item) => item.nation === nation).length])),
}

const catalog = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  source: 'Project Amber / Yatta',
  versionCoverage: {
    exactFrom: '1.0',
    note: '版本优先取 Yatta 更新记录；早期条目由 Genshin Impact Wiki 的发布版本分类补足。上游目录未提供版本字段的条目会明确标为“版本数据缺失”。',
  },
  versions: [...new Set(items.map((item) => item.version).filter(Boolean))].sort((a, b) => Number(b.replace('.', '')) - Number(a.replace('.', ''))),
  counts,
  items,
}

const output = resolve('public/data')
await mkdir(output, { recursive: true })
const result = await writeStableSnapshot(resolve(output, 'catalog.json'), catalog)
console.log(`${result.semanticChanged ? 'Updated' : 'Checked'} ${items.length} bilingual quest records; ${items.filter((item) => item.version).length} have exact release versions.`)
