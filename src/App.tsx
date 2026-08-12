import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, BookOpenText, Check, ChevronDown, ChevronsUpDown, CircleHelp, Clock3,
  Download, ExternalLink, FileDown, FileText, Filter, GripVertical, Languages, LibraryBig, ListFilter,
  LoaderCircle, Menu, Moon, MoreHorizontal, PanelBottomOpen, Printer, RotateCcw, Search,
  Settings, SlidersHorizontal, Snowflake, Sun, X,
} from 'lucide-react'
import { filterScenes } from './lib/filter'
import { formatGameText, normalizeSearch } from './lib/text'
import type {
  AppSettings, CatalogData, CatalogItem, ChapterData, DialogueLine, PrintSettings, PrintSlot,
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
const APP_VERSION = 'v0.2.0'

function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { return { ...initial as object, ...JSON.parse(localStorage.getItem(key) || '{}') } as T } catch { return initial }
  })
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)) }, [key, value])
  return [value, setValue] as const
}

function useData() {
  const [catalog, setCatalog] = useState<CatalogData | null>(null)
  const [chapter, setChapter] = useState<ChapterData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { fetch('/data/catalog.json').then((r) => r.json()).then(setCatalog).catch((e) => setError(String(e))) }, [])
  async function loadChapter(id: number) {
    setLoading(true); setError('')
    try {
      const cached = sessionStorage.getItem(`chapter:${id}`)
      if (cached) { setChapter(JSON.parse(cached)); return true }
      const url = id === 1700 ? '/data/quest-1700.json' : `/api/quest/${id}`
      const response = await fetch(url)
      if (!response.ok) throw new Error(response.status === 404 ? '这个任务暂时没有可读取的正文。' : `正文载入失败（${response.status}）`)
      const data = await response.json() as ChapterData
      setChapter(data)
      try { sessionStorage.setItem(`chapter:${id}`, JSON.stringify(data)) } catch { /* large chapter; memory cache still works */ }
      return true
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); return false }
    finally { setLoading(false) }
  }
  return { catalog, chapter, setChapter, loadChapter, loading, error, setError }
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

