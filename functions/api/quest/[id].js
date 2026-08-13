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

function extractHoneyBlocks(html) {
  const marker = 'dialog_data.push('
  const blocks = []
  let cursor = 0
  while ((cursor = html.indexOf(marker, cursor)) >= 0) {
    const start = cursor + marker.length
    let depth = 0
    let inString = false
    let escaped = false
    let end = -1
    for (let index = start; index < html.length; index += 1) {
      const char = html[index]
      if (inString) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') inString = false
        continue
      }
      if (char === '"') inString = true
      else if (char === '{') depth += 1
      else if (char === '}' && --depth === 0) {
        end = index + 1
        break
      }
    }
    if (end > start) {
      try { blocks.push(JSON.parse(html.slice(start, end))) } catch { /* malformed upstream block */ }
      cursor = end
    } else break
  }
  return blocks
}

async function fetchHoneyLanguage(lang, questId) {
  const response = await fetch(`https://gensh.honeyhunterworld.com/q_${questId}/?lang=${lang}`, {
    headers: { 'user-agent': 'Teyvat-Scriptorium/0.8 (+non-commercial bilingual reader)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) return null
  const blocks = extractHoneyBlocks(await response.text())
  if (!blocks.length) return null
  const nodes = new Map()
  blocks.forEach((block) => Object.entries(block.dialogues || {}).forEach(([nodeId, node]) => nodes.set(String(nodeId), node)))
  return nodes
}

async function applyHoneyGraph(data, languages) {
  const results = await Promise.all(data.quests.flatMap((quest) => languages.map(async (lang) => ({
    questId: quest.id,
    lang,
    nodes: await fetchHoneyLanguage(lang, quest.id).catch(() => null),
  }))))
  const maps = new Map(results.filter((entry) => entry.nodes).map((entry) => [`${entry.questId}:${entry.lang}`, entry.nodes]))
  let matched = 0
  data.quests.forEach((quest) => quest.scenes.forEach((scene) => scene.lines.forEach((line) => {
    languages.forEach((lang) => {
      const nodes = maps.get(`${quest.id}:${lang}`)
      if (!nodes) return
      const targetId = line.nodeId.endsWith('-player') ? line.nextNodeId : line.nodeId
      const node = nodes.get(String(targetId))
      if (!node?.line) return
      line.text.translations[lang] = node.line
      if (lang === 'CHS') line.text.zh = node.line
      if (lang === 'EN') line.text.en = node.line
      if (node.from) {
        const role = lang === 'CHS' && node.from === 'Traveler' ? '旅行者' : node.from
        line.speaker.translations[lang] = role
        if (lang === 'CHS') line.speaker.zh = role
        if (lang === 'EN') line.speaker.en = role
      }
      if (!line.nodeId.endsWith('-player') && Array.isArray(node.next)) {
        line.nextNodeIds = node.next.map(String)
        line.nextNodeId = line.nextNodeIds[0] || ''
      }
      matched += 1
    })
  })))
  return { matched, requested: data.quests.length * languages.length, available: maps.size }
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
    source: { primary: 'Project Amber / Yatta', url: `https://gi.yatta.moe/chs/archive/quest/${id}`, verification: `https://gensh.honeyhunterworld.com/ch_${id}/?lang=CHS` },
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
  const requestedSource = url.searchParams.get('source') || 'auto'
  const source = ['auto','yatta','honey'].includes(requestedSource) ? requestedSource : 'auto'
  try {
    const cache = caches.default
    const cacheKey = new Request(`${url.origin}${url.pathname}?langs=${languages.join(',')}&source=${source}&graph=3`, context.request)
    const hit = await cache.match(cacheKey)
    if (hit) return hit
    const payloads = await Promise.all(languages.map((lang) => fetchLanguage(lang, id)))
    const dataByLang = Object.fromEntries(languages.map((lang, index) => [lang, payloads[index]]))
    if (!payloads.some(Boolean)) return Response.json({ error: 'Quest not found upstream' }, { status: 404 })
    const data = normalize(dataByLang, id, languages)
    data.source.strategy = source
    let headerSource = 'Project-Amber'
    if (source !== 'yatta') {
      // In automatic mode Honey is used for its graph, which is language-independent.
      // Fetching every display language doubled/tripled first-open latency without adding edges.
      const honeyLanguages = source === 'honey'
        ? languages
        : [languages.includes('CHS') ? 'CHS' : languages[0]]
      const honey = await applyHoneyGraph(data, honeyLanguages)
      if (honey.matched) {
        data.source.primary = source === 'honey' ? 'Honey Hunter World（Yatta 补全元数据）' : 'Project Amber / Yatta + Honey Hunter World'
        data.source.notice = `Honey 已匹配 ${honey.matched} 个语言节点；章节目录、标题及 Honey 未覆盖的内容由 Yatta 补全。`
        headerSource = source === 'honey' ? 'Honey-Hunter+Project-Amber' : 'Project-Amber+Honey-Hunter'
      } else {
        data.source.notice = 'Honey 当前未能返回可匹配节点，本次已明确回退到 Project Amber / Yatta。'
      }
    } else data.source.notice = '仅使用 Project Amber / Yatta 的结构化多语言接口。'
    const response = Response.json(data, { headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=604800', 'X-Data-Source': headerSource } })
    context.waitUntil(cache.put(cacheKey, response.clone()))
    return response
  } catch (error) {
    return Response.json({ error: 'Upstream data is temporarily unavailable', detail: String(error?.message || error) }, { status: 502 })
  }
}
