const API_ROOT = 'https://gi.yatta.moe/api/v2'
const SUPPORTED = new Set(['CHS','CHT','EN','JP','KR','DE','ES','FR','ID','PT','RU','TH','VI','IT','TR'])
const values = (object) => object ? Object.values(object) : []
const clean = (text = '') => String(text || '').replace(/\$(?:HIDDEN|UNRELEASED)/g, '').trim()
const findById = (collection, id) => values(collection).find((item) => String(item?.id) === String(id))

async function fetchLanguage(lang, id) {
  const response = await fetch(`${API_ROOT}/${lang}/quest/${id}`, { headers: { 'user-agent': 'Teyvat-Scriptorium/0.4' } })
  if (!response.ok) return null
  const payload = await response.json()
  return payload.response === 200 ? payload.data : null
}

function localized(translations, fallback = '') {
  const first = Object.values(translations).find(Boolean) || fallback
  return { zh: translations.CHS || first, en: translations.EN || first, translations }
}

function normalize(dataByLang, id, languages) {
  const primaryLang = dataByLang.CHS ? 'CHS' : languages.find((lang) => dataByLang[lang])
  const primary = dataByLang[primaryLang]
  const primaryQuests = values(primary.storyList)
  const quests = primaryQuests.map((quest, questIndex) => {
    const questByLang = Object.fromEntries(languages.map((lang) => [lang, findById(dataByLang[lang]?.storyList, quest.id) || values(dataByLang[lang]?.storyList)[questIndex]]))
    const scenes = values(quest.story).map((step) => {
      const stepByLang = Object.fromEntries(languages.map((lang) => [lang, findById(questByLang[lang]?.story, step.id)]))
      const primaryTasks = values(step.taskData)
      const lines = []
      primaryTasks.forEach((task, taskIndex) => {
        if (!task?.items) return
        Object.entries(task.items).forEach(([itemId, item]) => {
          const itemByLang = Object.fromEntries(languages.map((lang) => {
            const otherTask = values(stepByLang[lang]?.taskData)[taskIndex]
            return [lang, otherTask?.items?.[itemId]]
          }))
          const maxVariants = Math.max(...languages.map((lang) => values(itemByLang[lang]?.text).length), 0)
          for (let variant = 0; variant < maxVariants; variant += 1) {
            const textMap = Object.fromEntries(languages.map((lang) => [lang, values(itemByLang[lang]?.text)[variant]?.text || '']))
            if (!Object.values(textMap).some(Boolean)) continue
            const roleMap = Object.fromEntries(languages.map((lang) => [lang, itemByLang[lang]?.role || (lang === 'CHS' ? '旅行者' : lang === 'EN' ? 'Traveler' : '')]))
            // Only MultiDialog records are actual mutually-exclusive player choices.
            // A role-less SingleDialog is usually Traveler internal monologue, not a branch.
            const choice = item.type === 'MultiDialog' && maxVariants > 1
            const next = values(itemByLang[primaryLang]?.text)[variant]?.next
            lines.push({
              key: `${step.id}-${taskIndex}-${itemId}-${variant}`,
              nodeId: itemId,
              variant,
              kind: item.isBlackScreen ? 'narration' : choice ? 'choice' : 'dialogue',
              sourceType: item.type || '',
              nextNodeId: next === undefined || next === null ? '' : String(next),
              speaker: localized(roleMap, 'Traveler'),
              text: localized(textMap),
            })
          }
        })
      })
      const titleMap = Object.fromEntries(languages.map((lang) => [lang, clean(stepByLang[lang]?.title)]))
      const descriptionMap = Object.fromEntries(languages.map((lang) => [lang, stepByLang[lang]?.stepDescription || '']))
      return { key: `${quest.id}-${step.id}`, id: step.id, hidden: Boolean(step.isHidden), title: localized(titleMap, 'Untitled scene'), description: localized(descriptionMap), lines }
    }).filter((scene) => scene.lines.length)
    const titleMap = Object.fromEntries(languages.map((lang) => [lang, questByLang[lang]?.info?.title || '']))
    const descriptionMap = Object.fromEntries(languages.map((lang) => [lang, questByLang[lang]?.info?.description || '']))
    return { id: quest.id, order: questIndex + 1, title: localized(titleMap), description: localized(descriptionMap), scenes }
  })
  const infoMap = (field) => localized(Object.fromEntries(languages.map((lang) => [lang, dataByLang[lang]?.info?.[field] || ''])))
  const allScenes = quests.flatMap((quest) => quest.scenes)
  const allLines = allScenes.flatMap((scene) => scene.lines)
  return {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    languages,
    source: { primary: 'Project Amber / Yatta', url: `https://gi.yatta.moe/en/archive/quest/${id}`, verification: `https://gensh.honeyhunterworld.com/ch_${id}/?lang=EN` },
    chapter: { id: Number(id), number: infoMap('chapterNum'), title: infoMap('chapterTitle'), region: infoMap('chapterImageTitle') },
    stats: { quests: quests.length, scenes: allScenes.length, lines: allLines.length, missingPairs: allLines.filter((line) => languages.some((lang) => !line.text.translations?.[lang])).length },
    quests,
  }
}

export async function onRequestGet(context) {
  const id = String(context.params.id || '')
  if (!/^\d{2,6}$/.test(id)) return Response.json({ error: 'Invalid quest id' }, { status: 400 })
  const url = new URL(context.request.url)
  const requested = (url.searchParams.get('langs') || 'CHS,EN').split(',').map((lang) => lang.toUpperCase()).filter((lang, index, list) => SUPPORTED.has(lang) && list.indexOf(lang) === index).slice(0, 3)
  const languages = requested.length ? requested : ['CHS','EN']
  try {
    const cache = caches.default
    const cacheKey = new Request(`${url.origin}${url.pathname}?langs=${languages.join(',')}`, context.request)
    const hit = await cache.match(cacheKey)
    if (hit) return hit
    const payloads = await Promise.all(languages.map((lang) => fetchLanguage(lang, id)))
    const dataByLang = Object.fromEntries(languages.map((lang, index) => [lang, payloads[index]]))
    if (!payloads.some(Boolean)) return Response.json({ error: 'Quest not found upstream' }, { status: 404 })
    const response = Response.json(normalize(dataByLang, id, languages), { headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=604800', 'X-Data-Source': 'Project-Amber' } })
    context.waitUntil(cache.put(cacheKey, response.clone()))
    return response
  } catch (error) {
    return Response.json({ error: 'Upstream data is temporarily unavailable', detail: String(error?.message || error) }, { status: 502 })
  }
}
