import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown, ArrowLeft, ArrowUp, BookOpenText, Check, ChevronDown, ChevronsUpDown, CircleHelp, Clock3,
  Download, ExternalLink, FileDown, FileText, Filter, GripVertical, Languages, LibraryBig, ListFilter,
  LoaderCircle, Menu, Moon, MoreHorizontal, PanelBottomOpen, Plus, Printer, RotateCcw, Search,
  Settings, ShoppingBasket, SlidersHorizontal, Snowflake, Sun, Trash2, X,
} from 'lucide-react'
import { filterScenes } from './lib/filter'
import { formatGameText, normalizeSearch } from './lib/text'
import type {
  AppSettings, CatalogData, CatalogItem, ChapterData, DialogueLine, PrintBundle, PrintSettings, PrintSlot,
  Quest, Scene, Traveler, ViewMode,
} from './types'

const TYPE_NAMES: Record<string, string> = {
  aq: '魔神任务', wq: '世界任务', lq: '角色任务', eq: '活动任务', iq: '每日委托', other: '其他',
}
const NATION_NAMES: Record<string, string> = {
  mondstadt: '蒙德', liyue: '璃月', inazuma: '稻妻', sumeru: '须弥', fontaine: '枫丹',
  natlan: '纳塔', nodkrai: '挪德卡莱', snezhnaya: '至冬', traveler: '旅行者篇', unknown: '地区未标注',
}
const VIEW_OPTIONS: { id: ViewMode; label: string }[] = [
  { id: 'parallel', label: '双栏' }, { id: 'stacked', label: '上下对照' },
  { id: 'compact', label: '台词表' }, { id: 'zh', label: '仅中文' }, { id: 'en', label: 'English' },
]
const DEFAULT_SETTINGS: AppSettings = {
  theme: 'auto', viewMode: 'parallel', zhSize: 14, enSize: 17, lineHeight: 1.65,
  showHidden: false, showUnreleased: false, compactMobile: true,
}
const DEFAULT_PRINT: PrintSettings = {
  layout: 'parallel', density: 'compact', paper: 'a4', orientation: 'portrait', fontSize: 9,
  margin: 12, color: 'accent', cover: true, sceneTitles: true, speakers: true, lineNumbers: true,
  bands: {
    header: [{ id: 'hl', content: 'chapter', custom: '' }, { id: 'hc', content: 'quest', custom: '' }, { id: 'hr', content: 'printedAt', custom: '' }],
    footer: [{ id: 'fl', content: 'version', custom: '' }, { id: 'fc', content: 'none', custom: '' }, { id: 'fr', content: 'page', custom: '' }],
  },
}
const APP_VERSION = 'v0.3.0'

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
  async function loadChapter(id: number) {
    setLoading(true); setError(''); setLoadProgress({ value: 4, label: '正在连接剧情资料源…' })
    try {
      const cached = sessionStorage.getItem(`chapter:${id}`)
      if (cached) { setChapter(JSON.parse(cached)); return true }
      const url = id === 1700 ? '/data/quest-1700.json' : `/api/quest/${id}`
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
          setLoadProgress({ value: percent, label: `正在接收中英剧情 · ${(received / 1024).toFixed(0)} KB${total ? ` / ${(total / 1024).toFixed(0)} KB` : ''}` })
        }
        setLoadProgress({ value: 94, label: '正在解析场景、角色与中英台词…' })
        const bytes = new Uint8Array(received); let offset = 0
        chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.length })
        data = JSON.parse(new TextDecoder().decode(bytes)) as ChapterData
      } else data = await response.json() as ChapterData
      setChapter(data)
      try { sessionStorage.setItem(`chapter:${id}`, JSON.stringify(data)) } catch { /* large chapter; memory cache still works */ }
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
    <button className="brand" onClick={onCatalog} type="button"><span className="brand-seal"><Snowflake size={17} /></span><span><strong>提瓦特剧本室</strong><small>剧情对照与选稿</small></span></button>
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
      <div><span className="eyebrow">TRAVEL LOG · 双语档案</span><h1>从标题找到剧情，<br />需要时再取正文。</h1><p>目录已收录 {data.counts.total.toLocaleString()} 个任务标题。中文与英文并排检索，正文按需加载，不占首屏流量。</p></div>
      <div className="catalog-stats"><div><strong>{data.counts.byType.aq}</strong><span>魔神任务</span></div><div><strong>{data.counts.byType.wq.toLocaleString()}</strong><span>世界任务</span></div><div><strong>{data.counts.byType.lq}</strong><span>角色任务</span></div></div>
    </section>
    <section className="catalog-controls">
      <label className="catalog-search"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜中文、English、章节或任务 ID" />{query && <button onClick={() => setQuery('')}><X size={15} /></button>}</label>
      <div className="filter-row">
        <SelectFilter icon={<BookOpenText size={14} />} value={type} onChange={setType} label="任务类型" options={[['all','全部类型'], ...Object.entries(TYPE_NAMES)]} />
        <SelectFilter icon={<Snowflake size={14} />} value={nation} onChange={setNation} label="国家地区" options={[['all','全部地区'], ...Object.entries(NATION_NAMES)]} />
        <SelectFilter icon={<Clock3 size={14} />} value={version} onChange={setVersion} label="版本" options={[['all','全部版本'], ...data.versions.map((v) => [v, `v${v}`]), ['unknown','待考证']]} />
        <SelectFilter icon={<ChevronsUpDown size={14} />} value={sort} onChange={(v) => setSort(v as typeof sort)} label="排序" options={[["version","按版本"],["nation","按国家"],["type","按类型"],["id","按任务 ID"]]} />
        {(query || type !== 'all' || nation !== 'all' || version !== 'all') && <button className="reset-filters" onClick={() => { setQuery(''); setType('all'); setNation('all'); setVersion('all') }}><RotateCcw size={14} />重置</button>}
      </div>
      <div className="catalog-result-line"><span>找到 <strong>{items.length}</strong> 个任务</span><span>{sync.checking ? '正在后台检查剧情目录更新…' : sync.added || sync.modified ? `已自动合并：新增 ${sync.added} · 修订 ${sync.modified}` : `目录已检查 · ${sync.checkedAt}`}</span></div>
    </section>
    <section className="catalog-grid">
      {items.slice(0, limit).map((item) => <button className="catalog-card" key={item.id} onClick={() => onOpen(item)}>
        <div className="card-top"><span className={`type-badge type-${item.type}`}>{TYPE_NAMES[item.type] || '其他'}</span><span className="version-badge" title={item.versionSource === 'wiki' ? 'Genshin Impact Wiki 发布版本分类' : item.versionSource === 'yatta-changelog' ? 'Yatta 更新记录' : '尚未核实'}>{item.version ? `v${item.version}` : '待考证'}</span></div>
        <h2>{item.title.zh}</h2><h3>{item.title.en}</h3>
        <div className="card-meta"><span>{NATION_NAMES[item.nation]}</span><i /><span>{item.chapterCount} 个任务段</span><i /><span>#{item.id}</span></div>
        <div className="card-open"><span>{item.languages.zh && '中'}{item.languages.zh && item.languages.en && ' / '}{item.languages.en && 'EN'}</span><span>按需载入正文 <Download size={13} /></span></div>
      </button>)}
    </section>
    {items.length > limit && <button className="load-more" onClick={() => setLimit((v) => v + 60)}>再显示 {Math.min(60, items.length - limit)} 个</button>}
    {!items.length && <Empty title="没有符合条件的任务" detail="试试清空关键词或放宽筛选。" />}
  </main>
}

