import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const load = async (path) => JSON.parse(await readFile(resolve(path), 'utf8'))
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const validDate = (value) => Number.isFinite(Date.parse(value))
const unique = (items) => new Set(items.map((item) => item.id)).size === items.length

const [catalog, hangouts, chapter, manifest] = await Promise.all([
  load('public/data/catalog.json'),
  load('public/data/hangouts.json'),
  load('public/data/quest-1700.json'),
  load('public/data/manifest.json'),
])

assert(validDate(catalog.generatedAt), 'catalog.json generatedAt is invalid')
assert(catalog.items.length >= 1_700, `catalog.json unexpectedly contains ${catalog.items.length} items`)
assert(catalog.counts.total === catalog.items.length, 'catalog.json count does not match items')
assert(unique(catalog.items), 'catalog.json contains duplicate IDs')

assert(validDate(hangouts.generatedAt), 'hangouts.json generatedAt is invalid')
assert(hangouts.items.length >= 19, `hangouts.json unexpectedly contains ${hangouts.items.length} items`)
assert(unique(hangouts.items), 'hangouts.json contains duplicate IDs')
assert(hangouts.items.every((item) => item.type === 'hq' && item.title?.zh && item.title?.en), 'hangouts.json contains an invalid bilingual item')

const scenes = chapter.quests.flatMap((quest) => quest.scenes)
const lines = scenes.flatMap((scene) => scene.lines)
assert(validDate(chapter.generatedAt), 'quest snapshot generatedAt is invalid')
assert(chapter.stats.quests === chapter.quests.length, 'quest count does not match snapshot')
assert(chapter.stats.scenes === scenes.length, 'scene count does not match snapshot')
assert(chapter.stats.lines === lines.length, 'line count does not match snapshot')
assert(manifest.chapters.some((entry) => entry.file === 'quest-1700.json'), 'manifest does not reference the default chapter')

console.log(`Validated ${catalog.items.length} quests, ${hangouts.items.length} Hangout Events, and ${lines.length} default-chapter lines.`)
