import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown, ArrowLeft, ArrowUp, BookOpenText, Check, ChevronDown, ChevronsUpDown, Clock3,
  FileDown, FileText, Filter, GripVertical, Languages, LibraryBig, ListFilter,
  LoaderCircle, Menu, Moon, Plus, Printer, RotateCcw, Search,
  Settings, ShoppingBasket, Snowflake, Sun, Trash2, X,
} from 'lucide-react'
import { filterScenes } from './lib/filter'
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
const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light', viewMode: 'parallel', zhSize: 18, enSize: 18, lineHeight: 1.5,
  showHidden: false, showUnreleased: false, compactMobile: true, languages: ['CHS','EN'], fontFamily: 'serif',
}
const DEFAULT_PRINT: PrintSettings = {
  layout: 'parallel', density: 'compact', paper: 'a4', orientation: 'portrait', fontSize: 9,
  margin: 12, color: 'accent', cover: true, sceneTitles: true, speakers: true, lineNumbers: true,
  bands: {
    header: [{ id: 'hl', content: 'chapter', custom: '' }, { id: 'hc', content: 'quest', custom: '' }, { id: 'hr', content: 'printedAt', custom: '' }],
    footer: [{ id: 'fl', content: 'version', custom: '' }, { id: 'fc', content: 'none', custom: '' }, { id: 'fr', content: 'page', custom: '' }],
  },
}
const APP_VERSION = 'v0.4.0'

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
      if (cached) { setChapter(JSON.parse(cached)); return true }
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

function Catalog({ data, settings, onOpen, sync }: { data: CatalogData; settings: AppSettings; onOpen: (item: CatalogItem) => void; sync: { checking: boolean; added: number; modified: number; checkedAt: string } }) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [nation, setNation] = useState('all')
  const [version, setVersion] = useState('all')
  const [sort, setSort] = useState<'version' | 'nation' | 'type' | 'id'>('version')
  const [limit, setLimit] = useState(60)
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
  useEffect(() => setLimit(60), [query, type, nation, version, sort])
  return <main className="catalog-page">
    <section className="catalog-hero">
      <div><span className="eyebrow">TEYVAT SCRIPTORIUM</span><h1>任务目录</h1></div>
    </section>
    <section className="catalog-controls">
      <label className="catalog-search"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索任务" />{query && <button onClick={() => setQuery('')}><X size={15} /></button>}</label>
      <div className="filter-row">
        <SelectFilter icon={<BookOpenText size={14} />} value={type} onChange={setType} label="任务类型" options={[['all','全部类型'], ...Object.entries(TYPE_NAMES)]} />
        <SelectFilter icon={<Snowflake size={14} />} value={nation} onChange={setNation} label="国家地区" options={[['all','全部地区'], ...Object.entries(NATION_NAMES)]} />
        <SelectFilter icon={<Clock3 size={14} />} value={version} onChange={setVersion} label="版本" options={[['all','全部版本'], ...data.versions.map((v) => [v, `v${v}`]), ['unknown','待考证']]} />
        <SelectFilter icon={<ChevronsUpDown size={14} />} value={sort} onChange={(v) => setSort(v as typeof sort)} label="排序" options={[["version","按版本"],["nation","按国家"],["type","按类型"],["id","按任务 ID"]]} />
        {(query || type !== 'all' || nation !== 'all' || version !== 'all') && <button className="reset-filters" onClick={() => { setQuery(''); setType('all'); setNation('all'); setVersion('all') }}><RotateCcw size={14} />重置</button>}
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