function SelectFilter({ icon, value, onChange, label, options }: { icon: React.ReactNode; value: string; onChange: (v: string) => void; label: string; options: string[][] }) {
  return <label className="select-filter">{icon}<span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([v,l]) => <option value={v} key={v}>{l}</option>)}</select><ChevronDown size={13} /></label>
}

function Empty({ title, detail }: { title: string; detail: string }) { return <div className="empty"><FileText size={28} /><h2>{title}</h2><p>{detail}</p></div> }

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
  const [speakerKeys, setSpeakerKeys] = useState<Set<string>>(new Set())
  const activeQuest = data.quests.find((q) => q.id === questId) || data.quests[0]
  const speakerKey = (line: DialogueLine) => line.speaker.zh || line.speaker.en || '__narration'
  const availableSpeakers = useMemo(() => [...new Map(activeQuest.scenes.flatMap((scene) => scene.lines).map((line) => [speakerKey(line), { key: speakerKey(line), zh: line.speaker.zh || '旁白', en: line.speaker.en || 'Narration' }])).values()].sort((a,b) => a.zh.localeCompare(b.zh)), [activeQuest])
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
  return <main className="reader-page" style={{ '--zh-size': `${settings.zhSize}px`, '--en-size': `${settings.enSize}px`, '--reader-leading': settings.lineHeight } as React.CSSProperties}>
    <div className="reader-topbar">
      <button className="back-button" onClick={onBack}><ArrowLeft size={17} /><span>目录</span></button>
      <div className="chapter-identity"><strong>{data.chapter.title.zh}</strong><span>{data.chapter.title.en}</span></div>
      <button className="mobile-scene-button" onClick={() => setSceneOpen(true)}><Menu size={17} />场景</button>
    </div>
    <div className="quest-tabs" role="tablist">{data.quests.map((q) => <button className={q.id === activeQuest.id ? 'active' : ''} onClick={() => setQuestId(q.id)} key={q.id}><span>{String(q.order).padStart(2,'0')}</span><strong>{q.title.zh}</strong><small>{q.title.en}</small></button>)}</div>
    <section className="reader-intro">
      <div><span className="eyebrow">{data.chapter.number.zh} · {data.chapter.region.zh}</span><h1>{activeQuest.title.zh}</h1><h2>{activeQuest.title.en}</h2></div>
      <p>{activeQuest.description.zh}<br /><span>{activeQuest.description.en}</span></p>
    </section>
    <div className="reader-workspace">
      <aside className={sceneOpen ? 'scene-panel open' : 'scene-panel'}>
        <div className="panel-heading"><div><strong>场景</strong><small>{sceneKeys.size}/{activeQuest.scenes.length} 已显示</small></div><button onClick={() => setSceneOpen(false)}><X size={18} /></button></div>
        <div className="panel-actions"><button onClick={() => setSceneKeys(new Set(activeQuest.scenes.map((s) => s.key)))}>全选</button><button onClick={() => setSceneKeys(new Set())}>清空</button></div>
        <div className="scene-list">{activeQuest.scenes.map((scene, index) => <label key={scene.key}><input type="checkbox" checked={sceneKeys.has(scene.key)} onChange={() => setSceneKeys((current) => { const next = new Set(current); next.has(scene.key) ? next.delete(scene.key) : next.add(scene.key); return next })} /><span className="checkmark">{sceneKeys.has(scene.key) && <Check size={11} />}</span><span className="scene-num">{String(index + 1).padStart(2,'0')}</span><span><strong>{scene.title.zh}</strong><small>{scene.title.en}</small></span><em>{scene.lines.length}</em></label>)}</div>
      </aside>
      {sceneOpen && <button className="panel-scrim" onClick={() => setSceneOpen(false)} aria-label="关闭场景面板" />}
      <section className="script-column">
        <div className="reader-toolbar">
          <div className="view-pills">{VIEW_OPTIONS.map((v) => <button className={settings.viewMode === v.id ? 'active' : ''} onClick={() => setSettings({ ...settings, viewMode: v.id })} key={v.id}>{v.label}</button>)}</div>
          <div className="search-tools"><label className="reader-search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && searchMode === 'locate' && matchKeys.length) setMatchIndex((value) => (value + 1) % matchKeys.length) }} placeholder="搜角色或台词" />{query && <button onClick={() => setQuery('')}><X size={13} /></button>}</label><select aria-label="搜索方式" value={searchMode} onChange={(e) => setSearchMode(e.target.value as 'locate' | 'filter')}><option value="locate">定位</option><option value="filter">筛选</option></select>{query && searchMode === 'locate' && <div className="match-nav"><span>{matchKeys.length ? matchIndex + 1 : 0}/{matchKeys.length}</span><button disabled={!matchKeys.length} onClick={() => setMatchIndex((value) => (value - 1 + matchKeys.length) % matchKeys.length)}><ArrowUp size={12} /></button><button disabled={!matchKeys.length} onClick={() => setMatchIndex((value) => (value + 1) % matchKeys.length)}><ArrowDown size={12} /></button></div>}</div>
          <div className="role-filter"><button className={speakerKeys.size < availableSpeakers.length ? 'active' : ''} onClick={() => setRoleFilterOpen((value) => !value)}><Languages size={14} />角色 {speakerKeys.size}/{availableSpeakers.length}<ChevronDown size={12} /></button>{roleFilterOpen && <div className="role-filter-popover"><header><strong>角色与旅行者</strong><button onClick={() => setRoleFilterOpen(false)}><X size={14} /></button></header><label className="traveler-choice"><span>旅行者文本</span><select value={traveler} onChange={(e) => setTraveler(e.target.value as Traveler)}><option value="aether">空 · Aether</option><option value="lumine">荧 · Lumine</option></select></label><div className="role-filter-actions"><button onClick={() => setSpeakerKeys(new Set(availableSpeakers.map((speaker) => speaker.key)))}>全选</button><button onClick={() => setSpeakerKeys(new Set())}>清空</button></div><div className="role-filter-list">{availableSpeakers.map((speaker) => <label key={speaker.key}><input type="checkbox" checked={speakerKeys.has(speaker.key)} onChange={() => setSpeakerKeys((current) => { const next = new Set(current); next.has(speaker.key) ? next.delete(speaker.key) : next.add(speaker.key); return next })} /><span className="checkmark">{speakerKeys.has(speaker.key) && <Check size={10} />}</span><span><strong>{speaker.zh}</strong><small>{speaker.en}</small></span></label>)}</div></div>}</div>
          <button className={selectionMode ? 'selection-toggle active' : 'selection-toggle'} onClick={() => setSelectionMode((v) => !v)}><Check size={15} />选稿</button>
        </div>
        {selectionMode && <div className="selection-bar"><span>当前已选 <strong>{selectedVisible}</strong> / {visibleLineKeys.length} 句</span><div><button onClick={() => setVisible(true)}>选中当前结果</button><button onClick={() => setVisible(false)}>取消当前结果</button><button onClick={() => setSpeakerPicker((v) => !v)}>按角色选择</button><button onClick={() => setSelectedLines((current) => new Set(visibleLineKeys.filter((k) => !current.has(k))))}>反选</button><button className="queue-inline" disabled={!selectedVisible} onClick={() => onQueue(selectedLines, activeQuest, scenes)}><Plus size={13} />加入选稿池</button></div>{speakerPicker && <div className="speaker-picker"><header><strong>只选择某位角色的台词</strong><button onClick={() => setSpeakerPicker(false)}><X size={14} /></button></header><div>{speakers.map((speaker) => <button key={speaker.zh} onClick={() => selectSpeaker(speaker.zh)}><strong>{speaker.zh}</strong><small>{speaker.en}</small><em>{scenes.flatMap((s) => s.lines).filter((l) => l.speaker.zh === speaker.zh).length}</em></button>)}</div></div>}</div>}
        <div className={`script script-${settings.viewMode} ${selectionMode ? 'is-selecting' : ''}`}>
          <div className="script-meta"><span>{scenes.length} 个场景 · {visibleLineKeys.length} 句</span><span>点击行首方框，决定是否进入打印稿</span></div>
          {scenes.map((scene, sceneIndex) => <SceneBlock key={scene.key} scene={scene} sceneIndex={sceneIndex} mode={settings.viewMode} traveler={traveler} selected={selectedLines} toggle={toggleLine} selecting={selectionMode} query={searchMode === 'locate' ? query : ''} matches={new Set(matchKeys)} focusedKey={searchMode === 'locate' ? matchKeys[matchIndex] : undefined} />)}
          {!scenes.length && <Empty title="没有可显示的台词" detail="重新选择场景或清空搜索即可。" />}
        </div>
      </section>
    </div>
    <div className="mobile-action-dock"><button onClick={() => setSceneOpen(true)}><ListFilter size={17} /><span>场景</span></button><button className={selectionMode ? 'active' : ''} onClick={() => setSelectionMode((v) => !v)}><Check size={17} /><span>选稿 {selectedVisible}</span></button><button disabled={!selectedVisible} onClick={() => onQueue(selectedLines, activeQuest, scenes)}><Plus size={17} /><span>加入</span></button><button onClick={onOpenBasket}><ShoppingBasket size={17} /><span>选稿池 {basketSources}</span></button></div>
    <div className="desktop-print-actions"><button className="add-to-basket" disabled={!selectedVisible} onClick={() => onQueue(selectedLines, activeQuest, scenes)}><Plus size={16} />加入当前 {selectedVisible} 句</button><button className="desktop-print-fab" onClick={onOpenBasket}><ShoppingBasket size={17} />选稿池 / 打印 <span>{basketSources} 项 · {basketLines} 句</span></button></div>
  </main>
}

