const ROOT = 'https://gi.yatta.moe/api/v2'
const clean = (value = '') => String(value || '').replace(/\$(?:HIDDEN|UNRELEASED)/g, '').trim()
const nationFor = (item) => {
  const hint = `${item.chapterIcon || ''} ${item.chapterImageTitle || ''} ${item.chapterTitle || ''}`.toLowerCase()
  const rules = [['mondstadt',/mengde|mondstadt|dragonspine|fleurfair|goldenapple|aster/],['liyue',/liyue|sealam|chasm|firmament|lantern|moonchase/],['inazuma',/inazuma|irodori|mikawa|onmyo|enkanomiya/],['sumeru',/sumeru|deshret|fungus|aranara/],['fontaine',/fontaine|meropide|remuria/],['natlan',/natlan|easybreeze/],['nodkrai',/nodkrai|nod-krai|nasha/],['snezhnaya',/snezhnaya|zapolyarny/],['traveler',/traveler|journey|dainsleif|khaenri|common/]]
  return rules.find(([, pattern]) => pattern.test(hint))?.[0] || 'unknown'
}

async function get(path) {
  const refreshWindow = Math.floor(Date.now() / 21600000)
  const response = await fetch(`${ROOT}/${path}?catalog=${refreshWindow}`, { headers: { 'user-agent': 'Teyvat-Scriptorium/0.3 live catalog' } })
  if (!response.ok) throw new Error(`${path}: ${response.status}`)
  const payload = await response.json()
  if (payload.response !== 200 || !payload.data) throw new Error(`${path}: invalid payload`)
  return payload.data
}

export async function onRequestGet({ request }) {
  const cache = caches.default
  const cacheKey = new Request(new URL('/api/catalog?schema=3', request.url), request)
  const cached = await cache.match(cacheKey)
  if (cached) return cached
  try {
    const [zhPayload, enPayload, changelog] = await Promise.all([get('CHS/quest'), get('EN/quest'), get('static/changelog')])
    const zhItems = zhPayload.items || {}; const enItems = enPayload.items || {}; const versionById = new Map()
    for (const [rawVersion, release] of Object.entries(changelog)) for (const id of release.items?.quest || []) versionById.set(String(id), `${rawVersion[0]}.${rawVersion.slice(1)}`)
    const ids = [...new Set([...Object.keys(zhItems), ...Object.keys(enItems)])]
    const items = ids.map((id) => {
      const zh = zhItems[id]; const en = enItems[id]; const base = zh || en; const version = versionById.get(id) || null; const nation = nationFor(base)
      return { id:Number(id),type:base.type || 'other',title:{zh:clean(zh?.chapterTitle)||clean(en?.chapterTitle)||`任务 ${id}`,en:clean(en?.chapterTitle)||clean(zh?.chapterTitle)||`Quest ${id}`},chapter:{zh:clean(zh?.chapterNum),en:clean(en?.chapterNum)},imageTitle:{zh:zh?.chapterImageTitle||'',en:en?.chapterImageTitle||''},route:en?.route||zh?.route||'',chapterCount:Math.max(zh?.chapterCount||0,en?.chapterCount||0),icon:base.chapterIcon||null,nation,nationSource:nation==='unknown'?'unknown':'title-inference',version,versionSource:version?'yatta-changelog':'unknown',versionGroup:version?.split('.')[0]||'unknown',wikiPage:null,hidden:String(zh?.chapterTitle||en?.chapterTitle||'').includes('$HIDDEN'),unreleased:String(zh?.chapterTitle||en?.chapterTitle||'').includes('$UNRELEASED'),languages:{zh:Boolean(zh),en:Boolean(en)}}
    }).sort((a,b)=>b.id-a.id)
    const types = [...new Set(items.map((item)=>item.type))]; const nations = [...new Set(items.map((item)=>item.nation))]
    const body = JSON.stringify({ schemaVersion:3,generatedAt:new Date().toISOString(),source:'Project Amber / Yatta · live',versionCoverage:{exactFrom:'3.6',note:'已在后台检查最新中英任务索引；早期版本与地区继续沿用本站已核实元数据。'},versions:[...new Set(items.map((item)=>item.version).filter(Boolean))].sort((a,b)=>Number(b.replace('.',''))-Number(a.replace('.',''))),counts:{total:items.length,byType:Object.fromEntries(types.map((type)=>[type,items.filter((item)=>item.type===type).length])),byNation:Object.fromEntries(nations.map((nation)=>[nation,items.filter((item)=>item.nation===nation).length]))},items })
    const response = new Response(body, { headers: { 'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=900, s-maxage=21600','x-catalog-source':'live-yatta' } })
    await cache.put(cacheKey, response.clone())
    return response
  } catch (error) {
    return Response.json({ error:'live catalog unavailable', detail:String(error) }, { status:502, headers:{'cache-control':'no-store'} })
  }
}