function Catalog({ data, settings, onOpen }: { data: CatalogData; settings: AppSettings; onOpen: (item: CatalogItem) => void }) {
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
      <div className="catalog-result-line"><span>找到 <strong>{items.length}</strong> 个任务</span><span>{data.versionCoverage.note}</span></div>
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

function Reader({ data, settings, setSettings, onBack, onPrint }: {
  data: ChapterData; settings: AppSettings; setSettings: (s: AppSettings) => void; onBack: () => void;
  onPrint: (selection: Set<string>, quest: Quest, scenes: Scene[]) => void
}) {
  const [questId, setQuestId] = useState(data.quests[0]?.id)
  const [sceneKeys, setSceneKeys] = useState<Set<string>>(new Set())
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [traveler, setTraveler] = useState<Traveler>('aether')
  const [sceneOpen, setSceneOpen] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [speakerPicker, setSpeakerPicker] = useState(false)
  const activeQuest = data.quests.find((q) => q.id === questId) || data.quests[0]
  useEffect(() => {
    const keys = activeQuest.scenes.map((s) => s.key)
    setSceneKeys(new Set(keys))
    setSelectedLines(new Set(activeQuest.scenes.flatMap((s) => s.lines.map((l) => l.key))))
    setQuery('')
  }, [activeQuest.id])
  const scenes = useMemo(() => filterScenes(activeQuest.scenes, sceneKeys, query, traveler), [activeQuest, sceneKeys, query, traveler])
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
          <label className="reader-search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜角色或台词" />{query && <button onClick={() => setQuery('')}><X size={13} /></button>}</label>
          <label className="traveler"><Languages size={14} /><select value={traveler} onChange={(e) => setTraveler(e.target.value as Traveler)}><option value="aether">空 Aether</option><option value="lumine">荧 Lumine</option></select></label>
          <button className={selectionMode ? 'selection-toggle active' : 'selection-toggle'} onClick={() => setSelectionMode((v) => !v)}><Check size={15} />选稿</button>
        </div>
        {selectionMode && <div className="selection-bar"><span>当前已选 <strong>{selectedVisible}</strong> / {visibleLineKeys.length} 句</span><div><button onClick={() => setVisible(true)}>选中当前结果</button><button onClick={() => setVisible(false)}>取消当前结果</button><button onClick={() => setSpeakerPicker((v) => !v)}>按角色选择</button><button onClick={() => setSelectedLines((current) => new Set(visibleLineKeys.filter((k) => !current.has(k))))}>反选</button></div>{speakerPicker && <div className="speaker-picker"><header><strong>只选择某位角色的台词</strong><button onClick={() => setSpeakerPicker(false)}><X size={14} /></button></header><div>{speakers.map((speaker) => <button key={speaker.zh} onClick={() => selectSpeaker(speaker.zh)}><strong>{speaker.zh}</strong><small>{speaker.en}</small><em>{scenes.flatMap((s) => s.lines).filter((l) => l.speaker.zh === speaker.zh).length}</em></button>)}</div></div>}</div>}
        <div className={`script script-${settings.viewMode} ${selectionMode ? 'is-selecting' : ''}`}>
          <div className="script-meta"><span>{scenes.length} 个场景 · {visibleLineKeys.length} 句</span><span>点击行首方框，决定是否进入打印稿</span></div>
          {scenes.map((scene, sceneIndex) => <SceneBlock key={scene.key} scene={scene} sceneIndex={sceneIndex} mode={settings.viewMode} traveler={traveler} selected={selectedLines} toggle={toggleLine} selecting={selectionMode} />)}
          {!scenes.length && <Empty title="没有可显示的台词" detail="重新选择场景或清空搜索即可。" />}
        </div>
      </section>
    </div>
    <div className="mobile-action-dock"><button onClick={() => setSceneOpen(true)}><ListFilter size={17} /><span>场景</span></button><button className={selectionMode ? 'active' : ''} onClick={() => setSelectionMode((v) => !v)}><Check size={17} /><span>选稿 {selectedVisible}</span></button><button onClick={() => onPrint(selectedLines, activeQuest, scenes)}><Printer size={17} /><span>打印 / PDF</span></button></div>
    <button className="desktop-print-fab" onClick={() => onPrint(selectedLines, activeQuest, scenes)}><Printer size={17} />打印 / 导出 PDF <span>{selectedLines.size}</span></button>
  </main>
}

function SceneBlock({ scene, sceneIndex, mode, traveler, selected, toggle, selecting }: { scene: Scene; sceneIndex: number; mode: ViewMode; traveler: Traveler; selected: Set<string>; toggle: (k: string) => void; selecting: boolean }) {
  return <section className="scene-block"><header><span>SCENE {String(sceneIndex + 1).padStart(2,'0')}</span><div><h3>{scene.title.zh}</h3><p>{scene.title.en}</p></div><em>{scene.lines.length} 句</em></header>{scene.lines.map((line, index) => <DialogueRow key={line.key} line={line} index={index} mode={mode} traveler={traveler} checked={selected.has(line.key)} toggle={() => toggle(line.key)} selecting={selecting} />)}</section>
}

function DialogueRow({ line, index, mode, traveler, checked, toggle, selecting }: { line: DialogueLine; index: number; mode: ViewMode; traveler: Traveler; checked: boolean; toggle: () => void; selecting: boolean }) {
  return <article className={`dialogue-row kind-${line.kind} ${checked ? 'selected' : 'not-selected'}`} onClick={() => selecting && toggle()}>
    <button className="line-select" onClick={(e) => { e.stopPropagation(); toggle() }} aria-label={checked ? '从打印稿移除' : '加入打印稿'}><span>{checked && <Check size={11} />}</span><small>{String(index + 1).padStart(2,'0')}</small></button>
    <div className="dialogue-main"><div className="speakers"><strong>{line.speaker.zh}</strong><strong>{line.speaker.en}</strong>{line.kind === 'choice' && <em>选择</em>}</div><div className="texts"><p lang="zh-CN">{formatGameText(line.text.zh, traveler) || '—'}</p><p lang="en">{formatGameText(line.text.en, traveler) || '—'}</p></div></div>
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

function PrintStudio({ chapter, quest, scenes, selected, traveler = 'aether', settings, setSettings, onClose }: { chapter: ChapterData; quest: Quest; scenes: Scene[]; selected: Set<string>; traveler?: Traveler; settings: PrintSettings; setSettings: (s: PrintSettings) => void; onClose: () => void }) {
  const [exporting, setExporting] = useState(false)
  const [printedAt] = useState(() => new Date().toLocaleString('zh-CN', { hour12: false }))
  const printRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const bands = settings.bands || DEFAULT_PRINT.bands
  const selectedScenes = scenes.map((scene) => ({ ...scene, lines: scene.lines.filter((line) => selected.has(line.key)) })).filter((scene) => scene.lines.length)
  const count = selectedScenes.reduce((n,s) => n + s.lines.length, 0)
  const baseWidth = settings.paper === 'a5' ? 559 : settings.paper === 'letter' ? 816 : 794
  const exportWidth = settings.orientation === 'landscape' ? Math.round(baseWidth * 1.414) : baseWidth
  const applyPrintAttrs = () => {
    const root = document.documentElement
    root.dataset.printLayout = settings.layout; root.dataset.printDensity = settings.density; root.dataset.printColor = settings.color; root.dataset.printPaper = settings.paper; root.dataset.printOrientation = settings.orientation
    root.style.setProperty('--print-font', `${settings.fontSize}pt`); root.style.setProperty('--print-margin', `${settings.margin}mm`)
  }
  const exportPdf = async (mode: 'save' | 'print' = 'save') => {
    if (!printRef.current || !count) return
    const printWindow = mode === 'print' ? window.open('', '_blank') : null
    if (printWindow) printWindow.document.write('<title>正在准备打印</title><p style="font:16px system-ui;padding:30px">正在生成带页眉页脚的打印稿，请稍候…</p>')
    setExporting(true); applyPrintAttrs()
    try {
      const [{ default: html2pdf }, { default: html2canvas }] = await Promise.all([import('html2pdf.js'), import('html2canvas')])
      const format = settings.paper === 'letter' ? 'letter' : settings.paper
      const baseMargin = settings.margin / 25.4
      const headerOn = bands.header.some((slot) => slot.content !== 'none')
      const footerOn = bands.footer.some((slot) => slot.content !== 'none')
      const pdfOptions = {
        margin: [baseMargin + (headerOn ? 0.22 : 0), baseMargin, baseMargin + (footerOn ? 0.22 : 0), baseMargin],
        filename: `${chapter.chapter.title.zh}-${quest.title.zh}.pdf`,
        image: { type: 'jpeg', quality: 0.96 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'in', format, orientation: settings.orientation },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['.print-line', '.print-scene-header'] },
      } as Record<string, unknown>
      const worker = (html2pdf() as any).set(pdfOptions).from(printRef.current).toPdf()
      const headerCanvas = headerOn && headerRef.current ? await html2canvas(headerRef.current, { scale: 2, backgroundColor: '#ffffff' }) : null
      const footerCanvas = footerOn && footerRef.current ? await html2canvas(footerRef.current, { scale: 2, backgroundColor: '#ffffff' }) : null
      await worker.get('pdf').then((pdf: any) => {
        const pages = pdf.internal.getNumberOfPages()
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
        if (mode === 'save') pdf.save(pdfOptions.filename)
        else {
          const url = URL.createObjectURL(pdf.output('blob'))
          if (printWindow) printWindow.location.replace(url)
          else window.open(url, '_blank')
          setTimeout(() => URL.revokeObjectURL(url), 120000)
        }
      })
    } catch (error) {
      printWindow?.close()
      throw error
    } finally { setExporting(false) }
  }
  return <><Modal wide title="打印与 PDF 选稿台" eyebrow={`${count} LINES SELECTED`} onClose={onClose}>
    <div className="print-studio"><section className="print-options-panel">
      <PrintGroup title="版式"><Segment value={settings.layout} onChange={(v) => setSettings({ ...settings, layout: v as PrintSettings['layout'] })} options={[["parallel","双栏"],["stacked","上下"],["zh","中文"],["en","英文"]]} /></PrintGroup>
      <PrintGroup title="密度"><Segment value={settings.density} onChange={(v) => setSettings({ ...settings, density: v as PrintSettings['density'] })} options={[["comfortable","一般"],["compact","紧凑"],["ultra","超紧凑"]]} /></PrintGroup>
      <div className="print-grid"><PrintGroup title="纸张"><select value={settings.paper} onChange={(e) => setSettings({ ...settings, paper: e.target.value as PrintSettings['paper'] })}><option value="a4">A4</option><option value="a5">A5</option><option value="letter">Letter</option></select></PrintGroup><PrintGroup title="方向"><select value={settings.orientation} onChange={(e) => setSettings({ ...settings, orientation: e.target.value as PrintSettings['orientation'] })}><option value="portrait">纵向</option><option value="landscape">横向</option></select></PrintGroup></div>
      <PrintGroup title={`正文字号 · ${settings.fontSize}pt`}><input type="range" min="7" max="13" value={settings.fontSize} onChange={(e) => setSettings({ ...settings, fontSize: Number(e.target.value) })} /></PrintGroup>
      <PrintGroup title={`页边距 · ${settings.margin}mm`}><input type="range" min="6" max="24" step="2" value={settings.margin} onChange={(e) => setSettings({ ...settings, margin: Number(e.target.value) })} /></PrintGroup>
      <PrintGroup title="颜色"><Segment value={settings.color} onChange={(v) => setSettings({ ...settings, color: v as PrintSettings['color'] })} options={[["full","彩色"],["accent","省墨"],["mono","黑白"]]} /></PrintGroup>
      <div className="print-toggles"><ToggleLine label="封面" value={settings.cover} set={(v) => setSettings({ ...settings, cover: v })} /><ToggleLine label="场景标题" value={settings.sceneTitles} set={(v) => setSettings({ ...settings, sceneTitles: v })} /><ToggleLine label="说话人" value={settings.speakers} set={(v) => setSettings({ ...settings, speakers: v })} /><ToggleLine label="行号" value={settings.lineNumbers} set={(v) => setSettings({ ...settings, lineNumbers: v })} /></div>
      <PrintBandEditor bands={bands} onChange={(next) => setSettings({ ...settings, bands: next })} />
    </section><section className="print-preview-wrap"><div className="preview-label"><span>实时预览</span><em>{settings.paper.toUpperCase()} · {settings.density === 'ultra' ? '超紧凑' : settings.density === 'compact' ? '紧凑' : '一般'}</em></div><div className="mini-paper"><PrintDocument chapter={chapter} quest={quest} scenes={selectedScenes} traveler={traveler} settings={settings} printedAt={printedAt} /></div></section></div>
    <div className="print-footer"><p><CircleHelp size={15} />打印与下载共用同一套分页；系统打印会在新窗口打开完整 PDF。</p><div><button className="secondary-action" onClick={() => exportPdf('print')} disabled={!count || exporting}><Printer size={16} />系统打印</button><button className="primary-action" onClick={() => exportPdf('save')} disabled={!count || exporting}>{exporting ? <LoaderCircle className="spin" size={16} /> : <FileDown size={16} />}{exporting ? '正在生成…' : '直接导出 PDF'}</button></div></div>
  </Modal><div className="pdf-export-root" style={{ width: exportWidth }}><PrintDocument ref={printRef} hideBands chapter={chapter} quest={quest} scenes={selectedScenes} traveler={traveler} settings={settings} printedAt={printedAt} /><div className="pdf-band-source"><RunningBand ref={headerRef} slots={bands.header} chapter={chapter} quest={quest} printedAt={printedAt} /><RunningBand ref={footerRef} slots={bands.footer} chapter={chapter} quest={quest} printedAt={printedAt} /></div></div><div className="print-only-root"><PrintDocument chapter={chapter} quest={quest} scenes={selectedScenes} traveler={traveler} settings={settings} printedAt={printedAt} /></div></>
}

const slotText = (slot: PrintSlot, chapter: ChapterData, quest: Quest, printedAt: string) => ({ none: '', chapter: chapter.chapter.title.zh, quest: quest.title.zh, printedAt, version: APP_VERSION, page: '', custom: slot.custom }[slot.content])
const RunningBand = forwardRef<HTMLDivElement, { slots: PrintSlot[]; chapter: ChapterData; quest: Quest; printedAt: string; className?: string }>(({ slots, chapter, quest, printedAt, className = '' }, ref) => <div ref={ref} className={`running-band ${className}`}>{slots.map((slot) => <span key={slot.id} data-page-slot={slot.content === 'page' || undefined}>{slot.content === 'page' ? <span className="page-counter" /> : slotText(slot, chapter, quest, printedAt)}</span>)}</div>)

const PrintDocument = forwardRef<HTMLDivElement, { chapter: ChapterData; quest: Quest; scenes: Scene[]; traveler: Traveler; settings: PrintSettings; printedAt: string; hideBands?: boolean }>(({ chapter, quest, scenes, traveler, settings, printedAt, hideBands = false }, ref) => <div ref={ref} className={`print-document density-${settings.density} layout-${settings.layout} color-${settings.color} ${settings.lineNumbers ? '' : 'no-line-numbers'}`} style={{ '--doc-font': `${settings.fontSize}pt` } as React.CSSProperties}>
  {!hideBands && <><RunningBand slots={(settings.bands || DEFAULT_PRINT.bands).header} chapter={chapter} quest={quest} printedAt={printedAt} className="print-running-header" /><RunningBand slots={(settings.bands || DEFAULT_PRINT.bands).footer} chapter={chapter} quest={quest} printedAt={printedAt} className="print-running-footer" /></>}
  {settings.cover && <header className="print-cover-page"><span>TEYVAT SCRIPTORIUM · BILINGUAL SCRIPT</span><h1>{chapter.chapter.title.zh}</h1><h2>{chapter.chapter.title.en}</h2><p>{quest.title.zh} · {quest.title.en}</p><small>{scenes.length} 个场景 · {scenes.reduce((n,s) => n + s.lines.length, 0)} 句选稿</small></header>}
  {scenes.map((scene, si) => <section className="print-scene" key={scene.key}>{settings.sceneTitles && <header className="print-scene-header"><span>SCENE {String(si + 1).padStart(2,'0')}</span><div><strong>{scene.title.zh}</strong><small>{scene.title.en}</small></div></header>}{scene.lines.map((line, li) => <div className={`print-line kind-${line.kind}`} key={line.key}>{settings.lineNumbers && <span className="print-number">{String(li + 1).padStart(3,'0')}</span>}<div className="print-cell zh">{settings.speakers && <strong>{line.speaker.zh}</strong>}<p>{formatGameText(line.text.zh, traveler)}</p></div><div className="print-cell en">{settings.speakers && <strong>{line.speaker.en}</strong>}<p>{formatGameText(line.text.en, traveler)}</p></div></div>)}</section>)}
</div>)

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

function Changelog({ onClose }: { onClose: () => void }) { return <Modal title="更新日志" eyebrow="CHANGELOG" onClose={onClose}><div className="changelog"><article><span>v0.2.0 · 2026-08-12</span><h3>资料库与选稿台</h3><ul><li>加入 1,714 个任务的中英轻量目录与多维筛选</li><li>用 Yatta 更新记录与 Wiki 分类补足早期版本、地区元数据，并标明待考证项</li><li>正文按需获取并在会话内缓存；手机增加场景、选稿、打印快捷栏</li><li>逐句选择、搜索结果批量选择、角色选择与反选</li><li>A4 / A5 / Letter、四种版式、三档密度、字号、边距、颜色与 PDF 导出</li><li>可拖拽页眉页脚六槽位，支持标题、时间、版本、自定义文字和页码</li><li>持久化阅读设置和完整深色模式</li></ul></article><article><span>v0.1.0 · 2026-08-12</span><h3>第一版</h3><p>上线第 1700 章中英逐句阅读、五种阅读版式与基础打印。</p></article></div></Modal> }

export default function App() {
  const { catalog, chapter, setChapter, loadChapter, loading, error, setError } = useData()
  const [page, setPage] = useState<'catalog' | 'reader'>('catalog')
  const [settings, setSettings] = useStoredState<AppSettings>('teyvat:settings', DEFAULT_SETTINGS)
  const [printSettings, setPrintSettings] = useStoredState<PrintSettings>('teyvat:print', DEFAULT_PRINT)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [printState, setPrintState] = useState<{ selection: Set<string>; quest: Quest; scenes: Scene[] } | null>(null)
  useEffect(() => {
    const resolved = settings.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : settings.theme
    document.documentElement.dataset.theme = resolved
  }, [settings.theme])
  const openItem = async (item: CatalogItem) => { if (await loadChapter(item.id)) { setPage('reader'); history.replaceState(null, '', `?chapter=${item.id}`) } }
  useEffect(() => { const id = Number(new URLSearchParams(location.search).get('chapter')); if (id) loadChapter(id).then((ok) => ok && setPage('reader')) }, [])
  const back = () => { setPage('catalog'); setChapter(null); setError(''); history.replaceState(null, '', location.pathname) }
  const resolvedTheme = document.documentElement.dataset.theme || 'light'
  return <div className="app-shell"><Header page={page} theme={resolvedTheme} onTheme={() => setSettings({ ...settings, theme: resolvedTheme === 'dark' ? 'light' : 'dark' })} onCatalog={back} onSettings={() => setSettingsOpen(true)} onChangelog={() => setChangelogOpen(true)} />
    {page === 'catalog' && catalog && <Catalog data={catalog} settings={settings} onOpen={openItem} />}
    {page === 'catalog' && !catalog && !error && <div className="loading-page"><LoaderCircle className="spin" /><span>正在整理任务目录…</span></div>}
    {page === 'reader' && chapter && <Reader data={chapter} settings={settings} setSettings={setSettings} onBack={back} onPrint={(selection, quest, scenes) => setPrintState({ selection, quest, scenes })} />}
    {loading && <div className="loading-overlay"><LoaderCircle className="spin" /><strong>正在按需取得中英剧情…</strong><span>首次载入后，本次浏览会直接使用缓存</span></div>}
    {error && <div className="error-toast"><span>{error}</span><button onClick={() => { setError(''); if (page === 'reader' && !chapter) back() }}><X size={16} /></button></div>}
    {settingsOpen && <SettingsSheet value={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} />}
    {changelogOpen && <Changelog onClose={() => setChangelogOpen(false)} />}
    {printState && chapter && <PrintStudio chapter={chapter} quest={printState.quest} scenes={printState.scenes} selected={printState.selection} settings={printSettings} setSettings={setPrintSettings} onClose={() => setPrintState(null)} />}
  </div>
}