function SceneBlock({ scene, sceneIndex, mode, traveler, selected, toggle, selecting, query, matches, focusedKey }: { scene: Scene; sceneIndex: number; mode: ViewMode; traveler: Traveler; selected: Set<string>; toggle: (k: string) => void; selecting: boolean; query: string; matches: Set<string>; focusedKey?: string }) {
  return <section className="scene-block"><header><span>SCENE {String(sceneIndex + 1).padStart(2,'0')}</span><div><h3>{scene.title.zh}</h3><p>{scene.title.en}</p></div><em>{scene.lines.length} 句</em></header>{scene.lines.map((line, index) => <DialogueRow key={line.key} line={line} index={index} mode={mode} traveler={traveler} checked={selected.has(line.key)} toggle={() => toggle(line.key)} selecting={selecting} query={query} match={!query || matches.has(line.key)} focused={line.key === focusedKey} />)}</section>
}

function HighlightText({ text, query }: { text: string; query: string }) { if (!query.trim()) return <>{text || '—'}</>; const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const parts = text.split(new RegExp(`(${escaped})`, 'ig')); return <>{parts.map((part, index) => part.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) ? <mark key={index}>{part}</mark> : part)}</> }
function DialogueRow({ line, index, mode, traveler, checked, toggle, selecting, query, match, focused }: { line: DialogueLine; index: number; mode: ViewMode; traveler: Traveler; checked: boolean; toggle: () => void; selecting: boolean; query: string; match: boolean; focused: boolean }) {
  return <article data-line-key={line.key} className={`dialogue-row kind-${line.kind} ${checked ? 'selected' : 'not-selected'} ${query && !match ? 'search-muted' : ''} ${focused ? 'search-focused' : ''}`} onClick={() => selecting && toggle()}>
    <button className="line-select" onClick={(e) => { e.stopPropagation(); toggle() }} aria-label={checked ? '从打印稿移除' : '加入打印稿'}><span>{checked && <Check size={11} />}</span><small>{String(index + 1).padStart(2,'0')}</small></button>
    <div className="dialogue-main"><div className="speakers"><strong><HighlightText text={line.speaker.zh} query={query} /></strong><strong><HighlightText text={line.speaker.en} query={query} /></strong>{line.kind === 'choice' && <em>选择</em>}</div><div className="texts"><p lang="zh-CN"><HighlightText text={formatGameText(line.text.zh, traveler)} query={query} /></p><p lang="en"><HighlightText text={formatGameText(line.text.en, traveler)} query={query} /></p></div></div>
  </article>
}

