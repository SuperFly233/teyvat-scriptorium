const API_ROOT = 'https://gi.yatta.moe/api/v2'
const values = (object) => object ? Object.values(object) : []
const clean = (text = '') => String(text || '').replace(/\$(?:HIDDEN|UNRELEASED)/g, '').trim()
const findById = (collection, id) => values(collection).find((item) => String(item?.id) === String(id))

async function fetchLanguage(lang, id) {
  const response = await fetch(`${API_ROOT}/${lang}/quest/${id}`, {
    headers: { 'user-agent': 'Teyvat-Scriptorium/0.2' },
  })
  if (!response.ok) return null
  const payload = await response.json()
  return payload.response === 200 ? payload.data : null
}

function collectLines(primaryStep, secondaryStep, primaryLang) {
  const lines = []
  const primaryTasks = values(primaryStep?.taskData)
  const secondaryTasks = values(secondaryStep?.taskData)
  primaryTasks.forEach((task, taskIndex) => {
    if (!task?.items) return
    const otherTask = secondaryTasks[taskIndex]
    Object.entries(task.items).forEach(([itemId, item]) => {
      const otherItem = otherTask?.items?.[itemId]
      const texts = values(item.text)
      const otherTexts = values(otherItem?.text)
      const count = Math.max(texts.length, otherTexts.length)
      for (let variant = 0; variant < count; variant += 1) {
        const primaryText = texts[variant]?.text || ''
        const secondaryText = otherTexts[variant]?.text || ''
        if (!primaryText && !secondaryText) continue
        const isZh = primaryLang === 'zh'
        const choice = !item.role || itemId.endsWith('-player') || item.type === 'MultiDialog'
        lines.push({
          key: `${primaryStep.id}-${taskIndex}-${itemId}-${variant}`,
          nodeId: itemId,
          variant,
          kind: choice ? 'choice' : item.isBlackScreen ? 'narration' : 'dialogue',
          speaker: isZh
            ? { zh: item.role || '旅行者', en: otherItem?.role || 'Traveler' }
            : { zh: otherItem?.role || '旅行者', en: item.role || 'Traveler' },
          text: isZh
            ? { zh: primaryText, en: secondaryText }
            : { zh: secondaryText, en: primaryText },
        })
      }
    })
  })
  return lines
}

function normalize(zh, en, id) {
  const primary = zh || en
  const secondary = zh ? en : null
  const primaryLang = zh ? 'zh' : 'en'
  const quests = values(primary.storyList).map((quest, index) => {
    const otherQuest = findById(secondary?.storyList, quest.id) || values(secondary?.storyList)[index]
    const scenes = values(quest.story).map((step) => {
      const otherStep = findById(otherQuest?.story, step.id)
      const lines = collectLines(step, otherStep, primaryLang)
      return {
        key: `${quest.id}-${step.id}`,
        id: step.id,
        hidden: Boolean(step.isHidden),
        title: primaryLang === 'zh'
          ? { zh: clean(step.title) || '未命名场景', en: clean(otherStep?.title) || 'Untitled scene' }
          : { zh: clean(otherStep?.title) || '未命名场景', en: clean(step.title) || 'Untitled scene' },
        description: primaryLang === 'zh'
          ? { zh: step.stepDescription || '', en: otherStep?.stepDescription || '' }
          : { zh: otherStep?.stepDescription || '', en: step.stepDescription || '' },
        lines,
      }
    }).filter((scene) => scene.lines.length)
    const info = quest.info || {}
    const otherInfo = otherQuest?.info || {}
    return {
      id: quest.id,
      order: index + 1,
      title: primaryLang === 'zh' ? { zh: info.title || '', en: otherInfo.title || '' } : { zh: otherInfo.title || '', en: info.title || '' },
      description: primaryLang === 'zh' ? { zh: info.description || '', en: otherInfo.description || '' } : { zh: otherInfo.description || '', en: info.description || '' },
      scenes,
    }
  })
  const allScenes = quests.flatMap((quest) => quest.scenes)
  const allLines = allScenes.flatMap((scene) => scene.lines)
  const primaryInfo = primary.info || {}
  const secondaryInfo = secondary?.info || {}
  const pair = (field) => primaryLang === 'zh'
    ? { zh: primaryInfo[field] || '', en: secondaryInfo[field] || '' }
    : { zh: secondaryInfo[field] || '', en: primaryInfo[field] || '' }
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    source: { primary: 'Project Amber / Yatta', url: `https://gi.yatta.moe/en/archive/quest/${id}`, verification: `https://gensh.honeyhunterworld.com/ch_${id}/?lang=EN` },
    chapter: { id: Number(id), number: pair('chapterNum'), title: pair('chapterTitle'), region: pair('chapterImageTitle') },
    stats: { quests: quests.length, scenes: allScenes.length, lines: allLines.length, missingPairs: allLines.filter((line) => !line.text.zh || !line.text.en).length },
    quests,
  }
}

export async function onRequestGet(context) {
  const id = String(context.params.id || '')
  if (!/^\d{2,6}$/.test(id)) return Response.json({ error: 'Invalid quest id' }, { status: 400 })
  try {
    const cache = caches.default
    const cacheKey = new Request(context.request.url, context.request)
    const hit = await cache.match(cacheKey)
    if (hit) return hit
    const [zh, en] = await Promise.all([fetchLanguage('CHS', id), fetchLanguage('EN', id)])
    if (!zh && !en) return Response.json({ error: 'Quest not found upstream' }, { status: 404 })
    const response = Response.json(normalize(zh, en, id), {
      headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=604800', 'X-Data-Source': 'Project-Amber' },
    })
    context.waitUntil(cache.put(cacheKey, response.clone()))
    return response
  } catch (error) {
    return Response.json({ error: 'Upstream data is temporarily unavailable', detail: String(error?.message || error) }, { status: 502 })
  }
}
