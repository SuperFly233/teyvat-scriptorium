import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpenText, Check, CheckSquare2, ChevronDown, ChevronsUpDown, CircleCheck, Clock3,
  Eraser, FileDown, FileText, Filter, GitFork, GripVertical, Info, Languages, LibraryBig, ListFilter, MousePointer2,
  LoaderCircle, Menu, Moon, Plus, Printer, RotateCcw, Search,
  Settings, ShoppingBasket, Snowflake, Square, Sun, Trash2, X, ZoomIn, ZoomOut,
} from 'lucide-react'
import { filterScenes } from './lib/filter'
import { buildPrintMeta } from './lib/printMeta'
import { formatGameText, normalizeSearch } from './lib/text'
import type {
  AppSettings, CatalogData, CatalogItem, ChapterData, DialogueLine, LanguageCode, LanguagePair, PrintBundle, PrintSettings, PrintSlot,
  Quest, Scene, Traveler, ViewMode,
} from './types'

const TYPE_NAMES: Record<string, string> = {
  aq: '魔神任务', wq: '世界任务', lq: '角色任务', eq: '活动任务', iq: '每日委托', other: '其他',
}
const NATION_NAMES: Record<string, string> = {
  mondstadt: '蒙德', liyue: '璃月', inazuma: '稻妻', sumeru: '须弥', fontaine: '枫丹',
  natlan: '纳塔', nodkrai: '挪德卡莱', snezhnaya: '至冬', traveler: '旅行者篇', unknown: '地区未标注',
}
const LANGUAGE_OPTIONS: { code: LanguageCode; short: string; label: string; locale: string }[] = [
  { code:'CHS', short:'简', label:'简体中文', locale:'zh-CN' }, { code:'CHT', short:'繁', label:'繁體中文', locale:'zh-TW' },
  { code:'EN', short:'EN', label:'English', locale:'en' }, { code:'JP', short:'日', label:'日本語', locale:'ja' }, { code:'KR', short:'한', label:'한국어', locale:'ko' },
  { code:'DE', short:'DE', label:'Deutsch', locale:'de' }, { code:'ES', short:'ES', label:'Español', locale:'es' }, { code:'FR', short:'FR', label:'Français', locale:'fr' },
  { code:'ID', short:'ID', label:'Bahasa Indonesia', locale:'id' }, { code:'PT', short:'PT', label:'Português', locale:'pt' }, { code:'RU', short:'RU', label:'Русский', locale:'ru' },
  { code:'TH', short:'TH', label:'ไทย', locale:'th' }, { code:'VI', short:'VI', label:'Tiếng Việt', locale:'vi' }, { code:'IT', short:'IT', label:'Italiano', locale:'it' }, { code:'TR', short:'TR', label:'Türkçe', locale:'tr' },
]
const VIEW_OPTIONS: { id: ViewMode; label: string }[] = [
  { id: 'parallel', label: '并列阅读' }, { id: 'stacked', label: '上下阅读' }, { id: 'compact', label: '台词表' },
]
const languageInfo = (code: LanguageCode) => LANGUAGE_OPTIONS.find((item) => item.code === code) || LANGUAGE_OPTIONS[0]
const localized = (value: LanguagePair, code: LanguageCode) => value.translations?.[code] || (code === 'CHS' ? value.zh : code === 'EN' ? value.en : '') || value.zh || value.en
const lineSignature = (line: DialogueLine) => `${line.text.zh}\u0000${line.text.en}`
const normalizeChapterData = (data: ChapterData): ChapterData => ({ ...data, quests:data.quests.map((quest) => ({ ...quest, scenes:quest.scenes.map((scene) => {
  const canonicalChoices = new Set(scene.lines.filter((line) => line.kind === 'choice' && !line.nodeId.endsWith('-player')).map(lineSignature))
  const looksNarration = (line:DialogueLine) => /^(You |After you |Time flies|After a lovely|Meanwhile|Later,|Following )/i.test(line.text.en) || /^(在.+…|顺利|与朋友享用|将欢笑|在屋中)/.test(line.text.zh)
  return { ...scene, lines:scene.lines.filter((line) => !(line.nodeId.endsWith('-player') && canonicalChoices.has(lineSignature(line)))).map((line) => line.kind === 'narration' || (line.kind === 'choice' && looksNarration(line)) ? { ...line, kind:'narration' as const, speaker:{ zh:'', en:'', translations:{} } } : line) }
}) })) })
const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light', viewMode: 'parallel', zhSize: 20, enSize: 20, lineHeight: 1.5, columnRatio: 50,
  showHidden: false, showUnreleased: false, compactMobile: true, languages: ['CHS','EN'], fontFamily: 'serif', languageWidths:[50,50],
  guideCatalog:true, guideReader:true, guideScenes:true,
}
const DEFAULT_PRINT: PrintSettings = {
  layout: 'parallel', density: 'compact', paper: 'a4', orientation: 'portrait', fontSize: 9,
  margin: 12, color: 'accent', cover: true, sceneTitles: true, speakers: true, lineNumbers: true, columnRatio: 50,
  speakerLayout:'column', speakerSize:7, speakerWidth:14, numberSize:6, sceneTitleSize:9, coverTitleSize:15, lineGap:1, sceneGap:1.5,
  bands: {
    header: [{ id: 'hl', content: 'chapter', custom: '' }, { id: 'hc', content: 'quest', custom: '' }, { id: 'hr', content: 'printedAt', custom: '' }],
    footer: [{ id: 'fl', content: 'version', custom: '' }, { id: 'fc', content: 'none', custom: '' }, { id: 'fr', content: 'page', custom: '' }],
  },
}
const APP_VERSION = 'v0.5.0'

function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { return { ...initial as object, ...JSON.parse(localStorage.getItem(key) || '{}') } as T } catch { return initial }
  })
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)) }, [key, value])
  return [value, setValue] as const
}

function useSessionState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { return JSON.parse(sessionStorage.getItem(key) || '') as T } catch { return initial }
  })
  useEffect(() => {
    try { sessionStorage.setItem(key, JSON.stringify(value)) } catch { /* a very large basket remains available in memory */ }
  }, [key, value])
  return [value, setValue] as const
}

function useData() {
  const [catalog, setCatalog] = useState<CatalogData | null>(null)
  const [chapter, setChapter] = useState<ChapterData | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadProgress, setLoadProgress] = useState({ value: 0, label: '正在连接剧情资料源…' })
  const [error, setError] = useState('')
  const [catalogSync, setCatalogSync] = useState({ checking: true, added: 0, modified: 0, checkedAt: '' })
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const staticCatalog = await fetch('/data/catalog.json', { cache: 'no-store' }).then((response) => response.json()) as CatalogData
        if (cancelled) return
        setCatalog(staticCatalog)
        try {
          const live = await fetch('/api/catalog', { cache: 'no-store' }).then((response) => { if (!response.ok) throw new Error(String(response.status)); return response.json() }) as CatalogData
          if (cancelled) return
          const savedById = new Map(staticCatalog.items.map((item) => [item.id, item]))
          let added = 0; let modified = 0
          const items = live.items.map((item) => {
            const saved = savedById.get(item.id)
            if (!saved) { added++; return item }
            if (saved.title.zh !== item.title.zh || saved.title.en !== item.title.en || saved.chapterCount !== item.chapterCount) modified++
            return { ...saved, ...item, nation: item.nation === 'unknown' ? saved.nation : item.nation, nationSource: item.nation === 'unknown' ? saved.nationSource : item.nationSource, version: item.version || saved.version, versionSource: item.version ? item.versionSource : saved.versionSource, wikiPage: saved.wikiPage }
          })
          const itemIds = new Set(items.map((item) => item.id)); staticCatalog.items.filter((item) => !itemIds.has(item.id)).forEach((item) => items.push(item))
          const types = [...new Set(items.map((item) => item.type))]; const nations = [...new Set(items.map((item) => item.nation))]
          setCatalog({ ...live, items, versions: [...new Set(items.map((item) => item.version).filter(Boolean) as string[])].sort((a,b) => Number(b.replace('.','')) - Number(a.replace('.',''))), counts: { total: items.length, byType: Object.fromEntries(types.map((type) => [type, items.filter((item) => item.type === type).length])), byNation: Object.fromEntries(nations.map((nation) => [nation, items.filter((item) => item.nation === nation).length])) } })
          setCatalogSync({ checking: false, added, modified, checkedAt: new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' }) })
        } catch { setCatalogSync({ checking: false, added: 0, modified: 0, checkedAt: '沿用本站快照' }) }
      } catch (e) { setError(String(e)); setCatalogSync((state) => ({ ...state, checking: false })) }
    }
    run(); return () => { cancelled = true }
  }, [])
  async function loadChapter(id: number, languages: LanguageCode[] = ['CHS','EN']) {
    setLoading(true); setError(''); setLoadProgress({ value: 4, label: '正在连接剧情资料源…' })
    try {
      const languageKey = languages.slice(0, 3).join(',')
      const cached = sessionStorage.getItem(`chapter:${id}:${languageKey}`)
      if (cached) { setChapter(normalizeChapterData(JSON.parse(cached))); return true }
      const url = id === 1700 && languageKey === 'CHS,EN' ? '/data/quest-1700.json' : `/api/quest/${id}?langs=${encodeURIComponent(languageKey)}`
      const response = await fetch(url)
      if (!response.ok) throw new Error(response.status === 404 ? '这个任务暂时没有可读取的正文。' : `正文载入失败（${response.status}）`)
      const total = Number(response.headers.get('content-length')) || 0
      let received = 0
      let data: ChapterData
      if (response.body) {
        const reader = response.body.getReader(); const chunks: Uint8Array[] = []
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value); received += value.length
          const percent = total ? Math.min(88, 8 + Math.round(received / total * 80)) : Math.min(88, 8 + Math.round(Math.log10(received + 1) * 13))
          setLoadProgress({ value: percent, label: `正在接收 ${languages.map((lang) => languageInfo(lang).short).join(' / ')} · ${(received / 1024).toFixed(0)} KB${total ? ` / ${(total / 1024).toFixed(0)} KB` : ''}` })
        }
        setLoadProgress({ value: 94, label: '正在整理场景、角色与台词…' })
        const bytes = new Uint8Array(received); let offset = 0
        chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.length })
        data = JSON.parse(new TextDecoder().decode(bytes)) as ChapterData
      } else data = await response.json() as ChapterData
      data = normalizeChapterData(data)
      setChapter(data)
      try { sessionStorage.setItem(`chapter:${id}:${languageKey}`, JSON.stringify(data)) } catch { /* large chapter; memory cache still works */ }
      return true
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); return false }
    finally { setLoading(false) }
  }
  return { catalog, catalogSync, chapter, setChapter, loadChapter, loading, loadProgress, error, setError }
}