function SettingsSheet({ value, onChange, onClose }: { value: AppSettings; onChange: (s: AppSettings) => void; onClose: () => void }) {
  return <Modal title="阅读设置" eyebrow="SETTINGS" onClose={onClose}><div className="settings-list">
    <SettingRow title="界面主题" detail="自动会跟随系统"><Segment value={value.theme} onChange={(v) => onChange({ ...value, theme: v as AppSettings['theme'] })} options={[["auto","自动"],["light","浅色"],["dark","深色"]]} /></SettingRow>
    <SettingRow title="默认对照方式" detail="进入阅读器时使用"><Segment value={value.viewMode} onChange={(v) => onChange({ ...value, viewMode: v as ViewMode })} options={VIEW_OPTIONS.slice(0,4).map((x) => [x.id,x.label])} /></SettingRow>
    <SettingRow title={`中文字号 · ${value.zhSize}px`} detail="只影响屏幕阅读"><input type="range" min="12" max="20" value={value.zhSize} onChange={(e) => onChange({ ...value, zhSize: Number(e.target.value) })} /></SettingRow>
    <SettingRow title={`英文字号 · ${value.enSize}px`} detail="只影响屏幕阅读"><input type="range" min="13" max="22" value={value.enSize} onChange={(e) => onChange({ ...value, enSize: Number(e.target.value) })} /></SettingRow>
    <SettingRow title="显示隐藏内容" detail="通常是游戏内部步骤"><Switch checked={value.showHidden} onChange={(v) => onChange({ ...value, showHidden: v })} /></SettingRow>
    <SettingRow title="显示未实装内容" detail="目录中带有来源标记的条目"><Switch checked={value.showUnreleased} onChange={(v) => onChange({ ...value, showUnreleased: v })} /></SettingRow>
    <button className="reset-settings" onClick={() => onChange(DEFAULT_SETTINGS)}><RotateCcw size={15} />恢复默认设置</button>
  </div></Modal>
}

