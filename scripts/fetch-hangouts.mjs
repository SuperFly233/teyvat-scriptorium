import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fetchJson, mapLimit, writeStableSnapshot } from './lib/data-update.mjs'

const ROOT = 'https://gi.yatta.moe/api/v2'
const output = resolve('public/data/hangouts.json')
const curatedVersions = {
  101401:'1.4', 103401:'1.4', 103601:'1.4', 103201:'1.4', 103402:'1.5', 103901:'1.5',
  105001:'2.2', 105301:'2.2', 102401:'2.3', 105501:'2.3', 106401:'2.4', 102701:'2.4',
  106501:'2.7', 105901:'2.8', 107601:'3.5', 107401:'3.6', 108101:'3.7', 101501:'3.8', 108301:'4.5',
}
const regionNation = {
  MONDSTADT:'mondstadt', LIYUE:'liyue', INAZUMA:'inazuma', SUMERU:'sumeru', FONTAINE:'fontaine',
  NATLAN:'natlan', NODKRAI:'nodkrai', NODKRAI_ZIBAI:'nodkrai', SNEZHNAYA:'snezhnaya', SNEZHNAYA_STAR:'snezhnaya',
}

let previous = { items: [] }
try { previous = JSON.parse(await readFile(output, 'utf8')) } catch { /* first snapshot */ }
const previousById = new Map(previous.items.map((item) => [item.id, item]))

async function yatta(path, { allowNotFound = false } = {}) {
  const payload = await fetchJson(`${ROOT}/${path}`, { label: `Yatta ${path}`, allowNotFound })
  if (payload === null) return null
  if (payload.response !== 200 || !payload.data) throw new Error(`Yatta ${path}: invalid payload`)
  return payload.data
}

const [zhAvatars, enAvatars] = await Promise.all([yatta('CHS/avatar'), yatta('EN/avatar')])
const zhAvatarList = Object.values(zhAvatars.items || {})
const enAvatarList = Object.values(enAvatars.items || {})
const numericAvatars = zhAvatarList.filter((avatar) => Number.isInteger(Number(avatar.id)))
const avatarByCode = new Map()
for (const [language, list] of [['zh', zhAvatarList], ['en', enAvatarList]]) {
  for (const avatar of list) {
    const numericId = Number(avatar.id)
    if (!Number.isInteger(numericId)) continue
    const code = numericId - 10_000_000
    avatarByCode.set(code, { ...avatarByCode.get(code), [language]:avatar })
  }
}

const identity = (id) => {
  const match = String(id).match(/^1(\d{3})(\d{2})$/)
  return match ? { character:Number(match[1]), act:Number(match[2]) } : null
}
const questId = (character, act) => Number(`1${String(character).padStart(3, '0')}${String(act).padStart(2, '0')}`)
const actsByCharacter = new Map()
for (const item of previous.items) {
  const parsed = identity(item.id)
  if (!parsed) continue
  actsByCharacter.set(parsed.character, Math.max(actsByCharacter.get(parsed.character) || 0, parsed.act))
}

const probeIds = numericAvatars.map((avatar) => {
  const character = Number(avatar.id) - 10_000_000
  return questId(character, (actsByCharacter.get(character) || 0) + 1)
})
const detailCache = new Map()
const probeResults = await mapLimit(probeIds, 8, async (id) => {
  const detail = await yatta(`CHS/quest/${id}`, { allowNotFound:true })
  if (detail?.info?.type === 'hq') detailCache.set(`CHS:${id}`, detail)
  return detail?.info?.type === 'hq' ? id : null
})
const discovered = probeResults.filter(Boolean)
const ids = [...new Set([...previous.items.map((item) => item.id), ...discovered])]

const loadQuest = async (lang, id) => {
  const key = `${lang}:${id}`
  if (!detailCache.has(key)) detailCache.set(key, await yatta(`${lang}/quest/${id}`, { allowNotFound:true }))
  return detailCache.get(key)
}
const items = (await mapLimit(ids, 6, async (id) => {
  const old = previousById.get(id)
  try {
    const [zh, en] = await Promise.all([loadQuest('CHS', id), loadQuest('EN', id)])
    if (zh?.info?.type !== 'hq' || en?.info?.type !== 'hq') return old || null
    const parsed = identity(id)
    const avatar = avatarByCode.get(parsed?.character)
    const version = old?.version || curatedVersions[id] || null
    const chapterCount = Math.max(Object.keys(zh.storyList || {}).length, Object.keys(en.storyList || {}).length)
    return {
      id,
      type:'hq',
      title:{ zh:zh.info.chapterTitle, en:en.info.chapterTitle },
      chapter:{ zh:zh.info.chapterNum, en:en.info.chapterNum },
      imageTitle:{ zh:zh.info.chapterImageTitle, en:en.info.chapterImageTitle },
      route:en.info.route || zh.info.route || '',
      chapterCount,
      icon:zh.info.chapterIcon || en.info.chapterIcon || null,
      nation:regionNation[avatar?.zh?.region || avatar?.en?.region] || old?.nation || 'unknown',
      nationSource:avatar ? 'yatta-avatar' : old?.nationSource || 'unknown',
      version,
      versionSource:version ? old?.versionSource || 'curated' : 'unknown',
      versionGroup:version?.split('.')[0] || 'unknown',
      wikiPage:old?.wikiPage || null,
      hidden:false,
      unreleased:false,
      languages:{ zh:true, en:true },
      sourceUrl:`https://gi.yatta.moe/chs/archive/quest/${id}`,
      verificationUrl:`https://gensh.honeyhunterworld.com/ch_${id}/?lang=CHS`,
    }
  } catch (error) {
    if (old) {
      console.warn(`Hangout ${id} retained from snapshot: ${error.message}`)
      return old
    }
    throw error
  }
})).filter(Boolean)

if (items.length < Math.max(19, previous.items.length)) throw new Error(`Hangout validation failed: expected at least ${Math.max(19, previous.items.length)}, received ${items.length}`)
if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error('Hangout validation failed: duplicate IDs')

await mkdir(resolve('public/data'), { recursive:true })
const result = await writeStableSnapshot(output, {
  schemaVersion:2,
  generatedAt:new Date().toISOString(),
  source:'Project Amber / Yatta; Honey Hunter World verification',
  discovery:{ strategy:'Yatta avatar-to-Hangout ID probing', checkedCharacters:numericAvatars.length },
  items,
})
console.log(`${result.semanticChanged ? 'Updated' : 'Checked'} ${items.length} Hangout Event chapters; probed ${numericAvatars.length} character slots and discovered ${discovered.length} new chapter(s).`)