function Reader({ data, settings, setSettings, onBack, onQueue, onOpenBasket, basketSources, basketLines }: {
  data: ChapterData; settings: AppSettings; setSettings: (s: AppSettings) => void; onBack: () => void;
  onQueue: (selection: Set<string>, quest: Quest, scenes: Scene[]) => void; onOpenBasket: () => void; basketSources: number; basketLines: number
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
  const [speakerPicker, setSpeakerPicker] = useState(false)
  const [roleFilterOpen, setRoleFilterOpen] = useState(false)
  const [languageOpen, setLanguageOpen] = useState(false)
  const [speakerKeys, setSpeakerKeys] = useState<Set<string>>(new Set())
  const activeLanguages = (settings.languages?.length ? settings.languages : ['CHS','EN'] as LanguageCode[]).slice(0, 3)
  const activeQuest = data.quests.find((q) => q.id === questId) || data.quests[0]
  const speakerKey = (line: DialogueLine) => line.speaker.zh || line.speaker.en || '__narration'
  const availableSpeakers = useMemo(() => [...new Map(activeQuest.scenes.flatMap((scene) => scene.lines).map((line) => [speakerKey(line), { key: speakerKey(line), label: localized(line.speaker, activeLanguages[0]) || line.speaker.zh || '旁白', sub: localized(line.speaker, activeLanguages[1] || activeLanguages[0]) }])).values()].sort((a,b) => a.label.localeCompare(b.label)), [activeQuest, activeLanguages.join(',')])
  useEffect(() => {
    const keys = activeQuest.scenes.map((s) => s.key)
    setSceneKeys(new Set(keys))
    setSelectedLines(new Set(activeQuest.scenes.flatMap((s) => s.lines.map((l) => l.key))))
    setSpeakerKeys(new Set(availableSpeakers.map((speaker) => speaker.key)))
    setQuery('')
  }, [activeQuest.id, availableSpeakers])
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
  const toggleLine = (key: string) => setSelectedLines((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next })
  const setVisible = (enabled: boolean) => setSelectedLines((current) => { const next = new Set(current); visibleLineKeys.forEach((key) => enabled ? next.add(key) : next.delete(key)); return next })
  const speakers = useMemo(() => [...new Map(scenes.flatMap((s) => s.lines).map((l) => [l.speaker.zh, l.speaker])).values()].sort((a,b) => a.zh.localeCompare(b.zh)), [scenes])
  const selectSpeaker = (name: string) => { setSelectedLines(new Set(scenes.flatMap((s) => s.lines.filter((l) => l.speaker.zh === name).map((l) => l.key)))); setSpeakerPicker(false) }
  const choiceSpeakerKeys = new Set(activeQuest.scenes.flatMap((scene) => scene.lines.filter((line) => line.kind === 'choice').map((line) => speakerKey(line))))
  const travelerSpeaker = availableSpeakers.find((speaker) => choiceSpeakerKeys.has(speaker.key))
    || availableSpeakers.find((speaker) => /旅行者|Traveler|旅人|여행자|Путешествен/i.test(speaker.key))
  const paimonSpeaker = availableSpeakers.find((speaker) => /派蒙|Paimon|Paimón|パイモン|페이몬|Паймон/i.test(speaker.key))
  const regularSpeakers = availableSpeakers.filter((speaker) => speaker !== travelerSpeaker && speaker !== paimonSpeaker)
  const toggleSpeaker = (key: string) => setSpeakerKeys((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next })
  return <main className={`reader-page font-${settings.fontFamily || 'serif'}`} style={{ '--zh-size': `${settings.zhSize}px`, '--en-size': `${settings.enSize}px`, '--reader-leading': settings.lineHeight } as React.CSSProperties}>
    <div className="reader-topbar">
      <button className="back-button" onClick={onBack}><ArrowLeft size={17} /><span>目录</span></button>
      <div className="chapter-identity"><strong>{data.chapter.title.zh}</strong><span>{data.chapter.title.en}</span></div>
      <button className="mobile-scene-button" onClick={() => setSceneOpen(true)}><Menu size={17} />场景</button>
    </div>
    <div className="quest-tabs" role="tablist">{data.quests.map((q) => <button className={q.id === activeQuest.id ? 'active' : ''} onClick={() => setQuestId(q.id)} key={q.id}><span>{String(q.order).padStart(2,'0')}</span><strong>{localized(q.title, activeLanguages[0])}</strong>{activeLanguages[1] && <small>{localized(q.title, activeLanguages[1])}</small>}</button>)}</div>
    <section className="reader-intro">
      <div><span className="eyebrow">{localized(data.chapter.number, activeLanguages[0])} · {localized(data.chapter.region, activeLanguages[0])}</span><h1>{localized(activeQuest.title, activeLanguages[0])}</h1>{activeLanguages.slice(1).map((lang) => <h2 key={lang}>{localized(activeQuest.title, lang)}</h2>)}</div>
      <div className="intro-descriptions">{activeLanguages.map((lang) => localized(activeQuest.description, lang) && <p lang={languageInfo(lang).locale} key={lang}>{localized(activeQuest.description, lang)}</p>)}</div>
    </section>
    <div className="reader-workspace">
      <aside className={sceneOpen ? 'scene-panel open' : 'scene-panel'}>
        <div className="panel-heading"><div><strong>场景</strong><small>{sceneKeys.size}/{activeQuest.scenes.length} 已显示</small></div><button onClick={() => setSceneOpen(false)}><X size={18} /></button></div>
        <div className="panel-actions"><button onClick={() => setSceneKeys(new Set(activeQuest.scenes.map((s) => s.key)))}>全选</button><button onClick={() => setSceneKeys(new Set())}>清空</button></div>
        <div className="scene-list">{activeQuest.scenes.map((scene, index) => <label key={scene.key}><input type="checkbox" checked={sceneKeys.has(scene.key)} onChange={() => setSceneKeys((current) => { const next = new Set(current); next.has(scene.key) ? next.delete(scene.key) : next.add(scene.key); return next })} /><span className="checkmark">{sceneKeys.has(scene.key) && <Check size={11} />}</span><span className="scene-num">{String(index + 1).padStart(2,'0')}</span><span><strong>{localized(scene.title, activeLanguages[0])}</strong>{activeLanguages[1] && <small>{localized(scene.title, activeLanguages[1])}</small>}</span><em>{scene.lines.length}</em></label>)}</div>
      </aside>
      {sceneOpen && <button className="panel-scrim" onClick={() => setSceneOpen(false)} aria-label="关闭场景面板" />}
      <section className="script-column">
        <div className="reader-toolbar">
          <div className="view-pills">{VIEW_OPTIONS.map((v) => <button className={settings.viewMode === v.id ? 'active' : ''} onClick={() => setSettings({ ...settings, viewMode: v.id })} key={v.id}>{v.label}</button>)}</div>
          <div className="language-control"><button onClick={() => setLanguageOpen((value) => !value)}><Languages size={15} />{activeLanguages.map((lang) => languageInfo(lang).short).join(' · ')}<ChevronDown size={12} /></button>{languageOpen && <div className="language-popover"><header><strong>对照语言</strong><span>{activeLanguages.length}/3</span></header><LanguagePicker value={activeLanguages} onChange={(languages) => setSettings({ ...settings, languages })} /></div>}</div>
          <div className="search-tools"><label className="reader-search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && searchMode === 'locate' && matchKeys.length) setMatchIndex((value) => (value + 1) % matchKeys.length) }} placeholder="搜角色或台词" />{query && <button onClick={() => setQuery('')}><X size={13} /></button>}</label><select aria-label="搜索方式" value={searchMode} onChange={(e) => setSearchMode(e.target.value as 'locate' | 'filter')}><option value="locate">定位</option><option value="filter">筛选</option></select>{query && searchMode === 'locate' && <div className="match-nav"><span>{matchKeys.length ? matchIndex + 1 : 0}/{matchKeys.length}</span><button disabled={!matchKeys.length} onClick={() => setMatchIndex((value) => (value - 1 + matchKeys.length) % matchKeys.length)}><ArrowUp size={12} /></button><button disabled={!matchKeys.length} onClick={() => setMatchIndex((value) => (value + 1) % matchKeys.length)}><ArrowDown size={12} /></button></div>}</div>
          <div className="role-filter"><button className={speakerKeys.size < availableSpeakers.length ? 'active' : ''} onClick={() => setRoleFilterOpen((value) => !value)}><Filter size={14} />角色 {speakerKeys.size}/{availableSpeakers.length}<ChevronDown size={12} /></button>{roleFilterOpen && <div className="role-filter-popover"><header><strong>角色</strong><button onClick={() => setRoleFilterOpen(false)}><X size={17} /></button></header><div className="featured-roles">{travelerSpeaker && <label><input type="checkbox" checked={speakerKeys.has(travelerSpeaker.key)} onChange={() => toggleSpeaker(travelerSpeaker.key)} /><span className="checkmark">{speakerKeys.has(travelerSpeaker.key) && <Check size={12} />}</span><div><strong>旅行者</strong><select value={traveler} onChange={(e) => setTraveler(e.target.value as Traveler)} onClick={(e) => e.stopPropagation()}><option value="aether">空 · Aether</option><option value="lumine">荧 · Lumine</option></select></div></label>}{paimonSpeaker && <label><input type="checkbox" checked={speakerKeys.has(paimonSpeaker.key)} onChange={() => toggleSpeaker(paimonSpeaker.key)} /><span className="checkmark">{speakerKeys.has(paimonSpeaker.key) && <Check size={12} />}</span><div><strong>{paimonSpeaker.label}</strong><small>{paimonSpeaker.sub}</small></div></label>}</div><div className="role-filter-actions"><span>其他角色</span><button onClick={() => setSpeakerKeys(new Set(availableSpeakers.map((speaker) => speaker.key)))}>全选</button><button onClick={() => setSpeakerKeys(new Set())}>清空</button></div><div className="role-filter-list">{regularSpeakers.map((speaker) => <label key={speaker.key}><input type="checkbox" checked={speakerKeys.has(speaker.key)} onChange={() => toggleSpeaker(speaker.key)} /><span className="checkmark">{speakerKeys.has(speaker.key) && <Check size={11} />}</span><span><strong>{speaker.label}</strong><small>{speaker.sub}</small></span></label>)}</div></div>}</div>
          <button className={selectionMode ? 'selection-toggle active' : 'selection-toggle'} onClick={() => setSelectionMode((v) => !v)}><Check size={15} />选稿</button>
        </div>
        {selectionMode && <div className="selection-bar"><span>当前已选 <strong>{selectedVisible}</strong> / {visibleLineKeys.length} 句</span><div><button onClick={() => setVisible(true)}>选中当前结果</button><button onClick={() => setVisible(false)}>取消当前结果</button><button onClick={() => setSpeakerPicker((v) => !v)}>按角色选择</button><button onClick={() => setSelectedLines((current) => new Set(visibleLineKeys.filter((k) => !current.has(k))))}>反选</button><button className="queue-inline" disabled={!selectedVisible} onClick={() => onQueue(selectedLines, activeQuest, scenes)}><Plus size={13} />加入选稿池</button></div>{speakerPicker && <div className="speaker-picker"><header><strong>只选择某位角色的台词</strong><button onClick={() => setSpeakerPicker(false)}><X size={14} /></button></header><div>{speakers.map((speaker) => <button key={speaker.zh} onClick={() => selectSpeaker(speaker.zh)}><strong>{speaker.zh}</strong><small>{speaker.en}</small><em>{scenes.flatMap((s) => s.lines).filter((l) => l.speaker.zh === speaker.zh).length}</em></button>)}</div></div>}</div>}
        <div className={`script script-${settings.viewMode} ${selectionMode ? 'is-selecting' : ''}`}>
          <div className="script-meta"><span>{scenes.length} 个场景 · {visibleLineKeys.length} 句</span></div>
          {scenes.map((scene, sceneIndex) => <SceneBlock key={scene.key} scene={scene} sceneIndex={sceneIndex} mode={settings.viewMode} languages={activeLanguages} traveler={traveler} selected={selectedLines} toggle={toggleLine} selecting={selectionMode} query={searchMode === 'locate' ? query : ''} matches={new Set(matchKeys)} focusedKey={searchMode === 'locate' ? matchKeys[matchIndex] : undefined} />)}
          {!scenes.length && <Empty title="没有可显示的台词" />}
        </div>
      </section>
    </div>
    <div className="mobile-action-dock"><button onClick={() => setSceneOpen(true)}><ListFilter size={17} /><span>场景</span></button><button className={selectionMode ? 'active' : ''} onClick={() => setSelectionMode((v) => !v)}><Check size={17} /><span>选稿 {selectedVisible}</span></button><button disabled={!selectedVisible} onClick={() => onQueue(selectedLines, activeQuest, scenes)}><Plus size={17} /><span>加入</span></button><button onClick={onOpenBasket}><ShoppingBasket size={17} /><span>选稿池 {basketSources}</span></button></div>
    <div className="desktop-print-actions"><button className="add-to-basket" disabled={!selectedVisible} onClick={() => onQueue(selectedLines, activeQuest, scenes)}><Plus size={16} />加入当前 {selectedVisible} 句</button><button className="desktop-print-fab" onClick={onOpenBasket}><ShoppingBasket size={17} />选稿池 / 打印 <span>{basketSources} 项 · {basketLines} 句</span></button></div>
  </main>
}

function SceneBlock({ scene, sceneIndex, mode, languages, traveler, selected, toggle, selecting, query, matches, focusedKey }: { scene: Scene; sceneIndex: number; mode: ViewMode; languages: LanguageCode[]; traveler: Traveler; selected: Set<string>; toggle: (k: string) => void; selecting: boolean; query: string; matches: Set<string>; focusedKey?: string }) {
  return <section className="scene-block"><header><span>SCENE {String(sceneIndex + 1).padStart(2,'0')}</span><div><h3>{localized(scene.title, languages[0])}</h3>{languages.slice(1).map((lang) => <p key={lang}>{localized(scene.title, lang)}</p>)}</div><em>{scene.lines.length} 句</em></header>{scene.lines.map((line, index) => <DialogueRow key={line.key} line={line} index={index} mode={mode} languages={languages} traveler={traveler} checked={selected.has(line.key)} toggle={() => toggle(line.key)} selecting={selecting} query={query} match={!query || matches.has(line.key)} focused={line.key === focusedKey} />)}</section>
}

function HighlightText({ text, query }: { text: string; query: string }) { if (!query.trim()) return <>{text || '—'}</>; const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const parts = text.split(new RegExp(`(${escaped})`, 'ig')); return <>{parts.map((part, index) => part.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) ? <mark key={index}>{part}</mark> : part)}</> }
function DialogueRow({ line, index, mode, languages, traveler, checked, toggle, selecting, query, match, focused }: { line: DialogueLine; index: number; mode: ViewMode; languages: LanguageCode[]; traveler: Traveler; checked: boolean; toggle: () => void; selecting: boolean; query: string; match: boolean; focused: boolean }) {
  return <article data-line-key={line.key} className={`dialogue-row kind-${line.kind} ${checked ? 'selected' : 'not-selected'} ${query && !match ? 'search-muted' : ''} ${focused ? 'search-focused' : ''}`} onClick={() => selecting && toggle()}>
    <button className="line-select" onClick={(e) => { e.stopPropagation(); toggle() }} aria-label={checked ? '从打印稿移除' : '加入打印稿'}><span>{checked && <Check size={11} />}</span><small>{String(index + 1).padStart(2,'0')}</small></button>
    <div className="dialogue-main"><div className="utterances" style={{ '--language-count': languages.length } as React.CSSProperties}>{languages.map((lang) => <div className="utterance" lang={languageInfo(lang).locale} key={lang}><strong><HighlightText text={localized(line.speaker, lang)} query={query} /></strong><p><HighlightText text={formatGameText(localized(line.text, lang), traveler)} query={query} /></p></div>)}</div>{line.kind === 'choice' && <em className="choice-label">选择</em>}</div>
  </article>
}