function PrintStudio({ bundles, setBundles, traveler = 'aether', settings, setSettings, onClose, onNotice }: { bundles: PrintBundle[]; setBundles: (bundles: PrintBundle[]) => void; traveler?: Traveler; settings: PrintSettings; setSettings: (s: PrintSettings) => void; onClose: () => void; onNotice: (message: string) => void }) {
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState({ value: 0, label: '' })
  const [readyPrintUrl, setReadyPrintUrl] = useState('')
  const [printedAt] = useState(() => new Date().toLocaleString('zh-CN', { hour12: false }))
  const printRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const bands = settings.bands || DEFAULT_PRINT.bands
  const count = bundles.reduce((total, bundle) => total + bundle.scenes.reduce((n, scene) => n + scene.lines.length, 0), 0)
  const meta = printMeta(bundles)
  const baseWidth = settings.paper === 'a5' ? 559 : settings.paper === 'letter' ? 816 : 794
  const exportWidth = settings.orientation === 'landscape' ? Math.round(baseWidth * 1.414) : baseWidth
  const applyPrintAttrs = () => {
    const root = document.documentElement
    root.dataset.printLayout = settings.layout; root.dataset.printDensity = settings.density; root.dataset.printColor = settings.color; root.dataset.printPaper = settings.paper; root.dataset.printOrientation = settings.orientation
    root.style.setProperty('--print-font', `${settings.fontSize}pt`); root.style.setProperty('--print-margin', `${settings.margin}mm`)
  }
  const exportPdf = async (mode: 'save' | 'print' = 'save') => {
    if (!printRef.current || !count) return
    setReadyPrintUrl(''); setExporting(true); setExportProgress({ value: 8, label: '正在整理选稿池与排版设置…' }); applyPrintAttrs()
    try {
      const [{ default: html2pdf }, { default: html2canvas }] = await Promise.all([import('html2pdf.js'), import('html2canvas')])
      setExportProgress({ value: 24, label: '正在加载 PDF 字体与渲染引擎…' })
      const format = settings.paper === 'letter' ? 'letter' : settings.paper
      const baseMargin = settings.margin / 25.4
      const headerOn = bands.header.some((slot) => slot.content !== 'none')
      const footerOn = bands.footer.some((slot) => slot.content !== 'none')
      const pdfOptions = {
        margin: [baseMargin + (headerOn ? 0.22 : 0), baseMargin, baseMargin + (footerOn ? 0.22 : 0), baseMargin],
        filename: `${meta.chapter}-${bundles.length > 1 ? `选稿池-${bundles.length}项` : meta.quest}.pdf`,
        image: { type: 'jpeg', quality: 0.96 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'in', format, orientation: settings.orientation },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['.print-line', '.print-scene-header', '.print-source-header'] },
      } as Record<string, unknown>
      setExportProgress({ value: 38, label: `正在渲染 ${count} 句中英台词…` })
      const worker = (html2pdf() as any).set(pdfOptions).from(printRef.current).toPdf()
      const headerCanvas = headerOn && headerRef.current ? await html2canvas(headerRef.current, { scale: 2, backgroundColor: '#ffffff' }) : null
      const footerCanvas = footerOn && footerRef.current ? await html2canvas(footerRef.current, { scale: 2, backgroundColor: '#ffffff' }) : null
      await worker.get('pdf').then((pdf: any) => {
        const pages = pdf.internal.getNumberOfPages()
        setExportProgress({ value: 76, label: `已完成分页 · 正在写入 ${pages} 页页眉、页脚与页码…` })
        const width = pdf.internal.pageSize.getWidth()
        const height = pdf.internal.pageSize.getHeight()
        const bandWidth = width - baseMargin * 2
        const addBand = (canvas: HTMLCanvasElement | null, y: number) => {
          if (!canvas) return
          const bandHeight = bandWidth * canvas.height / canvas.width
          pdf.addImage(canvas.toDataURL('image/png'), 'PNG', baseMargin, y, bandWidth, bandHeight)
        }
        for (let page = 1; page <= pages; page++) {
          pdf.setPage(page)
          addBand(headerCanvas, Math.max(0.08, baseMargin * 0.35))
          const footerHeight = footerCanvas ? bandWidth * footerCanvas.height / footerCanvas.width : 0
          addBand(footerCanvas, height - Math.max(0.08, baseMargin * 0.35) - footerHeight)
          for (const [slots, y] of [[bands.header, Math.max(0.14, baseMargin * 0.35 + 0.09)], [bands.footer, height - Math.max(0.14, baseMargin * 0.35 + 0.05)]] as const) {
            slots.forEach((slot, index) => {
              if (slot.content !== 'page') return
              pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(70)
              const align = index === 0 ? 'left' : index === 1 ? 'center' : 'right'
              const x = index === 0 ? baseMargin : index === 1 ? width / 2 : width - baseMargin
              pdf.text(`${page} / ${pages}`, x, y, { align })
            })
          }
        }
        setExportProgress({ value: 94, label: '正在封装最终 PDF 文件…' })
        if (mode === 'save') { pdf.save(pdfOptions.filename); onNotice(`PDF 已生成 · ${pages} 页`) }
        else {
          const url = URL.createObjectURL(pdf.output('blob'))
          setReadyPrintUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return url })
          setExportProgress({ value: 100, label: `打印稿已就绪 · ${pages} 页` })
        }
      })
    } catch (error) {
      console.error(error)
      onNotice('PDF 生成失败，请稍后重试')
    } finally { setExporting(false) }
  }
  const moveBundle = (index: number, delta: number) => { const target = index + delta; if (target < 0 || target >= bundles.length) return; const next = [...bundles]; [next[index], next[target]] = [next[target], next[index]]; setBundles(next) }
  return <><Modal wide title="打印与 PDF 选稿台" eyebrow={`${bundles.length} SOURCES · ${count} LINES`} onClose={onClose}>
    <div className="print-studio"><section className="print-options-panel">
      <PrintGroup title="选稿池 · 可跨任务与章节"><div className="print-basket-list">{bundles.map((bundle, index) => <article key={bundle.key}><span>{String(index + 1).padStart(2,'0')}</span><div><strong>{bundle.quest.title.zh}</strong><small>{bundle.chapter.title.zh} · {bundle.scenes.length} 个场景 · {bundle.scenes.reduce((n, scene) => n + scene.lines.length, 0)} 句</small></div><button disabled={index === 0} onClick={() => moveBundle(index, -1)} aria-label="上移"><ArrowUp size={12} /></button><button disabled={index === bundles.length - 1} onClick={() => moveBundle(index, 1)} aria-label="下移"><ArrowDown size={12} /></button><button onClick={() => setBundles(bundles.filter((item) => item.key !== bundle.key))} aria-label="移除"><Trash2 size={12} /></button></article>)}</div></PrintGroup>
      <PrintGroup title="版式"><Segment value={settings.layout} onChange={(v) => setSettings({ ...settings, layout: v as PrintSettings['layout'] })} options={[["parallel","双栏"],["stacked","上下"],["zh","中文"],["en","英文"]]} /></PrintGroup>
      <PrintGroup title="密度"><Segment value={settings.density} onChange={(v) => setSettings({ ...settings, density: v as PrintSettings['density'], ...(v === 'ultra' && settings.margin > 6 ? { margin: 6 } : {}) })} options={[["comfortable","一般"],["compact","紧凑"],["ultra","超紧凑"]]} /></PrintGroup>
      <div className="print-grid"><PrintGroup title="纸张"><select value={settings.paper} onChange={(e) => setSettings({ ...settings, paper: e.target.value as PrintSettings['paper'] })}><option value="a4">A4</option><option value="a5">A5</option><option value="letter">Letter</option></select></PrintGroup><PrintGroup title="方向"><select value={settings.orientation} onChange={(e) => setSettings({ ...settings, orientation: e.target.value as PrintSettings['orientation'] })}><option value="portrait">纵向</option><option value="landscape">横向</option></select></PrintGroup></div>
      <PrintGroup title={`正文字号 · ${settings.fontSize}pt`}><input type="range" min="7" max="13" value={settings.fontSize} onChange={(e) => setSettings({ ...settings, fontSize: Number(e.target.value) })} /></PrintGroup>
      <PrintGroup title={`页边距 · ${settings.margin}mm`}><input type="range" min="6" max="24" step="2" value={settings.margin} onChange={(e) => setSettings({ ...settings, margin: Number(e.target.value) })} /></PrintGroup>
      <PrintGroup title="颜色"><Segment value={settings.color} onChange={(v) => setSettings({ ...settings, color: v as PrintSettings['color'] })} options={[["full","彩色"],["accent","省墨"],["mono","黑白"]]} /></PrintGroup>
      <div className="print-toggles"><ToggleLine label="封面" value={settings.cover} set={(v) => setSettings({ ...settings, cover: v })} /><ToggleLine label="场景标题" value={settings.sceneTitles} set={(v) => setSettings({ ...settings, sceneTitles: v })} /><ToggleLine label="说话人" value={settings.speakers} set={(v) => setSettings({ ...settings, speakers: v })} /><ToggleLine label="行号" value={settings.lineNumbers} set={(v) => setSettings({ ...settings, lineNumbers: v })} /></div>
      <PrintBandEditor bands={bands} onChange={(next) => setSettings({ ...settings, bands: next })} />
    </section><section className="print-preview-wrap"><div className="preview-label"><span>实时预览</span><em>{settings.paper.toUpperCase()} · {settings.density === 'ultra' ? '超紧凑' : settings.density === 'compact' ? '紧凑' : '一般'}</em></div><div className="mini-paper"><PrintDocument bundles={bundles} traveler={traveler} settings={settings} printedAt={printedAt} /></div></section></div>
    <div className="print-footer"><p><CircleHelp size={15} />打印与下载共用同一套分页；系统打印会在新窗口打开完整 PDF。</p><div><button className="secondary-action" onClick={() => exportPdf('print')} disabled={!count || exporting}><Printer size={16} />系统打印</button><button className="primary-action" onClick={() => exportPdf('save')} disabled={!count || exporting}>{exporting ? <LoaderCircle className="spin" size={16} /> : <FileDown size={16} />}{exporting ? '正在生成…' : '直接导出 PDF'}</button></div></div>
  </Modal>{(exporting || readyPrintUrl) && <div className="progress-overlay"><section><span>PDF COMPOSITOR</span>{exporting ? <LoaderCircle className="spin" size={28} /> : <Check size={28} />}<h3>{exporting ? '正在生成排版文件' : '打印稿已经准备好'}</h3><p>{exportProgress.label}</p><div className="progress-track"><i style={{ width: `${exportProgress.value}%` }} /></div><small>{exportProgress.value}%</small>{readyPrintUrl && <div className="progress-actions"><button onClick={() => { const url = readyPrintUrl; window.open(url, '_blank'); setReadyPrintUrl(''); window.setTimeout(() => URL.revokeObjectURL(url), 120000); onNotice('已打开打印稿') }}><Printer size={15} />打开并打印</button><button onClick={() => { URL.revokeObjectURL(readyPrintUrl); setReadyPrintUrl('') }}>稍后</button></div>}</section></div>}<div className="pdf-export-root" style={{ width: exportWidth }}><PrintDocument ref={printRef} hideBands bundles={bundles} traveler={traveler} settings={settings} printedAt={printedAt} /><div className="pdf-band-source"><RunningBand ref={headerRef} slots={bands.header} meta={meta} printedAt={printedAt} /><RunningBand ref={footerRef} slots={bands.footer} meta={meta} printedAt={printedAt} /></div></div><div className="print-only-root"><PrintDocument bundles={bundles} traveler={traveler} settings={settings} printedAt={printedAt} /></div></>
}