function Header({ page, theme, onTheme, onCatalog, onSettings, onChangelog }: {
  page: 'catalog' | 'reader'; theme: string; onTheme: () => void; onCatalog: () => void; onSettings: () => void; onChangelog: () => void
}) {
  return <header className="site-header">
    <button className="brand" onClick={onCatalog} type="button"><span className="brand-seal"><Snowflake size={17} /></span><span><strong>提瓦特剧本室</strong></span></button>
    <nav className="header-nav">
      <button className={page === 'catalog' ? 'active' : ''} onClick={onCatalog}><LibraryBig size={16} />任务目录</button>
      <button onClick={onChangelog}><Clock3 size={16} />更新日志</button>
    </nav>
    <div className="header-actions">
      <button className="icon-button" onClick={onTheme} aria-label="切换主题">{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
      <button className="settings-button" onClick={onSettings}><Settings size={17} /><span>设置</span></button>
    </div>
  </header>
}

function Catalog({ data, settings, onOpen, sync, guideRequest }: { data: CatalogData; settings: AppSettings; onOpen: (item: CatalogItem) => void; sync: { checking: boolean; added: number; modified: number; checkedAt: string }; guideRequest:number }) {
  const [query, setQuery] = useSessionState('teyvat:catalog:query', '')
  const [type, setType] = useSessionState('teyvat:catalog:type', 'all')
  const [nation, setNation] = useSessionState('teyvat:catalog:nation', 'all')
  const [version, setVersion] = useSessionState('teyvat:catalog:version', 'all')
  const [sort, setSort] = useSessionState<'version' | 'nation' | 'type' | 'id'>('teyvat:catalog:sort', 'version')
  const [limit, setLimit] = useSessionState('teyvat:catalog:limit', 60)
  const [guideVisible, setGuideVisible] = useState(() => settings.guideCatalog && localStorage.getItem('teyvat:catalog-guide:v1') !== 'done')
  useEffect(() => { if (guideRequest) setGuideVisible(true) }, [guideRequest])
  useEffect(() => {
    const saved = Number(sessionStorage.getItem('teyvat:catalog:scroll') || 0)
    requestAnimationFrame(() => scrollTo(0, saved))
    return () => sessionStorage.setItem('teyvat:catalog:scroll', String(scrollY))
  }, [])
  const items = useMemo(() => {
    const needle = normalizeSearch(query)
    const list = data.items.filter((item) => {
      if (!settings.showHidden && item.hidden) return false
      if (!settings.showUnreleased && item.unreleased) return false
      if (type !== 'all' && item.type !== type) return false
      if (nation !== 'all' && item.nation !== nation) return false
      if (version !== 'all' && (version === 'unknown' ? item.version !== null : item.version !== version)) return false
      return !needle || normalizeSearch(`${item.title.zh}${item.title.en}${item.chapter.zh}${item.chapter.en}${item.id}`).includes(needle)
    })
    return list.sort((a, b) => {
      if (sort === 'nation') return a.nation.localeCompare(b.nation) || b.id - a.id
      if (sort === 'type') return a.type.localeCompare(b.type) || b.id - a.id
      if (sort === 'id') return b.id - a.id
      const av = a.version ? Number(a.version.replace('.', '')) : 0
      const bv = b.version ? Number(b.version.replace('.', '')) : 0
      return bv - av || b.id - a.id
    })
  }, [data, query, type, nation, version, sort, settings.showHidden, settings.showUnreleased])
  return <main className="catalog-page">
    <section className="catalog-hero">
      <div><span className="eyebrow">TEYVAT SCRIPTORIUM</span><h1>任务目录</h1></div>
    </section>
    <section className="catalog-controls">
      {guideVisible && <aside className="catalog-guide-board"><Info size={20} /><div><strong>从目录开始</strong><p>先按任务类型、地区或版本缩小范围，再打开任务阅读。进入正文后可以筛选角色、选择台词，并跨章节加入选稿池。</p></div><button onClick={() => { localStorage.setItem('teyvat:catalog-guide:v1','done'); setGuideVisible(false) }}><X size={16} />知道了</button></aside>}
      <label className="catalog-search"><Search size={18} /><input value={query} onChange={(e) => { setQuery(e.target.value); setLimit(60) }} placeholder="搜索任务" />{query && <button onClick={() => { setQuery(''); setLimit(60) }}><X size={15} /></button>}</label>
      <div className="filter-row">
        <SelectFilter icon={<BookOpenText size={14} />} value={type} onChange={(value) => { setType(value); setLimit(60) }} label="任务类型" options={[['all','全部类型'], ...Object.entries(TYPE_NAMES)]} />
        <SelectFilter icon={<Snowflake size={14} />} value={nation} onChange={(value) => { setNation(value); setLimit(60) }} label="国家地区" options={[['all','全部地区'], ...Object.entries(NATION_NAMES)]} />
        <SelectFilter icon={<Clock3 size={14} />} value={version} onChange={(value) => { setVersion(value); setLimit(60) }} label="版本" options={[['all','全部版本'], ...data.versions.map((v) => [v, `v${v}`]), ['unknown','待考证']]} />
        <SelectFilter icon={<ChevronsUpDown size={14} />} value={sort} onChange={(v) => { setSort(v as typeof sort); setLimit(60) }} label="排序" options={[["version","按版本"],["nation","按国家"],["type","按类型"],["id","按任务 ID"]]} />
        {(query || type !== 'all' || nation !== 'all' || version !== 'all') && <button className="reset-filters" onClick={() => { setQuery(''); setType('all'); setNation('all'); setVersion('all'); setLimit(60) }}><RotateCcw size={14} />重置</button>}
      </div>
      <div className="catalog-result-line"><span><strong>{items.length}</strong> 个任务</span><span>{sync.checking ? '检查更新中' : sync.added || sync.modified ? `新增 ${sync.added} · 修订 ${sync.modified}` : sync.checkedAt}</span></div>
    </section>
    <section className="catalog-grid">
      {items.slice(0, limit).map((item) => <button className="catalog-card" key={item.id} onClick={() => onOpen(item)}>
        <div className="card-top"><span className={`type-badge type-${item.type}`}>{TYPE_NAMES[item.type] || '其他'}</span><span className="version-badge">{item.version ? `v${item.version}` : '—'} · #{item.id}</span></div>
        <h2>{item.title.zh}</h2><h3>{item.title.en}</h3>
      </button>)}
    </section>
    {items.length > limit && <button className="load-more" onClick={() => setLimit((v) => v + 60)}>再显示 {Math.min(60, items.length - limit)} 个</button>}
    {!items.length && <Empty title="没有符合条件的任务" />}
  </main>
}

function SelectFilter({ icon, value, onChange, label, options }: { icon: React.ReactNode; value: string; onChange: (v: string) => void; label: string; options: string[][] }) {
  return <label className="select-filter">{icon}<span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([v,l]) => <option value={v} key={v}>{l}</option>)}</select><ChevronDown size={13} /></label>
}

function Empty({ title }: { title: string }) { return <div className="empty"><FileText size={28} /><h2>{title}</h2></div> }

function LanguagePicker({ value, onChange }: { value: LanguageCode[]; onChange: (languages: LanguageCode[]) => void }) {
  const toggle = (code: LanguageCode) => {
    if (value.includes(code)) { if (value.length > 1) onChange(value.filter((item) => item !== code)); return }
    if (value.length < 3) onChange([...value, code])
  }
  return <div className="language-picker"><div className="language-picked">{value.map((code, index) => <span key={code}><b>{index + 1}</b>{languageInfo(code).label}</span>)}</div><div className="language-list">{LANGUAGE_OPTIONS.map((language) => <label className={value.includes(language.code) ? 'active' : ''} key={language.code}><input type="checkbox" checked={value.includes(language.code)} disabled={!value.includes(language.code) && value.length >= 3} onChange={() => toggle(language.code)} /><span>{value.indexOf(language.code) + 1 || ''}</span><strong>{language.label}</strong><small>{language.code}</small></label>)}</div></div>
}