function SettingsSheet({ value, onChange, onClose }: { value: AppSettings; onChange: (s: AppSettings) => void; onClose: () => void }) {
  return <Modal title="阅读设置" eyebrow="SETTINGS" onClose={onClose}><div className="settings-list">
    <SettingRow title="界面主题"><div className="theme-cards">{([['light','浅色'],['dark','深色'],['auto','自动']] as const).map(([id,label]) => <button className={value.theme === id ? 'active' : ''} onClick={() => onChange({ ...value, theme:id })} key={id}><i className={`theme-preview ${id}`} /><span>{label}</span></button>)}</div></SettingRow>
    <SettingRow title="对照语言"><LanguagePicker value={value.languages || ['CHS','EN']} onChange={(languages) => onChange({ ...value, languages })} /></SettingRow>
    <SettingRow title="阅读版式"><Segment value={['parallel','stacked','compact'].includes(value.viewMode) ? value.viewMode : 'parallel'} onChange={(v) => onChange({ ...value, viewMode: v as ViewMode })} options={VIEW_OPTIONS.map((x) => [x.id,x.label])} /></SettingRow>
    <SettingRow title="字体"><Segment value={value.fontFamily || 'serif'} onChange={(v) => onChange({ ...value, fontFamily: v as AppSettings['fontFamily'] })} options={[["serif","宋体"],["sans","黑体"],["yahei","微软雅黑"]]} /></SettingRow>
    <SettingRow title={`正文字号 · ${value.zhSize}px`}><input type="range" min="15" max="28" value={value.zhSize} onChange={(e) => onChange({ ...value, zhSize: Number(e.target.value), enSize: Number(e.target.value) })} /></SettingRow>
    <SettingRow title={`行距 · ${value.lineHeight.toFixed(2)}`}><input type="range" min="1.25" max="1.8" step="0.05" value={value.lineHeight} onChange={(e) => onChange({ ...value, lineHeight: Number(e.target.value) })} /></SettingRow>
    <SettingRow title="隐藏内容"><Switch checked={value.showHidden} onChange={(v) => onChange({ ...value, showHidden: v })} /></SettingRow>
    <SettingRow title="未实装内容"><Switch checked={value.showUnreleased} onChange={(v) => onChange({ ...value, showUnreleased: v })} /></SettingRow>
    <button className="reset-settings" onClick={() => onChange(DEFAULT_SETTINGS)}><RotateCcw size={15} />恢复默认设置</button>
  </div></Modal>
}