type PrintMeta = { chapter: string; chapterEn: string; quest: string; questEn: string }
const printMeta = (bundles: PrintBundle[]): PrintMeta => bundles.length === 1
  ? { chapter: bundles[0].chapter.title.zh, chapterEn: bundles[0].chapter.title.en, quest: bundles[0].quest.title.zh, questEn: bundles[0].quest.title.en }
  : { chapter: '跨章节双语选稿', chapterEn: 'Bilingual Script Collection', quest: `${bundles.length} 项选稿`, questEn: `${bundles.length} selected sections` }
const slotText = (slot: PrintSlot, meta: PrintMeta, printedAt: string) => ({ none: '', chapter: meta.chapter, quest: meta.quest, printedAt, version: APP_VERSION, page: '', custom: slot.custom }[slot.content])
const RunningBand = forwardRef<HTMLDivElement, { slots: PrintSlot[]; meta: PrintMeta; printedAt: string; className?: string }>(({ slots, meta, printedAt, className = '' }, ref) => <div ref={ref} className={`running-band ${className}`}>{slots.map((slot) => <span key={slot.id} data-page-slot={slot.content === 'page' || undefined}>{slot.content === 'page' ? <span className="page-counter" /> : slotText(slot, meta, printedAt)}</span>)}</div>)