function Reader({ data, settings, setSettings, onBack, onQueue, onQueueChapter, onOpenBasket, basketSources, basketLines, guideRequest }: {
  data: ChapterData; settings: AppSettings; setSettings: (s: AppSettings) => void; onBack: () => void;
  onQueue: (selection: Set<string>, quest: Quest, scenes: Scene[]) => void; onQueueChapter:(data:ChapterData) => void; onOpenBasket: () => void; basketSources: number; basketLines: number; guideRequest: number
}) {
  const [questId, setQuestId] = useState(data.quests[0]?.id)
  const [sceneKeys, setSceneKeys] = useState<Set<string>>(new Set())
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [searchMode, setSearchMode] = useState<'locate' | 'filter'>('locate')
  const [matchIndex, setMatchIndex] = useState(0)
  const [traveler, setTraveler] = useState<Traveler>('aether')
  const [sceneOpen, setSceneOpen] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [roleFilterOpen, setRoleFilterOpen] = useState(false)
  const [languageOpen, setLanguageOpen] = useState(false)
  const [speakerKeys, setSpeakerKeys] = useState<Set<string>>(new Set())
  const [guideOpen, setGuideOpen] = useState(() => settings.guideReader !== false && localStorage.getItem('teyvat:reader-guide:v1') !== 'done')
  const [guideStep, setGuideStep] = useState(0)
  const scriptRef = useRef<HTMLDivElement>(null)
  const activeLanguages = (settings.languages?.length ? settings.languages : ['CHS','EN'] as LanguageCode[]).slice(0, 3)
  const equalWidths = Array(activeLanguages.length).fill(100 / activeLanguages.length)
  const languageWidths = settings.languageWidths?.length === activeLanguages.length ? settings.languageWidths : equalWidths
  const liveLanguageWidths = useRef(languageWidths)
  const activeQuest = data.quests.find((q) => q.id === questId) || data.quests[0]
  const speakerKey = (line: DialogueLine) => line.speaker.zh || line.speaker.en || '__narration'
  const availableSpeakers = useMemo(() => [...new Map(activeQuest.scenes.flatMap((scene) => scene.lines).map((line) => [speakerKey(line), { key: speakerKey(line), label: localized(line.speaker, activeLanguages[0]) || line.speaker.zh || '旁白', sub: localized(line.speaker, activeLanguages[1] || activeLanguages[0]) }])).values()].sort((a,b) => a.label.localeCompare(b.label)), [activeQuest, activeLanguages.join(',')])
  useEffect(() => {
    const keys = activeQuest.scenes.map((s) => s.key)
    setSceneKeys(new Set(keys))
    setSelectedLines(new Set())
    setSpeakerKeys(new Set(availableSpeakers.map((speaker) => speaker.key)))
    setQuery('')
  }, [activeQuest.id, availableSpeakers])
  useEffect(() => { if (guideRequest > 0) { setGuideStep(0); setGuideOpen(true) } }, [guideRequest])
  const speakerScenes = useMemo(() => activeQuest.scenes.map((scene) => ({ ...scene, lines: scene.lines.filter((line) => speakerKeys.has(speakerKey(line))) })), [activeQuest, speakerKeys])
  const baseScenes = useMemo(() => filterScenes(speakerScenes, sceneKeys, '', traveler), [speakerScenes, sceneKeys, traveler])
  const filteredScenes = useMemo(() => filterScenes(speakerScenes, sceneKeys, query, traveler), [speakerScenes, sceneKeys, query, traveler])
  const scenes = searchMode === 'filter' ? filteredScenes : baseScenes
  const matchKeys = useMemo(() => filteredScenes.flatMap((scene) => scene.lines.map((line) => line.key)), [filteredScenes])
  useEffect(() => setMatchIndex(0), [query, searchMode, activeQuest.id])
  useEffect(() => {
    if (searchMode !== 'locate' || !query || !matchKeys.length) return
    const key = matchKeys[Math.min(matchIndex, matchKeys.length - 1)]
    requestAnimationFrame(() => document.querySelector(`[data-line-key="${CSS.escape(key)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }, [matchIndex, matchKeys, query, searchMode])
  const visibleLineKeys = scenes.flatMap((s) => s.lines.map((l) => l.key))
  const selectedVisible = visibleLineKeys.filter((key) => selectedLines.has(key)).length
  const allVisibleSelected = Boolean(visibleLineKeys.length && selectedVisible === visibleLineKeys.length)
  const toggleLine = (key: string) => setSelectedLines((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next })
  const setVisible = (enabled: boolean) => setSelectedLines((current) => { const next = new Set(current); visibleLineKeys.forEach((key) => enabled ? next.add(key) : next.delete(key)); return next })
  const choiceSpeakerKeys = new Set(activeQuest.scenes.flatMap((scene) => scene.lines.filter((line) => line.kind === 'choice').map((line) => speakerKey(line))))
  const travelerSpeaker = availableSpeakers.find((speaker) => choiceSpeakerKeys.has(speaker.key))
    || availableSpeakers.find((speaker) => /旅行者|Traveler|旅人|여행자|Путешествен/i.test(speaker.key))
  const paimonSpeaker = availableSpeakers.find((speaker) => /派蒙|Paimon|Paimón|パイモン|페이몬|Паймон/i.test(speaker.key))
  const regularSpeakers = availableSpeakers.filter((speaker) => speaker !== travelerSpeaker && speaker !== paimonSpeaker)
  const toggleSpeaker = (key: string) => setSpeakerKeys((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next })
  const locateScene = (scene: Scene) => {
    setSceneKeys((current) => new Set(current).add(scene.key))
    setSceneOpen(false)
    const scrollToScene = () => requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = document.querySelector(`[data-scene-key="${CSS.escape(scene.key)}"]`)
      if (target) {
        const root = document.documentElement
        const previousBehavior = root.style.scrollBehavior
        root.style.scrollBehavior = 'auto'
        window.scrollTo(0, target.getBoundingClientRect().top + window.scrollY - (window.innerWidth <= 760 ? 160 : 145))
        root.style.scrollBehavior = previousBehavior
      }
    }))
    scrollToScene()
    void document.fonts.ready.then(scrollToScene)
    window.setTimeout(scrollToScene, 250)
    window.setTimeout(scrollToScene, 650)
  }
  const closeGuide = () => { localStorage.setItem('teyvat:reader-guide:v1', 'done'); setGuideOpen(false) }
  const applyReaderWidths = (widths: number[]) => {
    const script = scriptRef.current
    if (!script) return
    liveLanguageWidths.current = widths
    script.style.setProperty('--reader-columns', widths.map((width) => `minmax(0,${width}fr)`).join(' '))
    const content = script.querySelector('.utterances')?.getBoundingClientRect()
    const scriptBox = script.getBoundingClientRect()
    if (content) script.querySelectorAll<HTMLElement>('.reader-column-divider').forEach((divider, index) => divider.style.left = `${content.left - scriptBox.left + content.width * widths.slice(0,index + 1).reduce((a,b) => a + b,0) / 100}px`)
  }
  useEffect(() => {
    const widths = settings.languageWidths?.length === activeLanguages.length ? settings.languageWidths : equalWidths
    applyReaderWidths(widths)
    const observer = new ResizeObserver(() => applyReaderWidths(liveLanguageWidths.current))
    if (scriptRef.current) observer.observe(scriptRef.current)
    return () => observer.disconnect()
  }, [settings.languageWidths, settings.viewMode, activeLanguages.length, scenes.length])
  const resizeReaderColumns = (event: React.PointerEvent<HTMLButtonElement>, boundary: number) => {
    event.preventDefault()
    const startX = event.clientX
    const initial = [...liveLanguageWidths.current]
    const update = (clientX: number) => {
      const content = scriptRef.current?.querySelector('.utterances')?.getBoundingClientRect()
      if (!content) return
      const delta = (clientX - startX) / content.width * 100
      const next = [...initial]
      const applied = Math.max(15 - initial[boundary], Math.min(initial[boundary + 1] - 15, delta))
      next[boundary] = initial[boundary] + applied; next[boundary + 1] = initial[boundary + 1] - applied
      applyReaderWidths(next)
    }
    const move = (next: PointerEvent) => update(next.clientX)
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); setSettings({ ...settings, languageWidths:liveLanguageWidths.current, columnRatio:liveLanguageWidths.current[0] }) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }
  return <main className={`reader-page font-${settings.fontFamily || 'serif'} ${selectionMode ? 'selection-active' : ''}`} style={{ '--zh-size': `${settings.zhSize}px`, '--en-size': `${settings.enSize}px`, '--reader-leading': settings.lineHeight } as React.CSSProperties}>
    <div className="reader-topbar">
      <button className="back-button" onClick={onBack}><ArrowLeft size={17} /><span>目录</span></button>
      <div className="chapter-identity"><strong>{data.chapter.title.zh}</strong><span>{data.chapter.title.en}</span></div>
      <button className="mobile-scene-button" onClick={() => setSceneOpen(true)}><Menu size={17} />场景</button>
    </div>
    <div className="quest-tabs" role="tablist">{data.quests.map((q) => <button className={q.id === activeQuest.id ? 'active' : ''} onClick={() => setQuestId(q.id)} key={q.id}><span>{String(q.order).padStart(2,'0')}</span><strong>{localized(q.title, activeLanguages[0])}</strong>{activeLanguages[1] && <small>{localized(q.title, activeLanguages[1])}</small>}</button>)}<button className="quest-add-act" onClick={() => onQueueChapter(data)}><Plus size={15} /><strong>整幕加入选稿池</strong><small>{data.chapter.number.zh} · 全部 {data.quests.length} 个 Chapters</small></button></div>
    <section className="reader-intro">
      <div><span className="eyebrow">{localized(data.chapter.number, activeLanguages[0])} · {localized(data.chapter.region, activeLanguages[0])}</span><h1>{localized(activeQuest.title, activeLanguages[0])}</h1>{activeLanguages.slice(1).map((lang) => <h2 key={lang}>{localized(activeQuest.title, lang)}</h2>)}</div>
      <div className="intro-descriptions">{activeLanguages.map((lang) => localized(activeQuest.description, lang) && <p lang={languageInfo(lang).locale} key={lang}>{localized(activeQuest.description, lang)}</p>)}</div>
    </section>
    <div className="reader-workspace">
      <aside className={sceneOpen ? 'scene-panel open' : 'scene-panel'}>
        <div className="panel-heading"><div><strong>场景显示与定位</strong><small>{sceneKeys.size}/{activeQuest.scenes.length} 已显示 · 点击标题定位</small></div><button onClick={() => setSceneOpen(false)}><X size={18} /></button></div>
        <div className="panel-actions"><button onClick={() => setSceneKeys(new Set(activeQuest.scenes.map((s) => s.key)))}>全选</button><button onClick={() => setSceneKeys(new Set())}>清空</button></div>
        <div className="scene-list">{activeQuest.scenes.map((scene, index) => <div className={sceneKeys.has(scene.key) ? 'scene-list-row visible' : 'scene-list-row'} key={scene.key}><label title="显示或隐藏此场景"><input type="checkbox" checked={sceneKeys.has(scene.key)} onChange={() => setSceneKeys((current) => { const next = new Set(current); next.has(scene.key) ? next.delete(scene.key) : next.add(scene.key); return next })} /><span className="checkmark">{sceneKeys.has(scene.key) && <Check size={11} />}</span></label><span className="scene-num">{String(index + 1).padStart(2,'0')}</span><button className="scene-locate" onClick={() => locateScene(scene)}><strong>{localized(scene.title, activeLanguages[0])}</strong>{activeLanguages[1] && <small>{localized(scene.title, activeLanguages[1])}</small>}</button><em>{scene.lines.length}</em></div>)}</div>
      </aside>
      {sceneOpen && <button className="panel-scrim" onClick={() => setSceneOpen(false)} aria-label="关闭场景面板" />}
      <section className="script-column">
        <div className="reader-toolbar">
          <div className="view-pills">{VIEW_OPTIONS.map((v) => <button className={settings.viewMode === v.id ? 'active' : ''} onClick={() => setSettings({ ...settings, viewMode: v.id })} key={v.id}>{v.label}</button>)}</div>
          <div className="language-control"><button onClick={() => setLanguageOpen((value) => !value)}><Languages size={15} />{activeLanguages.map((lang) => languageInfo(lang).short).join(' · ')}<ChevronDown size={12} /></button>{languageOpen && <div className="language-popover"><header><strong>对照语言</strong><span>{activeLanguages.length}/3</span></header><LanguagePicker value={activeLanguages} onChange={(languages) => setSettings({ ...settings, languages })} /></div>}</div>
          <div className="search-tools"><label className="reader-search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && searchMode === 'locate' && matchKeys.length) setMatchIndex((value) => (value + 1) % matchKeys.length) }} placeholder="搜角色或台词" />{query && <button onClick={() => setQuery('')}><X size={13} /></button>}</label><select aria-label="搜索方式" value={searchMode} onChange={(e) => setSearchMode(e.target.value as 'locate' | 'filter')}><option value="locate">定位</option><option value="filter">筛选</option></select>{query && searchMode === 'locate' && <div className="match-nav"><span>{matchKeys.length ? matchIndex + 1 : 0}/{matchKeys.length}</span><button disabled={!matchKeys.length} onClick={() => setMatchIndex((value) => (value - 1 + matchKeys.length) % matchKeys.length)}><ArrowUp size={12} /></button><button disabled={!matchKeys.length} onClick={() => setMatchIndex((value) => (value + 1) % matchKeys.length)}><ArrowDown size={12} /></button></div>}</div>
          <div className="role-filter"><button className={speakerKeys.size < availableSpeakers.length ? 'filtered' : ''} onClick={() => setRoleFilterOpen((value) => !value)}><Filter size={14} />角色 {speakerKeys.size}/{availableSpeakers.length}<ChevronDown size={12} /></button>{roleFilterOpen && <div className="role-filter-popover"><header><strong>只显示这些角色</strong><button onClick={() => setRoleFilterOpen(false)}><X size={17} /></button></header><div className="featured-roles">{travelerSpeaker && <label><input type="checkbox" checked={speakerKeys.has(travelerSpeaker.key)} onChange={() => toggleSpeaker(travelerSpeaker.key)} /><span className="checkmark">{speakerKeys.has(travelerSpeaker.key) && <Check size={12} />}</span><div><strong>旅行者</strong><select value={traveler} onChange={(e) => setTraveler(e.target.value as Traveler)} onClick={(e) => e.stopPropagation()}><option value="aether">空 · Aether</option><option value="lumine">荧 · Lumine</option></select></div></label>}{paimonSpeaker && <label><input type="checkbox" checked={speakerKeys.has(paimonSpeaker.key)} onChange={() => toggleSpeaker(paimonSpeaker.key)} /><span className="checkmark">{speakerKeys.has(paimonSpeaker.key) && <Check size={12} />}</span><div><strong>{paimonSpeaker.label}</strong><small>{paimonSpeaker.sub}</small></div></label>}</div><div className="role-filter-actions"><span>其他角色</span><button onClick={() => setSpeakerKeys(new Set(availableSpeakers.map((speaker) => speaker.key)))}>全选</button><button onClick={() => setSpeakerKeys(new Set())}>清空</button></div><div className="role-filter-list">{regularSpeakers.map((speaker) => <label key={speaker.key}><input type="checkbox" checked={speakerKeys.has(speaker.key)} onChange={() => toggleSpeaker(speaker.key)} /><span className="checkmark">{speakerKeys.has(speaker.key) && <Check size={11} />}</span><span><strong>{speaker.label}</strong><small>{speaker.sub}</small></span></label>)}</div></div>}</div>
          <button className={selectionMode ? 'selection-toggle active' : 'selection-toggle'} onClick={() => setSelectionMode((v) => !v)}><MousePointer2 size={16} /><span>{selectionMode ? '退出选句' : '选择台词'}</span></button>
        </div>
        {selectionMode && <div className="selection-bar"><button className="selection-select-all" aria-pressed={allVisibleSelected} onClick={() => setVisible(!allVisibleSelected)}>{allVisibleSelected ? <CheckSquare2 size={19} /> : <Square size={19} />}<span>{allVisibleSelected ? '取消全选' : '全选'}</span></button><div className="selection-status"><span>当前已选</span><strong>{selectedVisible}</strong><span>共 {visibleLineKeys.length} 句</span></div><div className="selection-secondary"><button disabled={!selectedVisible} onClick={() => setVisible(false)}><Eraser size={16} />清空</button><button onClick={() => setSelectionMode(false)}><CircleCheck size={16} />完成</button></div><button className="queue-inline" disabled={!selectedVisible} onClick={() => onQueue(selectedLines, activeQuest, scenes)}><Plus size={18} /><span>加入选稿池</span></button></div>}
        <div ref={scriptRef} data-language-count={activeLanguages.length} className={`script script-${settings.viewMode} ${selectionMode ? 'is-selecting' : ''}`} style={{ '--reader-columns':languageWidths.map((width) => `minmax(0,${width}fr)`).join(' ') } as React.CSSProperties}>
          {settings.viewMode === 'parallel' && activeLanguages.length > 1 && activeLanguages.slice(0,-1).map((_, boundary) => <button key={boundary} className="reader-column-divider" onPointerDown={(event) => resizeReaderColumns(event,boundary)} onDoubleClick={() => { const equal = Array(activeLanguages.length).fill(100 / activeLanguages.length); applyReaderWidths(equal); setSettings({ ...settings, languageWidths:equal, columnRatio:equal[0] }) }} title="拖动调整相邻语言栏宽；双击恢复均分"><GripVertical size={14} /></button>)}
          <div className="script-meta"><span>{scenes.length} 个场景 · {visibleLineKeys.length} 句</span></div>
          {scenes.map((scene, sceneIndex) => <SceneBlock key={scene.key} scene={scene} sceneIndex={sceneIndex} mode={settings.viewMode} languages={activeLanguages} traveler={traveler} selected={selectedLines} toggle={toggleLine} selecting={selectionMode} query={searchMode === 'locate' ? query : ''} matches={new Set(matchKeys)} focusedKey={searchMode === 'locate' ? matchKeys[matchIndex] : undefined} showGuide={settings.guideScenes !== false} />)}
          {!scenes.length && <Empty title="没有可显示的台词" />}
        </div>
      </section>
    </div>
    <div className="basket-dock"><button disabled={!basketSources} onClick={onOpenBasket}><span className="basket-icon"><ShoppingBasket size={22} />{basketSources > 0 && <b>{basketSources}</b>}</span><span className="basket-copy"><strong>选稿池</strong><small>{basketSources ? `${basketSources} 个任务段 · ${basketLines} 句，点击整理` : '选中台词后加入这里'}</small></span><span className="basket-open">查看内容<ArrowRight size={17} /></span></button></div>
    {guideOpen && <ReaderGuide step={guideStep} onStep={setGuideStep} onClose={closeGuide} />}
  </main>
}

function SceneBlock({ scene, sceneIndex, mode, languages, traveler, selected, toggle, selecting, query, matches, focusedKey, showGuide }: { scene: Scene; sceneIndex: number; mode: ViewMode; languages: LanguageCode[]; traveler: Traveler; selected: Set<string>; toggle: (k: string) => void; selecting: boolean; query: string; matches: Set<string>; focusedKey?: string; showGuide:boolean }) {
  const guideKey = `teyvat:scene-guide:${scene.key}`
  const [tipVisible,setTipVisible] = useState(() => showGuide && sessionStorage.getItem(guideKey) !== 'done')
  const blocks: React.ReactNode[] = []
  let index = 0
  while (index < scene.lines.length) {
    const line = scene.lines[index]
    if (line.kind !== 'choice') {
      blocks.push(<DialogueRow key={line.key} line={line} index={index} mode={mode} languages={languages} traveler={traveler} checked={selected.has(line.key)} toggle={() => toggle(line.key)} selecting={selecting} query={query} match={!query || matches.has(line.key)} focused={line.key === focusedKey} />)
      index++; continue
    }
    const start = index; const choices: DialogueLine[] = []
    while (index < scene.lines.length && scene.lines[index].kind === 'choice') choices.push(scene.lines[index++])
    if (choices.length === 1) blocks.push(<DialogueRow key={choices[0].key} line={choices[0]} index={start} mode={mode} languages={languages} traveler={traveler} checked={selected.has(choices[0].key)} toggle={() => toggle(choices[0].key)} selecting={selecting} query={query} match={!query || matches.has(choices[0].key)} focused={choices[0].key === focusedKey} />)
    else blocks.push(<section className="choice-group" key={`choices:${line.key}`}><header><GitFork size={16} /><div><strong>旅行者选项</strong><small>{choices.length} 个可选说法 · 后续内容相同或归属未确认</small></div></header>{choices.map((choice, option) => <DialogueRow key={choice.key} line={choice} index={start + option} optionIndex={option} optionTotal={choices.length} mode={mode} languages={languages} traveler={traveler} checked={selected.has(choice.key)} toggle={() => toggle(choice.key)} selecting={selecting} query={query} match={!query || matches.has(choice.key)} focused={choice.key === focusedKey} />)}</section>)
    if (choices.length > 1 && index < scene.lines.length) blocks.push(<div className="common-story-marker" key={`common:${line.key}`}><span>以下为 {choices.length} 个选项的共通后续</span></div>)
  }
  return <section className="scene-block" data-scene-key={scene.key}><header><span>SCENE {String(sceneIndex + 1).padStart(2,'0')}</span><div><h3>{localized(scene.title, languages[0])}</h3>{languages.slice(1).map((lang) => <p title={localized(scene.title,lang)} key={lang}>{localized(scene.title, lang)}</p>)}</div><em>{scene.lines.length} 句</em></header>{tipVisible && <aside className="scene-lead"><Info size={14} /><div><strong>{scene.description.zh ? '本节提示' : '场景阅读提示'}</strong><p>{scene.description.zh ? localized(scene.description,languages[0]) : '选项会合并为分支组；未能由数据确认差异的后续内容统一标为“共通剧情”。'}</p></div><button aria-label="关闭本场景提示" onClick={() => { sessionStorage.setItem(guideKey,'done'); setTipVisible(false) }}><X size={14} /></button></aside>}{blocks}</section>
}

function HighlightText({ text, query }: { text: string; query: string }) { if (!query.trim()) return <>{text || '—'}</>; const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const parts = text.split(new RegExp(`(${escaped})`, 'ig')); return <>{parts.map((part, index) => part.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) ? <mark key={index}>{part}</mark> : part)}</> }
function DialogueRow({ line, index, optionIndex, optionTotal, mode, languages, traveler, checked, toggle, selecting, query, match, focused }: { line: DialogueLine; index: number; optionIndex?: number; optionTotal?:number; mode: ViewMode; languages: LanguageCode[]; traveler: Traveler; checked: boolean; toggle: () => void; selecting: boolean; query: string; match: boolean; focused: boolean }) {
  const activate = (event: React.MouseEvent | React.KeyboardEvent) => { if (!selecting || (event.target as HTMLElement).closest('button,select,input,a')) return; toggle() }
  return <article role={selecting ? 'checkbox' : undefined} aria-checked={selecting ? checked : undefined} tabIndex={selecting ? 0 : undefined} onClick={activate} onKeyDown={(event) => { if (selecting && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); toggle() } }} data-line-key={line.key} className={`dialogue-row kind-${line.kind} ${selecting && checked ? 'selected' : 'not-selected'} ${query && !match ? 'search-muted' : ''} ${focused ? 'search-focused' : ''}`}>
    <button className="line-select" disabled={!selecting} onClick={() => toggle()} aria-label={checked ? '从选稿移除' : '加入选稿'}><span>{selecting && checked && <Check size={11} />}</span><small>{optionIndex === undefined ? String(index + 1).padStart(2,'0') : `${optionIndex + 1}/${optionTotal}`}</small></button>
    <div className="dialogue-main"><div className="utterances" style={{ '--language-count': languages.length } as React.CSSProperties}>{languages.map((lang) => <div className="utterance" lang={languageInfo(lang).locale} key={lang}>{line.kind !== 'narration' && localized(line.speaker,lang) && <strong><HighlightText text={localized(line.speaker, lang)} query={query} /></strong>}<p><HighlightText text={formatGameText(localized(line.text, lang), traveler)} query={query} /></p></div>)}</div>{line.kind === 'narration' && <em className="choice-label">画面文字</em>}</div>
  </article>
}

const GUIDE_STEPS = [
  { selector: '.quest-tabs', title: '章节目录保持在顶部', text: '横向切换不同 chapter；滚动正文时目录会压缩为一条，不会长期占用大块高度。' },
  { selector: '.scene-panel', mobileSelector: '.mobile-scene-button', title: '显示与定位场景', text: '勾选框只控制场景是否显示；点击场景标题会直接定位到正文。' },
  { selector: '.role-filter', title: '筛选阅读内容', text: '角色筛选只改变当前看到的台词，不会自动加入或删除选稿。' },
  { selector: '.reader-column-divider', mobileSelector: '.view-pills', title: '调整双语栏宽', text: '桌面端拖动正文中间的短手柄即可调整中外文比例，双击恢复均分；手机端可改用上下阅读。' },
  { selector: '.selection-toggle', title: '进入选句模式', text: '进入后，每句左侧会出现明确复选框；只有复选框代表已选稿。' },
  { selector: '.basket-dock', title: '统一整理与打印', text: '底部选稿池始终可见；选好的内容可跨任务调整顺序后统一打印。' },
]

function ReaderGuide({ step, onStep, onClose }: { step: number; onStep: (step: number) => void; onClose: () => void }) {
  const current = GUIDE_STEPS[step]
  useEffect(() => {
    const selector = innerWidth <= 620 && current.mobileSelector ? current.mobileSelector : current.selector
    const target = document.querySelector(selector)
    target?.classList.add('guide-focus')
    return () => target?.classList.remove('guide-focus')
  }, [current])
  return <div className="reader-guide" role="dialog" aria-modal="true" aria-label="阅读操作引导"><section><span>操作引导 · {step + 1}/{GUIDE_STEPS.length}</span><h2>{current.title}</h2><p>{current.text}</p><div><button onClick={onClose}>跳过</button>{step > 0 && <button onClick={() => onStep(step - 1)}>上一步</button>}<button className="guide-next" onClick={() => step === GUIDE_STEPS.length - 1 ? onClose() : onStep(step + 1)}>{step === GUIDE_STEPS.length - 1 ? '知道了' : '下一步'}</button></div></section></div>
}

function SettingsSheet({ value, onChange, onClose, onGuide }: { value: AppSettings; onChange: (s: AppSettings) => void; onClose: () => void; onGuide: () => void }) {
  return <Modal title="阅读设置" eyebrow="SETTINGS" onClose={onClose}><div className="settings-list">
    <SettingRow title="界面主题"><div className="theme-cards">{([['light','浅色'],['dark','深色'],['auto','自动']] as const).map(([id,label]) => <button className={value.theme === id ? 'active' : ''} onClick={() => onChange({ ...value, theme:id })} key={id}><i className={`theme-preview ${id}`} /><span>{label}</span></button>)}</div></SettingRow>
    <SettingRow title="对照语言"><LanguagePicker value={value.languages || ['CHS','EN']} onChange={(languages) => onChange({ ...value, languages })} /></SettingRow>
    <SettingRow title="阅读版式"><Segment value={['parallel','stacked','compact'].includes(value.viewMode) ? value.viewMode : 'parallel'} onChange={(v) => onChange({ ...value, viewMode: v as ViewMode })} options={VIEW_OPTIONS.map((x) => [x.id,x.label])} /></SettingRow>
    <SettingRow title="字体"><Segment value={value.fontFamily || 'serif'} onChange={(v) => onChange({ ...value, fontFamily: v as AppSettings['fontFamily'] })} options={[["serif","宋体"],["sans","黑体"],["yahei","微软雅黑"]]} /></SettingRow>
    <SettingRow title={`正文字号 · ${value.zhSize}px`}><input type="range" min="18" max="32" value={value.zhSize} onChange={(e) => onChange({ ...value, zhSize: Number(e.target.value), enSize: Number(e.target.value) })} /></SettingRow>
    <SettingRow title={`行距 · ${value.lineHeight.toFixed(2)}`}><input type="range" min="1.25" max="1.8" step="0.05" value={value.lineHeight} onChange={(e) => onChange({ ...value, lineHeight: Number(e.target.value) })} /></SettingRow>
    <SettingRow title={`并列栏宽 · ${value.columnRatio ?? 50} / ${100 - (value.columnRatio ?? 50)}`}><div className="ratio-setting"><input type="range" min="25" max="75" value={value.columnRatio ?? 50} onChange={(e) => onChange({ ...value, columnRatio: Number(e.target.value) })} /><button onClick={() => onChange({ ...value, columnRatio: 50 })}><RotateCcw size={14} />恢复均分</button></div></SettingRow>
    <SettingRow title="隐藏内容"><Switch checked={value.showHidden} onChange={(v) => onChange({ ...value, showHidden: v })} /></SettingRow>
    <SettingRow title="未实装内容"><Switch checked={value.showUnreleased} onChange={(v) => onChange({ ...value, showUnreleased: v })} /></SettingRow>
    <SettingRow title="目录引导"><Switch checked={value.guideCatalog !== false} onChange={(v) => onChange({ ...value, guideCatalog:v })} /></SettingRow>
    <SettingRow title="任务操作引导"><Switch checked={value.guideReader !== false} onChange={(v) => onChange({ ...value, guideReader:v })} /></SettingRow>
    <SettingRow title="场景提示"><Switch checked={value.guideScenes !== false} onChange={(v) => onChange({ ...value, guideScenes:v })} /></SettingRow>
    <SettingRow title="再次触发引导"><button className="guide-replay" onClick={onGuide}>重置并立即查看</button></SettingRow>
    <button className="reset-settings" onClick={() => onChange(DEFAULT_SETTINGS)}><RotateCcw size={15} />恢复默认设置</button>
  </div></Modal>
}

function PrintStudio({ bundles, setBundles, languages, traveler = 'aether', settings, setSettings, onClose, onNotice }: { bundles: PrintBundle[]; setBundles: (bundles: PrintBundle[]) => void; languages: LanguageCode[]; traveler?: Traveler; settings: PrintSettings; setSettings: (s: PrintSettings) => void; onClose: () => void; onNotice: (message: string) => void }) {
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState({ value: 0, label: '' })
  const [printedAt] = useState(() => new Date().toLocaleString('zh-CN', { hour12: false }))
  const bands = settings.bands || DEFAULT_PRINT.bands
  const count = bundles.reduce((total, bundle) => total + bundle.scenes.reduce((n, scene) => n + scene.lines.length, 0), 0)
  const meta = buildPrintMeta(bundles)
  const applyPrintAttrs = () => {
    const root = document.documentElement
    root.dataset.printLayout = settings.layout; root.dataset.printDensity = settings.density; root.dataset.printColor = settings.color; root.dataset.printPaper = settings.paper; root.dataset.printOrientation = settings.orientation
    root.style.setProperty('--print-font', `${settings.fontSize}pt`); root.style.setProperty('--print-margin', `${settings.margin}mm`)
    const bandText = (zone: 'header' | 'footer', index: number) => {
      const slot = bands[zone][index]
      return slot.content === 'page' ? '' : slotText(slot, meta, printedAt)
    }
    delete root.dataset.printPageSlot
    for (const zone of ['header','footer'] as const) for (let index = 0; index < 3; index++) {
      const side = ['left','center','right'][index]
      const property = `--print-${zone}-${side}`
      const slot = bands[zone][index]
      if (slot.content === 'page') { root.style.removeProperty(property); root.dataset.printPageSlot = `${zone}-${side}` }
      else root.style.setProperty(property, JSON.stringify(bandText(zone, index)))
    }
  }
  const openNativePrint = async () => {
    if (!count) return
    setExporting(true); setExportProgress({ value: 18, label: '正在整理选稿池与排版设置…' }); applyPrintAttrs()
    try {
      setExportProgress({ value: 62, label: `正在准备 ${count} 句矢量文字与分页…` })
      await document.fonts.ready
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      setExportProgress({ value: 100, label: '正在打开系统打印面板…' })
      await new Promise((resolve) => setTimeout(resolve, 120))
      // The progress layer must be gone before Chromium snapshots the print tree.
      setExporting(false)
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      window.print()
      onNotice('可在系统面板中打印或保存为 PDF')
    } catch (error) {
      console.error(error)
      onNotice('打印稿准备失败，请稍后重试')
    } finally { setExporting(false) }
  }
  const moveBundle = (index: number, delta: number) => { const target = index + delta; if (target < 0 || target >= bundles.length) return; const next = [...bundles]; [next[index], next[target]] = [next[target], next[index]]; setBundles(next) }
  const applyDensity = (density: PrintSettings['density']) => setSettings({ ...settings, density, ...(density === 'comfortable' ? { fontSize:11, speakerSize:8, numberSize:6.5, lineGap:1.5, sceneGap:2.4 } : density === 'compact' ? { fontSize:9, speakerSize:7, numberSize:6, lineGap:1, sceneGap:1.5 } : { fontSize:7.5, speakerSize:6, numberSize:5, lineGap:.45, sceneGap:.8, margin:Math.max(10,settings.margin) }) })
  return <><Modal wide title="打印与 PDF 选稿台" eyebrow={`${bundles.length} SOURCES · ${count} LINES`} onClose={onClose}>
    <div className="print-studio"><section className="print-options-panel">
      <PrintGroup title="选稿池 · 可跨任务与章节"><div className="print-basket-list">{bundles.map((bundle, index) => <article key={bundle.key}><span>{String(index + 1).padStart(2,'0')}</span><div><strong>{bundle.quest.title.zh}</strong><small>{TYPE_NAMES[bundle.taskType || ''] || '剧情任务'} · {bundle.chapter.number.zh} · Chapter {bundle.quest.order} · {bundle.scenes.length} 场景 · {bundle.scenes.reduce((n, scene) => n + scene.lines.length, 0)} 句</small></div><button disabled={index === 0} onClick={() => moveBundle(index, -1)} aria-label="上移"><ArrowUp size={12} /></button><button disabled={index === bundles.length - 1} onClick={() => moveBundle(index, 1)} aria-label="下移"><ArrowDown size={12} /></button><button onClick={() => setBundles(bundles.filter((item) => item.key !== bundle.key))} aria-label="移除"><Trash2 size={12} /></button></article>)}</div></PrintGroup>
      <PrintGroup title="版式"><Segment value={['parallel','stacked'].includes(settings.layout) ? settings.layout : 'parallel'} onChange={(v) => setSettings({ ...settings, layout: v as PrintSettings['layout'] })} options={[["parallel","并列"],["stacked","上下"]]} /></PrintGroup>
      <PrintGroup title="密度预设"><Segment value={settings.density} onChange={(v) => applyDensity(v as PrintSettings['density'])} options={[["comfortable","一般 · 11pt"],["compact","紧凑 · 9pt"],["ultra","超紧凑 · 7.5pt"]]} /></PrintGroup>
      <PrintGroup title="说话人排版"><Segment value={settings.speakerLayout || 'column'} onChange={(v) => setSettings({ ...settings, speakerLayout:v as PrintSettings['speakerLayout'] })} options={[["column","独立窄列"],["inline","名字行内"]]} /></PrintGroup>
      <div className="print-grid"><PrintGroup title="纸张"><select value={settings.paper} onChange={(e) => setSettings({ ...settings, paper: e.target.value as PrintSettings['paper'] })}><option value="a4">A4</option><option value="a5">A5</option><option value="letter">Letter</option></select></PrintGroup><PrintGroup title="方向"><select value={settings.orientation} onChange={(e) => setSettings({ ...settings, orientation: e.target.value as PrintSettings['orientation'] })}><option value="portrait">纵向</option><option value="landscape">横向</option></select></PrintGroup></div>
      <PrintGroup title={`正文字号 · ${settings.fontSize}pt`}><input type="range" min="7" max="13" value={settings.fontSize} onChange={(e) => setSettings({ ...settings, fontSize: Number(e.target.value) })} /></PrintGroup>
      <PrintGroup title={`说话人字号 · ${settings.speakerSize ?? 7}pt`}><input type="range" min="5" max="12" step=".5" value={settings.speakerSize ?? 7} onChange={(e) => setSettings({ ...settings, speakerSize:Number(e.target.value) })} /></PrintGroup>
      {settings.speakerLayout === 'column' && <PrintGroup title={`说话人列宽 · ${settings.speakerWidth ?? 14}mm`}><input type="range" min="8" max="24" value={settings.speakerWidth ?? 14} onChange={(e) => setSettings({ ...settings, speakerWidth:Number(e.target.value) })} /></PrintGroup>}
      <PrintGroup title={`序号字号 · ${settings.numberSize ?? 6}pt`}><input type="range" min="4" max="10" step=".5" value={settings.numberSize ?? 6} onChange={(e) => setSettings({ ...settings, numberSize:Number(e.target.value) })} /></PrintGroup>
      <PrintGroup title={`场景标题 · ${settings.sceneTitleSize ?? 9}pt`}><input type="range" min="6" max="16" step=".5" value={settings.sceneTitleSize ?? 9} onChange={(e) => setSettings({ ...settings, sceneTitleSize:Number(e.target.value) })} /></PrintGroup>
      <PrintGroup title={`封面标题 · ${settings.coverTitleSize ?? 15}pt`}><input type="range" min="10" max="30" value={settings.coverTitleSize ?? 15} onChange={(e) => setSettings({ ...settings, coverTitleSize:Number(e.target.value) })} /></PrintGroup>
      <PrintGroup title={`行间距 · ${settings.lineGap ?? 1}mm`}><input type="range" min="0" max="4" step=".25" value={settings.lineGap ?? 1} onChange={(e) => setSettings({ ...settings, lineGap:Number(e.target.value) })} /></PrintGroup>
      <PrintGroup title={`场景间距 · ${settings.sceneGap ?? 1.5}mm`}><input type="range" min="0" max="8" step=".5" value={settings.sceneGap ?? 1.5} onChange={(e) => setSettings({ ...settings, sceneGap:Number(e.target.value) })} /></PrintGroup>
      <PrintGroup title={`安全页边距 · ${settings.margin}mm`}><input type="range" min="8" max="24" step="2" value={settings.margin} onChange={(e) => setSettings({ ...settings, margin: Number(e.target.value) })} /><small className={settings.margin < 10 ? 'margin-warning' : 'margin-safe'}>{settings.margin < 10 ? '部分打印机可能裁切页眉页脚' : '页眉、页脚位于安全区域内'}</small></PrintGroup>
      {settings.layout === 'parallel' && <PrintGroup title={`中外文栏宽 · ${settings.columnRatio ?? 50} / ${100 - (settings.columnRatio ?? 50)}`}><div className="ratio-setting"><input type="range" min="25" max="75" value={settings.columnRatio ?? 50} onChange={(e) => setSettings({ ...settings, columnRatio: Number(e.target.value) })} /><button onClick={() => setSettings({ ...settings, columnRatio: 50 })}><RotateCcw size={14} />恢复均分</button></div></PrintGroup>}
      <PrintGroup title="颜色"><Segment value={settings.color} onChange={(v) => setSettings({ ...settings, color: v as PrintSettings['color'] })} options={[["full","彩色"],["accent","省墨"],["mono","黑白"]]} /></PrintGroup>
      <div className="print-toggles"><ToggleLine label="封面" value={settings.cover} set={(v) => setSettings({ ...settings, cover: v })} /><ToggleLine label="场景标题" value={settings.sceneTitles} set={(v) => setSettings({ ...settings, sceneTitles: v })} /><ToggleLine label="说话人" value={settings.speakers} set={(v) => setSettings({ ...settings, speakers: v })} /><ToggleLine label="行号" value={settings.lineNumbers} set={(v) => setSettings({ ...settings, lineNumbers: v })} /></div>
      <PrintBandEditor bands={bands} onChange={(next) => setSettings({ ...settings, bands: next })} />
    </section><PrintPreview bundles={bundles} languages={languages} traveler={traveler} settings={settings} setSettings={setSettings} printedAt={printedAt} /></div>
    <div className="print-footer"><div><button className="secondary-action" onClick={openNativePrint} disabled={!count || exporting}><Printer size={16} />系统打印</button><button className="primary-action" onClick={openNativePrint} disabled={!count || exporting}>{exporting ? <LoaderCircle className="spin" size={16} /> : <FileDown size={16} />}{exporting ? '正在准备…' : '保存矢量 PDF'}</button></div></div>
  </Modal>{exporting && <div className="progress-overlay"><section><span>PRINT COMPOSITOR</span><LoaderCircle className="spin" size={28} /><h3>正在准备打印稿</h3><p>{exportProgress.label}</p><div className="progress-track"><i style={{ width: `${exportProgress.value}%` }} /></div><small>{exportProgress.value}%</small></section></div>}<div className="print-only-root"><PrintDocument bundles={bundles} languages={languages} traveler={traveler} settings={settings} printedAt={printedAt} /></div></>
}

function BasketSheet({ bundles, setBundles, onClose, onPrint }: { bundles:PrintBundle[]; setBundles:(next:PrintBundle[]) => void; onClose:() => void; onPrint:() => void }) {
  const [dragged,setDragged] = useState<number | null>(null)
  const drop = (target:number) => { if (dragged === null || dragged === target) return; const next=[...bundles]; const [item]=next.splice(dragged,1); next.splice(target,0,item); setBundles(next); setDragged(null) }
  return <Modal title="选稿池" eyebrow={`${bundles.length} SOURCES · ${bundles.reduce((n,b) => n + b.scenes.reduce((m,s) => m + s.lines.length,0),0)} LINES`} onClose={onClose}><div className="basket-sheet"><p className="basket-help"><Info size={15} />这里仅整理内容；确认顺序后再进入打印排版。按住左侧手柄可拖动任务段。</p><div className="basket-items">{bundles.map((bundle,index) => <article draggable onDragStart={() => setDragged(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => drop(index)} className={dragged === index ? 'dragging' : ''} key={bundle.key}><GripVertical size={19} /><span>{String(index + 1).padStart(2,'0')}</span><div><strong>{bundle.quest.title.zh}</strong><small>{TYPE_NAMES[bundle.taskType || ''] || '剧情任务'} · {bundle.chapter.number.zh} · Chapter {bundle.quest.order} · {bundle.scenes.length} 场景 · {bundle.scenes.reduce((n,s) => n + s.lines.length,0)} 句</small></div><button onClick={() => setBundles(bundles.filter((item) => item.key !== bundle.key))} aria-label="移除"><Trash2 size={17} /></button></article>)}</div><footer><button onClick={onClose}>继续选稿</button><button className="primary-action" disabled={!bundles.length} onClick={onPrint}><Printer size={16} />进入打印排版</button></footer></div></Modal>
}

function PrintPreview({ bundles, languages, traveler, settings, setSettings, printedAt }: { bundles: PrintBundle[]; languages: LanguageCode[]; traveler: Traveler; settings: PrintSettings; setSettings: (settings: PrintSettings) => void; printedAt: string }) {
  const contentRef = useRef<HTMLDivElement>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(1)
  const [zoom, setZoom] = useState(52)
  const dimensions = settings.paper === 'a5' ? [559,794] : settings.paper === 'letter' ? [816,1056] : [794,1123]
  const [pageWidth,pageHeight] = settings.orientation === 'landscape' ? [dimensions[1],dimensions[0]] : dimensions
  const marginPx = settings.margin * 96 / 25.4
  const printableWidth = Math.max(1, pageWidth - marginPx * 2)
  const printableHeight = Math.max(1, pageHeight - marginPx * 2)
  useEffect(() => {
    const measure = () => {
      const next = Math.max(1, Math.ceil((contentRef.current?.scrollHeight || printableHeight) / printableHeight))
      setPages(next); setPage((current) => Math.min(current, next - 1))
    }
    const frame = requestAnimationFrame(measure)
    const observer = new ResizeObserver(measure)
    if (contentRef.current) observer.observe(contentRef.current)
    void document.fonts.ready.then(measure)
    return () => { cancelAnimationFrame(frame); observer.disconnect() }
  }, [bundles, languages, settings, printableHeight])
  const resizePrintColumns = (event: React.PointerEvent<HTMLButtonElement>, half: 'full' | 'left' | 'right') => {
    event.preventDefault()
    const update = (clientX: number) => {
      const rect = paperRef.current?.getBoundingClientRect()
      if (!rect) return
      const normalized = (clientX - rect.left) / rect.width
      const raw = half === 'left' ? normalized * 200 : half === 'right' ? (normalized - .5) * 200 : normalized * 100
      setSettings({ ...settings, columnRatio: Math.round(Math.min(75,Math.max(25,raw))) })
    }
    const move = (next: PointerEvent) => update(next.clientX)
    const stop = () => { window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',stop) }
    update(event.clientX); window.addEventListener('pointermove',move); window.addEventListener('pointerup',stop)
  }
  const ratio = settings.columnRatio ?? 50
  const previewMeta = buildPrintMeta(bundles)
  const previewSlot = (slot: PrintSlot) => slot.content === 'page' ? `${page + 1} / ${pages}` : slotText(slot, previewMeta, printedAt)
  return <section className="print-preview-wrap">
    <div className="preview-label"><span>完整分页预览</span><em>{settings.paper.toUpperCase()} · {settings.density === 'ultra' ? '超紧凑四栏' : settings.density === 'compact' ? '紧凑' : '一般'}</em></div>
    <div className="preview-toolbar"><button disabled={page === 0} onClick={() => setPage((value) => value - 1)}><ArrowLeft size={15} />上一页</button><strong>{page + 1} / {pages}</strong><button disabled={page === pages - 1} onClick={() => setPage((value) => value + 1)}>下一页<ArrowRight size={15} /></button><span /><button onClick={() => setZoom((value) => Math.max(32,value - 10))}><ZoomOut size={15} /></button><em>{zoom}%</em><button onClick={() => setZoom((value) => Math.min(200,value + 10))}><ZoomIn size={15} /></button><button title="恢复中外文均分" onClick={() => setSettings({ ...settings, columnRatio:50 })}><RotateCcw size={15} /></button></div>
    <div className="preview-canvas"><div ref={paperRef} className="preview-paper" style={{ width: pageWidth * zoom / 100, height: pageHeight * zoom / 100 }}><div ref={contentRef} className="preview-document" style={{ width:printableWidth, left:marginPx * zoom / 100, top:marginPx * zoom / 100, transform:`scale(${zoom / 100}) translateY(-${page * printableHeight}px)` }}><PrintDocument bundles={bundles} languages={languages} traveler={traveler} settings={settings} printedAt={printedAt} /></div>{(['header','footer'] as const).map((zone) => <div className={`preview-running-band ${zone}`} key={zone}>{(settings.bands || DEFAULT_PRINT.bands)[zone].map((slot) => <span key={slot.id}>{previewSlot(slot)}</span>)}</div>)}{settings.layout === 'parallel' && (settings.density === 'ultra' ? <><button className="preview-column-divider" style={{ left:`${ratio / 2}%` }} onPointerDown={(event) => resizePrintColumns(event,'left')} aria-label="调整左组中外文栏宽"><GripVertical size={11} /></button><button className="preview-column-divider" style={{ left:`${50 + ratio / 2}%` }} onPointerDown={(event) => resizePrintColumns(event,'right')} aria-label="调整右组中外文栏宽"><GripVertical size={11} /></button></> : <button className="preview-column-divider" style={{ left:`${ratio}%` }} onPointerDown={(event) => resizePrintColumns(event,'full')} aria-label="调整中外文栏宽"><GripVertical size={11} /></button>)}{!(settings.bands || DEFAULT_PRINT.bands).header.concat((settings.bands || DEFAULT_PRINT.bands).footer).some((slot) => slot.content === 'page') && <span className="preview-page-number">{page + 1} / {pages}</span>}</div></div>
  </section>
}

type PrintMeta = ReturnType<typeof buildPrintMeta>
const slotText = (slot: PrintSlot, meta: PrintMeta, printedAt: string) => ({ none: '', chapter: meta.chapter, quest: meta.quest, printedAt, version: APP_VERSION, page: '', custom: slot.custom }[slot.content])
const RunningBand = forwardRef<HTMLDivElement, { slots: PrintSlot[]; meta: PrintMeta; printedAt: string; className?: string }>(({ slots, meta, printedAt, className = '' }, ref) => <div ref={ref} className={`running-band ${className}`}>{slots.map((slot) => <span key={slot.id} data-page-slot={slot.content === 'page' || undefined}>{slot.content === 'page' ? <span className="page-counter" /> : slotText(slot, meta, printedAt)}</span>)}</div>)

const PrintDocument = forwardRef<HTMLDivElement, { bundles: PrintBundle[]; languages: LanguageCode[]; traveler: Traveler; settings: PrintSettings; printedAt: string; hideBands?: boolean }>(({ bundles, languages, traveler, settings, printedAt, hideBands = false }, ref) => {
  const meta = buildPrintMeta(bundles)
  const sceneCount = bundles.reduce((total, bundle) => total + bundle.scenes.length, 0)
  const lineCount = bundles.reduce((total, bundle) => total + bundle.scenes.reduce((n, scene) => n + scene.lines.length, 0), 0)
  const shownLanguages = languages.slice(0, 3)
  const printLayout = ['parallel','stacked'].includes(settings.layout) ? settings.layout : 'parallel'
  const globalNumbers = new Map<string, number>()
  let globalLine = 0
  bundles.forEach((bundle) => bundle.scenes.forEach((scene) => scene.lines.forEach((line) => globalNumbers.set(`${bundle.key}:${scene.key}:${line.key}`, ++globalLine))))
  return <div ref={ref} className={`print-document density-${settings.density} layout-${printLayout} color-${settings.color} speaker-${settings.speakerLayout || 'column'} ${settings.lineNumbers ? '' : 'no-line-numbers'}`} style={{ '--doc-font': `${settings.fontSize}pt`, '--speaker-font':`${settings.speakerSize ?? 7}pt`, '--speaker-width':`${settings.speakerWidth ?? 14}mm`, '--number-font':`${settings.numberSize ?? 6}pt`, '--scene-title-font':`${settings.sceneTitleSize ?? 9}pt`, '--cover-title-font':`${settings.coverTitleSize ?? 15}pt`, '--line-gap':`${settings.lineGap ?? 1}mm`, '--scene-gap':`${settings.sceneGap ?? 1.5}mm`, '--print-language-count': shownLanguages.length } as React.CSSProperties}>
    {!hideBands && <><RunningBand slots={(settings.bands || DEFAULT_PRINT.bands).header} meta={meta} printedAt={printedAt} className="print-running-header" /><RunningBand slots={(settings.bands || DEFAULT_PRINT.bands).footer} meta={meta} printedAt={printedAt} className="print-running-footer" /></>}
    {settings.cover && <header className="print-cover-page"><span>TEYVAT SCRIPTORIUM · MULTILINGUAL SCRIPT</span><h1>{meta.chapter}</h1><h2>{meta.chapterEn}</h2><p>{meta.quest} · {meta.questEn}</p><small>{[...new Set(bundles.map((bundle) => TYPE_NAMES[bundle.taskType || ''] || bundle.taskType).filter(Boolean))].join(' / ') || '剧情任务'} · {bundles.length} 项来源 · {sceneCount} 个场景 · {lineCount} 句选稿</small></header>}
    {bundles.map((bundle, bundleIndex) => <section className="print-source" key={bundle.key}>
      {bundles.length > 1 && <header className="print-source-header"><span>PART {String(bundleIndex + 1).padStart(2,'0')}</span><div><strong>{localized(bundle.quest.title, shownLanguages[0])}</strong>{shownLanguages[1] && <small>{localized(bundle.quest.title, shownLanguages[1])}</small>}</div></header>}
      {bundle.scenes.map((scene, si) => {
        const renderedLines = scene.lines.map((line, li) => {
        const previous = scene.lines[li - 1]
        const repeatedSpeaker = Boolean(li && line.speaker.zh && line.speaker.zh === previous?.speaker.zh && line.speaker.en === previous?.speaker.en)
        let optionIndex = 0; if (line.kind === 'choice') for (let cursor = li - 1; cursor >= 0 && scene.lines[cursor].kind === 'choice'; cursor--) optionIndex++
        let optionTotal = line.kind === 'choice' ? optionIndex + 1 : 0; if (line.kind === 'choice') for (let cursor = li + 1; cursor < scene.lines.length && scene.lines[cursor].kind === 'choice'; cursor++) optionTotal++
        const ratio = settings.columnRatio ?? 50
        const languageColumns = shownLanguages.length === 2 ? `minmax(0,${ratio}fr) minmax(0,${100 - ratio}fr)` : `repeat(${shownLanguages.length},minmax(0,1fr))`
        const columns = printLayout === 'stacked' ? (settings.lineNumbers ? '32px minmax(0,1fr)' : 'minmax(0,1fr)') : (settings.lineNumbers ? `32px ${languageColumns}` : languageColumns)
        const overall = globalNumbers.get(`${bundle.key}:${scene.key}:${line.key}`) || li + 1
        return <div className={`print-line kind-${line.kind} ${line.kind === 'choice' && optionTotal > 1 ? `choice-option choice-tone-${optionIndex % 4}` : ''} ${line.kind === 'choice' && optionTotal > 1 && optionIndex === 0 ? 'choice-start' : ''} ${repeatedSpeaker ? 'same-speaker' : ''}`} style={{ gridTemplateColumns:columns }} key={line.key}>{settings.lineNumbers && <span className="print-number"><b>{line.kind === 'choice' && optionTotal > 1 ? `${optionIndex + 1}/${optionTotal}` : String(li + 1).padStart(3,'0')}</b><small>{overall}/{lineCount}</small></span>}{shownLanguages.map((lang) => <div className={`print-cell lang-${lang.toLowerCase()}`} key={lang}>{settings.speakers && !repeatedSpeaker && localized(line.speaker, lang) && <strong>{localized(line.speaker, lang)}</strong>}<p>{formatGameText(localized(line.text, lang), traveler)}</p></div>)}</div>
        })
        const content = settings.density === 'ultra' && printLayout === 'parallel'
          ? Array.from({ length: Math.ceil(renderedLines.length / 2) }, (_, row) => <div className="print-ultra-row" key={row}>{renderedLines.slice(row * 2, row * 2 + 2)}</div>)
          : renderedLines
        return <section className="print-scene" key={`${bundle.key}:${scene.key}`}>{settings.sceneTitles && <header className="print-scene-header"><span>SCENE {String(si + 1).padStart(2,'0')}</span><div><strong>{localized(scene.title, shownLanguages[0])}</strong>{shownLanguages.slice(1).map((lang) => <small key={lang}>{localized(scene.title, lang)}</small>)}</div></header>}{scene.description.zh && <div className="print-scene-lead">{shownLanguages.map((lang) => localized(scene.description,lang)).filter(Boolean).join(' · ')}</div>}<div className="print-scene-lines">{content}</div></section>
      })}
    </section>)}
  </div>
})

function PrintBandEditor({ bands, onChange }: { bands: PrintSettings['bands']; onChange: (bands: PrintSettings['bands']) => void }) {
  const [dragged, setDragged] = useState<{ zone: 'header' | 'footer'; index: number } | null>(null)
  const labels = { none: '留空', chapter: '内容标题', quest: '当前章节', printedAt: '打印时间', version: '网站版本', page: '页码 / 总页数', custom: '自定义文字' }
  const changeSlot = (zone: 'header' | 'footer', index: number, slot: PrintSlot) => onChange({ ...bands, [zone]: bands[zone].map((item, i) => i === index ? slot : item) })
  const drop = (zone: 'header' | 'footer', index: number) => {
    if (!dragged) return
    const next = { header: [...bands.header], footer: [...bands.footer] }
    const a = next[dragged.zone][dragged.index]; const b = next[zone][index]
    next[dragged.zone][dragged.index] = b; next[zone][index] = a
    onChange(next); setDragged(null)
  }
  return <PrintGroup title="页眉与页脚 · 拖动卡片可换位">
    <div className="band-editor">{(['header','footer'] as const).map((zone) => <div className="band-row" key={zone}><strong>{zone === 'header' ? '页眉' : '页脚'}</strong>{bands[zone].map((slot, index) => <div className="band-slot" draggable key={slot.id} onDragStart={() => setDragged({ zone, index })} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(zone, index)}><GripVertical size={13} /><span>{['左','中','右'][index]}</span><select value={slot.content} onChange={(e) => changeSlot(zone, index, { ...slot, content: e.target.value as PrintSlot['content'] })}>{Object.entries(labels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select>{slot.content === 'custom' && <input value={slot.custom} maxLength={40} placeholder="输入文字" onChange={(e) => changeSlot(zone, index, { ...slot, custom: e.target.value })} />}</div>)}</div>)}</div>
  </PrintGroup>
}

function Modal({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) { return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className={wide ? 'modal wide' : 'modal'} role="dialog" aria-modal="true"><header><div><span>{eyebrow}</span><h2>{title}</h2></div><button onClick={onClose}><X size={20} /></button></header>{children}</section></div> }
function SettingRow({ title, children }: { title: string; children: React.ReactNode }) { return <div className="setting-row"><div><strong>{title}</strong></div>{children}</div> }
function Segment({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[][] }) { return <div className="segment">{options.map(([v,l]) => <button className={value === v ? 'active' : ''} onClick={() => onChange(v)} key={v}>{l}</button>)}</div> }
function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) { return <button className={checked ? 'switch on' : 'switch'} onClick={() => onChange(!checked)}><span /></button> }
function PrintGroup({ title, children }: { title: string; children: React.ReactNode }) { return <div className="print-group"><label>{title}</label>{children}</div> }
function ToggleLine({ label, value, set }: { label: string; value: boolean; set: (v: boolean) => void }) { return <label><input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} /><span>{value && <Check size={11} />}</span>{label}</label> }
function Toast({ message, onClose }: { message: string; onClose: () => void }) { useEffect(() => { const timer = setTimeout(onClose, 2600); return () => clearTimeout(timer) }, [message, onClose]); return <div className="notice-toast"><Check size={15} /><span>{message}</span><button onClick={onClose}><X size={14} /></button></div> }

function Changelog({ onClose }: { onClose: () => void }) { return <Modal title="更新日志" eyebrow="CHANGELOG" onClose={onClose}><div className="changelog"><article><span>v0.5.0 · 2026-08-12</span><h3>真实分支、独立选稿池与可定制排印</h3><ul><li>仅将真实的多个旅行者选项组成分支组，以 1/X 编号和分层颜色区分</li><li>三语并列支持两条独立拖栏，选句可直接点击整句</li><li>选稿池与打印台分离，支持跨章节整幕加入、拖动排序及任务元数据</li><li>打印支持独立说话人列，以及正文、说话人、序号、标题和间距调节</li><li>分页预览最高放大至 200%，引导与 Toast 不再遮挡底部操作</li></ul></article><article><span>v0.4.2 · 2026-08-12</span><h3>可靠分页与一屏打印工作台</h3><ul><li>超紧凑改为逐行双记录四栏，避免跨页 Grid 与报纸分栏裁切正文</li><li>分页预览与原生打印共用纸张可印区域，228 句实测均为 3 页</li><li>打印加载遮罩在系统面板打开前移除，不再被重复印入每页</li><li>页边距增加安全提示，超紧凑默认至少保留 10mm</li><li>行号同时显示场景内编号和全文进度 / 总数</li><li>工作台改为内部滚动，桌面与手机底部打印按钮始终可见</li></ul></article><article><span>v0.4.1 · 2026-08-12</span><h3>可读性、选稿与完整分页预览</h3><ul><li>全站字体即时同步，放大桌面和手机控件文字并修复深色选中态</li><li>场景显示与定位分开，阅读筛选和选句模式不再混用状态</li><li>新增首次操作引导，设置中可随时重新查看</li><li>保留目录搜索、筛选、排序、加载数量和滚动位置</li><li>智能生成同章、跨章和跨地区打印标题</li><li>修复台词表窄栏逐字换行，并增加可拖动的中外文栏宽</li><li>打印台支持完整纸张、多页翻页、缩放与手机分页预览</li></ul></article><article><span>v0.4.0 · 2026-08-12</span><h3>多语言与阅读尺寸</h3><ul><li>15 种游戏语言按需载入，最多三语对照</li><li>正文、控件与角色筛选整体放大，页面收窄居中</li><li>旅行者与派蒙独立置顶，旅行者可切换空与荧</li><li>新增宋体、黑体、微软雅黑和主题卡片</li><li>PDF 改为可搜索、可选择的原生矢量打印</li></ul></article></div></Modal> }

export default function App() {
  const { catalog, catalogSync, chapter, setChapter, loadChapter, loading, loadProgress, error, setError } = useData()
  const [page, setPage] = useState<'catalog' | 'reader'>('catalog')
  const [settings, setSettings] = useStoredState<AppSettings>('teyvat:settings:v5', DEFAULT_SETTINGS)
  const [printSettings, setPrintSettings] = useStoredState<PrintSettings>('teyvat:print', DEFAULT_PRINT)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [basket, setBasket] = useSessionState<PrintBundle[]>('teyvat:print-basket', [])
  const [basketOpen, setBasketOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [guideRequest, setGuideRequest] = useState(0)
  const languageRef = useRef<LanguageCode[]>(settings.languages || ['CHS','EN'])
  languageRef.current = settings.languages || ['CHS','EN']
  useEffect(() => { if (!catalogSync.checking && (catalogSync.added || catalogSync.modified)) setNotice(`剧情目录已更新 · 新增 ${catalogSync.added}，修订 ${catalogSync.modified}`) }, [catalogSync])
  useEffect(() => {
    const resolved = settings.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : settings.theme
    document.documentElement.dataset.theme = resolved
  }, [settings.theme])
  const showLocation = async () => {
    const id = Number(new URLSearchParams(location.search).get('chapter'))
    if (id) { if (await loadChapter(id, languageRef.current)) setPage('reader') }
    else { setPage('catalog'); setChapter(null); setError('') }
  }
  useEffect(() => {
    const initialId = Number(new URLSearchParams(location.search).get('chapter'))
    history.replaceState({ teyvat: true, page: initialId ? 'reader' : 'catalog', fromCatalog: false }, '', location.href)
    showLocation()
    const onPopState = () => { showLocation() }
    addEventListener('popstate', onPopState)
    return () => removeEventListener('popstate', onPopState)
  }, [])
  const openItem = async (item: CatalogItem) => {
    if (await loadChapter(item.id, settings.languages || ['CHS','EN'])) {
      history.pushState({ teyvat: true, page: 'reader', fromCatalog: true }, '', `?chapter=${item.id}`)
      setPage('reader')
    }
  }
  useEffect(() => {
    const id = Number(new URLSearchParams(location.search).get('chapter'))
    if (page === 'reader' && id) loadChapter(id, settings.languages || ['CHS','EN'])
  }, [(settings.languages || ['CHS','EN']).join(',')])
  const back = () => {
    if (location.search.includes('chapter=') && history.state?.fromCatalog) history.back()
    else { history.pushState({ teyvat: true, page: 'catalog' }, '', location.pathname); setPage('catalog'); setChapter(null); setError('') }
  }
  const queueSelection = (selection: Set<string>, quest: Quest, scenes: Scene[]) => {
    if (!chapter) return
    const pickedScenes = scenes.map((scene) => ({ ...scene, lines: scene.lines.filter((line) => selection.has(line.key)) })).filter((scene) => scene.lines.length)
    if (!pickedScenes.length) return
    const catalogItem = catalog?.items.find((item) => item.id === chapter.chapter.id)
    const bundle: PrintBundle = { key: `${chapter.chapter.id}:${quest.id}`, chapter: chapter.chapter, quest: { id: quest.id, order: quest.order, title: quest.title, description: quest.description }, scenes: pickedScenes, taskType:catalogItem?.type, version:catalogItem?.version, nation:catalogItem?.nation }
    const merged = basket.some((item) => item.key === bundle.key)
    setBasket((current) => {
      const existing = current.find((item) => item.key === bundle.key)
      if (!existing) return [...current, bundle]
      const sceneMap = new Map(existing.scenes.map((scene) => [scene.key, { ...scene, lines: [...scene.lines] }]))
      for (const scene of bundle.scenes) {
        const saved = sceneMap.get(scene.key)
        if (!saved) sceneMap.set(scene.key, scene)
        else {
          const lineMap = new Map(saved.lines.map((line) => [line.key, line]))
          scene.lines.forEach((line) => lineMap.set(line.key, line))
          sceneMap.set(scene.key, { ...saved, lines: [...lineMap.values()] })
        }
      }
      return current.map((item) => item.key === bundle.key ? { ...existing, scenes: [...sceneMap.values()] } : item)
    })
    setNotice(merged ? '已合并到选稿池中的同一任务段' : `已加入选稿池 · ${pickedScenes.reduce((n, scene) => n + scene.lines.length, 0)} 句`)
  }
  const queueChapter = (data:ChapterData) => {
    const catalogItem = catalog?.items.find((item) => item.id === data.chapter.id)
    const additions:PrintBundle[] = data.quests.map((quest) => ({ key:`${data.chapter.id}:${quest.id}`, chapter:data.chapter, quest:{ id:quest.id, order:quest.order, title:quest.title, description:quest.description }, scenes:quest.scenes, taskType:catalogItem?.type, version:catalogItem?.version, nation:catalogItem?.nation }))
    setBasket((current) => { const map=new Map(current.map((item) => [item.key,item])); additions.forEach((item) => map.set(item.key,item)); return [...map.values()] })
    setNotice(`已加入${data.chapter.number.zh} · ${data.quests.length} 个 Chapters`)
  }
  const basketLines = basket.reduce((total, bundle) => total + bundle.scenes.reduce((n, scene) => n + scene.lines.length, 0), 0)
  const resolvedTheme = document.documentElement.dataset.theme || 'light'
  return <div className={`app-shell font-${settings.fontFamily || 'serif'}`}><Header page={page} theme={resolvedTheme} onTheme={() => setSettings({ ...settings, theme: resolvedTheme === 'dark' ? 'light' : 'dark' })} onCatalog={() => page === 'reader' && back()} onSettings={() => setSettingsOpen(true)} onChangelog={() => setChangelogOpen(true)} />
    {page === 'catalog' && catalog && <Catalog data={catalog} settings={settings} onOpen={openItem} sync={catalogSync} guideRequest={guideRequest} />}
    {page === 'catalog' && !catalog && !error && <div className="loading-page"><LoaderCircle className="spin" /><span>正在整理任务目录…</span></div>}
    {page === 'reader' && chapter && <Reader data={chapter} settings={settings} setSettings={setSettings} onBack={back} onQueue={queueSelection} onQueueChapter={queueChapter} onOpenBasket={() => basket.length && setBasketOpen(true)} basketSources={basket.length} basketLines={basketLines} guideRequest={guideRequest} />}
    {loading && <div className="loading-overlay"><LoaderCircle className="spin" /><strong>正在载入剧情</strong><span>{loadProgress.label}</span><div className="load-progress"><i style={{ width: `${loadProgress.value}%` }} /></div><small>{loadProgress.value}%</small></div>}
    {error && <div className="error-toast"><span>{error}</span><button onClick={() => { setError(''); if (page === 'reader' && !chapter) back() }}><X size={16} /></button></div>}
    {settingsOpen && <SettingsSheet value={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} onGuide={() => { localStorage.removeItem('teyvat:catalog-guide:v1'); localStorage.removeItem('teyvat:reader-guide:v1'); for (let index = sessionStorage.length - 1; index >= 0; index--) { const key = sessionStorage.key(index); if (key?.startsWith('teyvat:scene-guide:')) sessionStorage.removeItem(key) } setSettingsOpen(false); setGuideRequest((value) => value + 1) }} />}
    {changelogOpen && <Changelog onClose={() => setChangelogOpen(false)} />}
    {basketOpen && <BasketSheet bundles={basket} setBundles={(next) => { setBasket(next); if (!next.length) setBasketOpen(false) }} onClose={() => setBasketOpen(false)} onPrint={() => { setBasketOpen(false); setPrintOpen(true) }} />}
    {printOpen && basket.length > 0 && <PrintStudio bundles={basket} setBundles={(next) => { setBasket(next); if (!next.length) setPrintOpen(false) }} languages={settings.languages || ['CHS','EN']} settings={printSettings} setSettings={setPrintSettings} onClose={() => setPrintOpen(false)} onNotice={setNotice} />}
    {notice && <Toast message={notice} onClose={() => setNotice('')} />}
  </div>
}