function PrintStudio({ bundles, setBundles, languages, traveler = 'aether', settings, setSettings, onClose, onNotice }: { bundles: PrintBundle[]; setBundles: (bundles: PrintBundle[]) => void; languages: LanguageCode[]; traveler?: Traveler; settings: PrintSettings; setSettings: (s: PrintSettings) => void; onClose: () => void; onNotice: (message: string) => void }) {
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState({ value: 0, label: '' })
  const [printedAt] = useState(() => new Date().toLocaleString('zh-CN', { hour12: false }))
  const bands = settings.bands || DEFAULT_PRINT.bands
  const count = bundles.reduce((total, bundle) => total + bundle.scenes.reduce((n, scene) => n + scene.lines.length, 0), 0)
  const meta = printMeta(bundles)
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
      window.print()
      onNotice('可在系统面板中打印或保存为 PDF')
    } catch (error) {
      console.error(error)
      onNotice('打印稿准备失败，请稍后重试')
    } finally { setExporting(false) }
  }
  const moveBundle = (index: number, delta: number) => { const target = index + delta; if (target < 0 || target >= bundles.length) return; const next = [...bundles]; [next[index], next[target]] = [next[target], next[index]]; setBundles(next) }
  return <><Modal wide title="打印与 PDF 选稿台" eyebrow={`${bundles.length} SOURCES · ${count} LINES`} onClose={onClose}>
    <div className="print-studio"><section className="print-options-panel">
      <PrintGroup title="选稿池 · 可跨任务与章节"><div className="print-basket-list">{bundles.map((bundle, index) => <article key={bundle.key}><span>{String(index + 1).padStart(2,'0')}</span><div><strong>{bundle.quest.title.zh}</strong><small>{bundle.chapter.title.zh} · {bundle.scenes.length} 个场景 · {bundle.scenes.reduce((n, scene) => n + scene.lines.length, 0)} 句</small></div><button disabled={index === 0} onClick={() => moveBundle(index, -1)} aria-label="上移"><ArrowUp size={12} /></button><button disabled={index === bundles.length - 1} onClick={() => moveBundle(index, 1)} aria-label="下移"><ArrowDown size={12} /></button><button onClick={() => setBundles(bundles.filter((item) => item.key !== bundle.key))} aria-label="移除"><Trash2 size={12} /></button></article>)}</div></PrintGroup>
      <PrintGroup title="版式"><Segment value={['parallel','stacked'].includes(settings.layout) ? settings.layout : 'parallel'} onChange={(v) => setSettings({ ...settings, layout: v as PrintSettings['layout'] })} options={[["parallel","并列"],["stacked","上下"]]} /></PrintGroup>
      <PrintGroup title="密度"><Segment value={settings.density} onChange={(v) => setSettings({ ...settings, density: v as PrintSettings['density'], ...(v === 'ultra' && settings.margin > 6 ? { margin: 6 } : {}) })} options={[["comfortable","一般"],["compact","紧凑"],["ultra","超紧凑"]]} /></PrintGroup>
      <div className="print-grid"><PrintGroup title="纸张"><select value={settings.paper} onChange={(e) => setSettings({ ...settings, paper: e.target.value as PrintSettings['paper'] })}><option value="a4">A4</option><option value="a5">A5</option><option value="letter">Letter</option></select></PrintGroup><PrintGroup title="方向"><select value={settings.orientation} onChange={(e) => setSettings({ ...settings, orientation: e.target.value as PrintSettings['orientation'] })}><option value="portrait">纵向</option><option value="landscape">横向</option></select></PrintGroup></div>
      <PrintGroup title={`正文字号 · ${settings.fontSize}pt`}><input type="range" min="7" max="13" value={settings.fontSize} onChange={(e) => setSettings({ ...settings, fontSize: Number(e.target.value) })} /></PrintGroup>
      <PrintGroup title={`页边距 · ${settings.margin}mm`}><input type="range" min="6" max="24" step="2" value={settings.margin} onChange={(e) => setSettings({ ...settings, margin: Number(e.target.value) })} /></PrintGroup>
      <PrintGroup title="颜色"><Segment value={settings.color} onChange={(v) => setSettings({ ...settings, color: v as PrintSettings['color'] })} options={[["full","彩色"],["accent","省墨"],["mono","黑白"]]} /></PrintGroup>
      <div className="print-toggles"><ToggleLine label="封面" value={settings.cover} set={(v) => setSettings({ ...settings, cover: v })} /><ToggleLine label="场景标题" value={settings.sceneTitles} set={(v) => setSettings({ ...settings, sceneTitles: v })} /><ToggleLine label="说话人" value={settings.speakers} set={(v) => setSettings({ ...settings, speakers: v })} /><ToggleLine label="行号" value={settings.lineNumbers} set={(v) => setSettings({ ...settings, lineNumbers: v })} /></div>
      <PrintBandEditor bands={bands} onChange={(next) => setSettings({ ...settings, bands: next })} />
    </section><section className="print-preview-wrap"><div className="preview-label"><span>实时预览</span><em>{settings.paper.toUpperCase()} · {settings.density === 'ultra' ? '超紧凑' : settings.density === 'compact' ? '紧凑' : '一般'}</em></div><div className="mini-paper"><PrintDocument bundles={bundles} languages={languages} traveler={traveler} settings={settings} printedAt={printedAt} /></div></section></div>
    <div className="print-footer"><div><button className="secondary-action" onClick={openNativePrint} disabled={!count || exporting}><Printer size={16} />系统打印</button><button className="primary-action" onClick={openNativePrint} disabled={!count || exporting}>{exporting ? <LoaderCircle className="spin" size={16} /> : <FileDown size={16} />}{exporting ? '正在准备…' : '保存矢量 PDF'}</button></div></div>
  </Modal>{exporting && <div className="progress-overlay"><section><span>PRINT COMPOSITOR</span><LoaderCircle className="spin" size={28} /><h3>正在准备打印稿</h3><p>{exportProgress.label}</p><div className="progress-track"><i style={{ width: `${exportProgress.value}%` }} /></div><small>{exportProgress.value}%</small></section></div>}<div className="print-only-root"><PrintDocument bundles={bundles} languages={languages} traveler={traveler} settings={settings} printedAt={printedAt} /></div></>
}