const PrintDocument = forwardRef<HTMLDivElement, { bundles: PrintBundle[]; traveler: Traveler; settings: PrintSettings; printedAt: string; hideBands?: boolean }>(({ bundles, traveler, settings, printedAt, hideBands = false }, ref) => {
  const meta = printMeta(bundles)
  const sceneCount = bundles.reduce((total, bundle) => total + bundle.scenes.length, 0)
  const lineCount = bundles.reduce((total, bundle) => total + bundle.scenes.reduce((n, scene) => n + scene.lines.length, 0), 0)
  return <div ref={ref} className={`print-document density-${settings.density} layout-${settings.layout} color-${settings.color} ${settings.lineNumbers ? '' : 'no-line-numbers'}`} style={{ '--doc-font': `${settings.fontSize}pt` } as React.CSSProperties}>
    {!hideBands && <><RunningBand slots={(settings.bands || DEFAULT_PRINT.bands).header} meta={meta} printedAt={printedAt} className="print-running-header" /><RunningBand slots={(settings.bands || DEFAULT_PRINT.bands).footer} meta={meta} printedAt={printedAt} className="print-running-footer" /></>}
    {settings.cover && <header className="print-cover-page"><span>TEYVAT SCRIPTORIUM · BILINGUAL SCRIPT</span><h1>{meta.chapter}</h1><h2>{meta.chapterEn}</h2><p>{meta.quest} · {meta.questEn}</p><small>{bundles.length} 项来源 · {sceneCount} 个场景 · {lineCount} 句选稿</small></header>}
    {bundles.map((bundle, bundleIndex) => <section className="print-source" key={bundle.key}>
      {bundles.length > 1 && <header className="print-source-header"><span>PART {String(bundleIndex + 1).padStart(2,'0')}</span><div><strong>{bundle.quest.title.zh}</strong><small>{bundle.quest.title.en} · {bundle.chapter.title.zh}</small></div></header>}
      {bundle.scenes.map((scene, si) => <section className="print-scene" key={`${bundle.key}:${scene.key}`}>{settings.sceneTitles && <header className="print-scene-header"><span>SCENE {String(si + 1).padStart(2,'0')}</span><div><strong>{scene.title.zh}</strong><small>{scene.title.en}</small></div></header>}{scene.lines.map((line, li) => {
        const previous = scene.lines[li - 1]
        const repeatedSpeaker = Boolean(li && line.speaker.zh && line.speaker.zh === previous?.speaker.zh && line.speaker.en === previous?.speaker.en)
        return <div className={`print-line kind-${line.kind} ${repeatedSpeaker ? 'same-speaker' : ''}`} key={line.key}>{settings.lineNumbers && <span className="print-number">{String(li + 1).padStart(3,'0')}</span>}<div className="print-cell zh">{settings.speakers && !repeatedSpeaker && line.speaker.zh && <strong>{line.speaker.zh}</strong>}<p>{formatGameText(line.text.zh, traveler)}</p></div><div className="print-cell en">{settings.speakers && !repeatedSpeaker && line.speaker.en && <strong>{line.speaker.en}</strong>}<p>{formatGameText(line.text.en, traveler)}</p></div></div>
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
function SettingRow({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) { return <div className="setting-row"><div><strong>{title}</strong><small>{detail}</small></div>{children}</div> }
function Segment({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[][] }) { return <div className="segment">{options.map(([v,l]) => <button className={value === v ? 'active' : ''} onClick={() => onChange(v)} key={v}>{l}</button>)}</div> }
function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) { return <button className={checked ? 'switch on' : 'switch'} onClick={() => onChange(!checked)}><span /></button> }
function PrintGroup({ title, children }: { title: string; children: React.ReactNode }) { return <div className="print-group"><label>{title}</label>{children}</div> }
function ToggleLine({ label, value, set }: { label: string; value: boolean; set: (v: boolean) => void }) { return <label><input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} /><span>{value && <Check size={11} />}</span>{label}</label> }
function Toast({ message, onClose }: { message: string; onClose: () => void }) { useEffect(() => { const timer = setTimeout(onClose, 2600); return () => clearTimeout(timer) }, [message, onClose]); return <div className="notice-toast"><Check size={15} /><span>{message}</span><button onClick={onClose}><X size={14} /></button></div> }

function Changelog({ onClose }: { onClose: () => void }) { return <Modal title="更新日志" eyebrow="CHANGELOG" onClose={onClose}><div className="changelog"><article><span>v0.3.0 · 2026-08-12</span><h3>选稿池、上下文搜索与自动更新</h3><ul><li>浏览器前进、后退可正常往返目录和剧情页</li><li>跨 act、episode、scene 与章节的选稿池，可合并、删除和排序</li><li>搜索分为上下文定位与筛选打印，支持高亮、淡化和逐条跳转</li><li>多选角色筛选与旅行者性别面板</li><li>超紧凑 PDF 全面收紧标题、行距与段距；连续同一说话人只署名一次</li><li>剧情加载、PDF 生成进度条和轻量 Toast；打印完成前不打开白页</li><li>每次打开后台检查最新目录，GitHub 每日保存数据快照</li></ul></article><article><span>v0.2.0 · 2026-08-12</span><h3>资料库与选稿台</h3><ul><li>加入 1,714 个任务的中英轻量目录与多维筛选</li><li>用 Yatta 更新记录与 Wiki 分类补足早期版本、地区元数据，并标明待考证项</li><li>正文按需获取并在会话内缓存；手机增加场景、选稿、打印快捷栏</li><li>逐句选择、搜索结果批量选择、角色选择与反选</li><li>A4 / A5 / Letter、四种版式、三档密度、字号、边距、颜色与 PDF 导出</li><li>可拖拽页眉页脚六槽位，支持标题、时间、版本、自定义文字和页码</li><li>持久化阅读设置和完整深色模式</li></ul></article><article><span>v0.1.0 · 2026-08-12</span><h3>第一版</h3><p>上线第 1700 章中英逐句阅读、五种阅读版式与基础打印。</p></article></div></Modal> }

export default function App() {
  const { catalog, catalogSync, chapter, setChapter, loadChapter, loading, loadProgress, error, setError } = useData()
  const [page, setPage] = useState<'catalog' | 'reader'>('catalog')
  const [settings, setSettings] = useStoredState<AppSettings>('teyvat:settings', DEFAULT_SETTINGS)
  const [printSettings, setPrintSettings] = useStoredState<PrintSettings>('teyvat:print', DEFAULT_PRINT)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [basket, setBasket] = useSessionState<PrintBundle[]>('teyvat:print-basket', [])
  const [printOpen, setPrintOpen] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => { if (!catalogSync.checking && (catalogSync.added || catalogSync.modified)) setNotice(`剧情目录已更新 · 新增 ${catalogSync.added}，修订 ${catalogSync.modified}`) }, [catalogSync])
  useEffect(() => {
    const resolved = settings.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : settings.theme
    document.documentElement.dataset.theme = resolved
  }, [settings.theme])
  const showLocation = async () => {
    const id = Number(new URLSearchParams(location.search).get('chapter'))
    if (id) { if (await loadChapter(id)) setPage('reader') }
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
    if (await loadChapter(item.id)) {
      history.pushState({ teyvat: true, page: 'reader', fromCatalog: true }, '', `?chapter=${item.id}`)
      setPage('reader')
    }
  }
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
    {loading && <div className="loading-overlay"><LoaderCircle className="spin" /><strong>正在按需取得中英剧情…</strong><span>{loadProgress.label}</span><div className="load-progress"><i style={{ width: `${loadProgress.value}%` }} /></div><small>{loadProgress.value}%</small></div>}
    {error && <div className="error-toast"><span>{error}</span><button onClick={() => { setError(''); if (page === 'reader' && !chapter) back() }}><X size={16} /></button></div>}
    {settingsOpen && <SettingsSheet value={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} />}
    {changelogOpen && <Changelog onClose={() => setChangelogOpen(false)} />}
    {printOpen && basket.length > 0 && <PrintStudio bundles={basket} setBundles={(next) => { setBasket(next); if (!next.length) setPrintOpen(false) }} settings={printSettings} setSettings={setPrintSettings} onClose={() => setPrintOpen(false)} onNotice={setNotice} />}
    {notice && <Toast message={notice} onClose={() => setNotice('')} />}
  </div>
}
