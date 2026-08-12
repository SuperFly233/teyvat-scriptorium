import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const questId = process.argv[2] || '1700'
const API_ROOT = 'https://gi.yatta.moe/api/v2'

async function fetchLanguage(lang) {
  const url = `${API_ROOT}/${lang}/quest/${questId}`
  const response = await fetch(url, {
    headers: { 'user-agent': 'Teyvat-Scriptorium/0.1 (+non-commercial reader)' },
  })
  if (!response.ok) throw new Error(`${lang} fetch failed: ${response.status}`)
  const payload = await response.json()
  if (payload.response !== 200 || !payload.data) throw new Error(`${lang} returned an invalid payload`)
  return payload.data
}

const values = (object) => (object ? Object.values(object) : [])
const withoutFlags = (text) => (text || '').replace(/\$(?:HIDDEN|UNRELEASED)/g, '').trim()
const findById = (collection, id) => values(collection).find((item) => String(item?.id) === String(id))

function collectLines(zhStep, enStep) {
  const lines = []
  const zhTasks = values(zhStep.taskData)
  const enTasks = values(enStep?.taskData)

  zhTasks.forEach((zhTask, taskIndex) => {
    if (!zhTask?.items) return
    const enTask = enTasks[taskIndex]
    Object.entries(zhTask.items).forEach(([itemId, zhItem]) => {
      const enItem = enTask?.items?.[itemId]
      const zhTexts = values(zhItem.text)
      const enTexts = values(enItem?.text)
      const count = Math.max(zhTexts.length, enTexts.length)

      for (let textIndex = 0; textIndex < count; textIndex += 1) {
        const zhText = zhTexts[textIndex]?.text || ''
        const enText = enTexts[textIndex]?.text || ''
        if (!zhText && !enText) continue
        const isNarration = Boolean(zhItem.isBlackScreen)
        const isChoice = !isNarration && (!zhItem.role || itemId.endsWith('-player') || zhItem.type === 'MultiDialog')
        lines.push({
          key: `${zhStep.id}-${taskIndex}-${itemId}-${textIndex}`,
          nodeId: itemId,
          variant: textIndex,
          kind: isNarration ? 'narration' : isChoice ? 'choice' : 'dialogue',
          speaker: {
            zh: isNarration ? '' : zhItem.role || '旅行者',
            en: isNarration ? '' : enItem?.role || 'Traveler',
          },
          text: { zh: zhText, en: enText },
        })
      }
    })
  })
  return lines
}

function normalize(zh, en) {
  const quests = values(zh.storyList).map((zhQuest, questIndex) => {
    const enQuest = findById(en.storyList, zhQuest.id) || values(en.storyList)[questIndex]
    const scenes = values(zhQuest.story).map((zhStep) => {
      const enStep = findById(enQuest?.story, zhStep.id)
      return {
        key: `${zhQuest.id}-${zhStep.id}`,
        id: zhStep.id,
        hidden: Boolean(zhStep.isHidden),
        title: {
          zh: withoutFlags(zhStep.title) || '未命名场景',
          en: withoutFlags(enStep?.title) || 'Untitled scene',
        },
        description: {
          zh: zhStep.stepDescription || '',
          en: enStep?.stepDescription || '',
        },
        lines: collectLines(zhStep, enStep),
      }
    }).filter((scene) => scene.lines.length > 0)

    return {
      id: zhQuest.id,
      order: questIndex + 1,
      title: { zh: zhQuest.info.title, en: enQuest?.info?.title || '' },
      description: { zh: zhQuest.info.description || '', en: enQuest?.info?.description || '' },
      scenes,
    }
  })

  const allScenes = quests.flatMap((quest) => quest.scenes)
  const allLines = allScenes.flatMap((scene) => scene.lines)
  const missingPairs = allLines.filter((line) => !line.text.zh || !line.text.en).length

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      primary: 'Project Amber / Yatta',
      url: `https://gi.yatta.moe/en/archive/quest/${questId}`,
      verification: `https://gensh.honeyhunterworld.com/ch_${questId}/?lang=EN`,
    },
    chapter: {
      id: zh.info.id,
      number: { zh: zh.info.chapterNum, en: en.info.chapterNum },
      title: { zh: zh.info.chapterTitle, en: en.info.chapterTitle },
      region: { zh: zh.info.chapterImageTitle, en: en.info.chapterImageTitle },
    },
    stats: {
      quests: quests.length,
      scenes: allScenes.length,
      lines: allLines.length,
      missingPairs,
    },
    quests,
  }
}

const [zh, en] = await Promise.all([fetchLanguage('CHS'), fetchLanguage('EN')])
const normalized = normalize(zh, en)
const outputDir = resolve('public/data')
await mkdir(outputDir, { recursive: true })
await writeFile(resolve(outputDir, `quest-${questId}.json`), `${JSON.stringify(normalized)}\n`, 'utf8')
await writeFile(resolve(outputDir, 'manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  defaultChapter: Number(questId),
  chapters: [{
    id: Number(questId),
    file: `quest-${questId}.json`,
    title: normalized.chapter.title,
    region: normalized.chapter.region,
  }],
})}\n`, 'utf8')

console.log(`Saved chapter ${questId}: ${normalized.stats.quests} quests, ${normalized.stats.scenes} scenes, ${normalized.stats.lines} aligned lines (${normalized.stats.missingPairs} incomplete pairs).`)