type PrintMeta = { chapter: string; chapterEn: string; quest: string; questEn: string }
const printMeta = (bundles: PrintBundle[]): PrintMeta => bundles.length === 1
  ? { chapter: bundles[0].chapter.title.zh, chapterEn: bundles[0].chapter.title.en, quest: bundles[0].quest.title.zh, questEn: bundles[0].quest.title.en }
  : { chapter: '跨章节选稿', chapterEn: 'Script Collection', quest: `${bundles.length} 项选稿`, questEn: `${bundles.length} selected sections` }
const slotText = (slot: PrintSlot, meta: PrintMeta, printedAt: string) => ({ none: '', chapter: meta.chapter, quest: meta.quest, printedAt, version: APP_VERSION, page: '', custom: slot.custom }[slot.content])
const RunningBand = forwardRef<HTMLDivElement, { slots: PrintSlot[]; meta: PrintMeta; printedAt: string; className?: string }>(({ slots, meta, printedAt, className = '' }, ref) => <div ref={ref} className={`running-band ${className}`}>{slots.map((slot) => <span key={slot.id} data-page-slot={slot.content === 'page' || undefined}>{slot.content === 'page' ? <span className="page-counter" /> : slotText(slot, meta, printedAt)}</span>)}</div>)

const PrintDocument = forwardRef<HTMLDivElement, { bundles: PrintBundle[]; languages: LanguageCode[]; traveler: Traveler; settings: PrintSettings; printedAt: string; hideBands?: boolean }>(({ bundles, languages, traveler, settings, printedAt, hideBands = false }, ref) => {
  const meta = printMeta(bundles)
  const sceneCount = bundles.reduce((total, bundle) => total + bundle.scenes.length, 0)
  const lineCount = bundles.reduce((total, bundle) => total + bundle.scenes.reduce((n, scene) => n + scene.lines.length, 0), 0)
  const shownLanguages = languages.slice(0, 3)
  const printLayout = ['parallel','stacked'].includes(settings.layout) ? settings.layout : 'parallel'
  return <div ref={ref} className={`print-document density-${settings.density} layout-${printLayout} color-${settings.color} ${settings.lineNumbers ? '' : 'no-line-numbers'}`} style={{ '--doc-font': `${settings.fontSize}pt`, '--print-language-count': shownLanguages.length } as React.CSSProperties}>
    {!hideBands && <><RunningBand slots={(settings.bands || DEFAULT_PRINT.bands).header} meta={meta} printedAt={printedAt} className="print-running-header" /><RunningBand slots={(settings.bands || DEFAULT_PRINT.bands).footer} meta={meta} printedAt={printedAt} className="print-running-footer" /></>}
    {settings.cover && <header className="print-cover-page"><span>TEYVAT SCRIPTORIUM · MULTILINGUAL SCRIPT</span><h1>{meta.chapter}</h1><h2>{meta.chapterEn}</h2><p>{meta.quest} · {meta.questEn}</p><small>{bundles.length} 项来源 · {sceneCount} 个场景 · {lineCount} 句选稿</small></header>}
    {bundles.map((bundle, bundleIndex) => <section className="print-source" key={bundle.key}>
      {bundles.length > 1 && <header className="print-source-header"><span>PART {String(bundleIndex + 1).padStart(2,'0')}</span><div><strong>{localized(bundle.quest.title, shownLanguages[0])}</strong>{shownLanguages[1] && <small>{localized(bundle.quest.title, shownLanguages[1])}</small>}</div></header>}
      {bundle.scenes.map((scene, si) => <section className="print-scene" key={`${bundle.key}:${scene.key}`}>{settings.sceneTitles && <header className="print-scene-header"><span>SCENE {String(si + 1).padStart(2,'0')}</span><div><strong>{localized(scene.title, shownLanguages[0])}</strong>{shownLanguages.slice(1).map((lang) => <small key={lang}>{localized(scene.title, lang)}</small>)}</div></header>}{scene.lines.map((line, li) => {
        const previous = scene.lines[li - 1]
        const repeatedSpeaker = Boolean(li && line.speaker.zh && line.speaker.zh === previous?.speaker.zh && line.speaker.en === previous?.speaker.en)
        const columns = printLayout === 'stacked' ? (settings.lineNumbers ? '32px minmax(0,1fr)' : 'minmax(0,1fr)') : (settings.lineNumbers ? `32px repeat(${shownLanguages.length},minmax(0,1fr))` : `repeat(${shownLanguages.length},minmax(0,1fr))`)
        return <div className={`print-line kind-${line.kind} ${repeatedSpeaker ? 'same-speaker' : ''}`} style={{ gridTemplateColumns:columns }} key={line.key}>{settings.lineNumbers && <span className="print-number">{String(li + 1).padStart(3,'0')}</span>}{shownLanguages.map((lang) => <div className={`print-cell lang-${lang.toLowerCase()}`} key={lang}>{settings.speakers && !repeatedSpeaker && localized(line.speaker, lang) && <strong>{localized(line.speaker, lang)}</strong>}<p>{formatGameText(localized(line.text, lang), traveler)}</p></div>)}</div>
      })}</section>)}
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

function Changelog({ onClose }: { onClose: () => void }) { return <Modal title="更新日志" eyebrow="CHANGELOG" onClose={onClose}><div className="changelog"><article><span>v0.4.0 · 2026-08-12</span><h3>多语言与阅读尺寸</h3><ul><li>15 种游戏语言按需载入，最多三语对照</li><li>正文、控件与角色筛选整体放大，页面收窄居中</li><li>旅行者与派蒙独立置顶，旅行者可切换空与荧</li><li>新增宋体、黑体、微软雅黑和主题卡片</li><li>PDF 改为可搜索、可选择的原生矢量打印</li></ul></article><article><span>v0.3.0 · 2026-08-12</span><h3>选稿池、搜索与自动更新</h3><ul><li>浏览器历史导航</li><li>跨任务选稿池</li><li>定位与筛选搜索</li><li>紧凑打印与生成进度</li></ul></article></div></Modal> }

export default function App() {
  const { catalog, catalogSync, chapter, setChapter, loadChapter, loading, loadProgress, error, setError } = useData()
  const [page, setPage] = useState<'catalog' | 'reader'>('catalog')
  const [settings, setSettings] = useStoredState<AppSettings>('teyvat:settings:v4', DEFAULT_SETTINGS)
  const [printSettings, setPrintSettings] = useStoredState<PrintSettings>('teyvat:print', DEFAULT_PRINT)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [basket, setBasket] = useSessionState<PrintBundle[]>('teyvat:print-basket', [])
  const [printOpen, setPrintOpen] = useState(false)
  const [notice, setNotice] = useState('')
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
    const bundle: PrintBundle = { key: `${chapter.chapter.id}:${quest.id}`, chapter: chapter.chapter, quest: { id: quest.id, order: quest.order, title: quest.title, description: quest.description }, scenes: pickedScenes }
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
  const basketLines = basket.reduce((total, bundle) => total + bundle.scenes.reduce((n, scene) => n + scene.lines.length, 0), 0)
  const resolvedTheme = document.documentElement.dataset.theme || 'light'
  return <div className="app-shell"><Header page={page} theme={resolvedTheme} onTheme={() => setSettings({ ...settings, theme: resolvedTheme === 'dark' ? 'light' : 'dark' })} onCatalog={() => page === 'reader' && back()} onSettings={() => setSettingsOpen(true)} onChangelog={() => setChangelogOpen(true)} />
    {page === 'catalog' && catalog && <Catalog data={catalog} settings={settings} onOpen={openItem} sync={catalogSync} />}
    {page === 'catalog' && !catalog && !error && <div className="loading-page"><LoaderCircle className="spin" /><span>正在整理任务目录…</span></div>}
    {page === 'reader' && chapter && <Reader data={chapter} settings={settings} setSettings={setSettings} onBack={back} onQueue={queueSelection} onOpenBasket={() => basket.length && setPrintOpen(true)} basketSources={basket.length} basketLines={basketLines} />}
    {loading && <div className="loading-overlay"><LoaderCircle className="spin" /><strong>正在载入剧情</strong><span>{loadProgress.label}</span><div className="load-progress"><i style={{ width: `${loadProgress.value}%` }} /></div><small>{loadProgress.value}%</small></div>}
    {error && <div className="error-toast"><span>{error}</span><button onClick={() => { setError(''); if (page === 'reader' && !chapter) back() }}><X size={16} /></button></div>}
    {settingsOpen && <SettingsSheet value={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} />}
    {changelogOpen && <Changelog onClose={() => setChangelogOpen(false)} />}
    {printOpen && basket.length > 0 && <PrintStudio bundles={basket} setBundles={(next) => { setBasket(next); if (!next.length) setPrintOpen(false) }} languages={settings.languages || ['CHS','EN']} settings={printSettings} setSettings={setPrintSettings} onClose={() => setPrintOpen(false)} onNotice={setNotice} />}
    {notice && <Toast message={notice} onClose={() => setNotice('')} />}
  </div>
}
