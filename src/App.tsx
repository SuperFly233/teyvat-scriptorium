import { useEffect, useMemo, useState } from 'react'
import {
  BookOpenText,
  Check,
  ChevronDown,
  FileText,
  Languages,
  Menu,
  Moon,
  PanelLeftClose,
  Printer,
  Search,
  SlidersHorizontal,
  Snowflake,
  Sun,
  X,
} from 'lucide-react'
import { filterScenes } from './lib/filter'
import { formatGameText } from './lib/text'
import type { ChapterData, DialogueLine, PrintPreset, Quest, Scene, Traveler, ViewMode } from './types'

const viewOptions: { id: ViewMode; zh: string; en: string }[] = [
  { id: 'parallel', zh: '双栏', en: 'Parallel' },
  { id: 'stacked', zh: '上下', en: 'Stacked' },
  { id: 'compact', zh: '台词表', en: 'Script' },
  { id: 'zh', zh: '中文', en: 'Chinese' },
  { id: 'en', zh: '英文', en: 'English' },
]

const printOptions: { id: PrintPreset; title: string; detail: string }[] = [
  { id: 'parallel', title: 'A4 双栏对照', detail: '中文在左，英文在右；适合完整保存' },
  { id: 'study', title: '对照学习讲义', detail: '一句中文接一句英文；留有批注空间' },
  { id: 'zh', title: '中文剧本', detail: '仅保留中文台词，紧凑省纸' },
  { id: 'en', title: 'English Script', detail: 'English-only reading copy' },
]

function useChapter() {
  const [data, setData] = useState<ChapterData | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetch('/data/quest-1700.json')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [])
  return { data, error }
}

function Line({ line, mode, traveler, number }: { line: DialogueLine; mode: ViewMode; traveler: Traveler; number: number }) {
  const zh = formatGameText(line.text.zh, traveler)
  const en = formatGameText(line.text.en, traveler)
  const choice = line.kind === 'choice'
  return (
    <article className={`dialogue-line dialogue-line--${line.kind} view-${mode}`}>
      <div className="line-index" aria-hidden="true">{String(number).padStart(3, '0')}</div>
      <div className="line-body">
        <div className="speaker-row">
          <span className="speaker speaker-zh">{choice && '◇ '}{line.speaker.zh}</span>
          <span className="speaker speaker-en">{choice && '◇ '}{line.speaker.en}</span>
          {choice && <span className="choice-tag">选择 · CHOICE</span>}
        </div>
        <div className="text-pair">
          <p className="text-zh" lang="zh-CN">{zh || <span className="missing">—</span>}</p>
          <p className="text-en" lang="en">{en || <span className="missing">—</span>}</p>
        </div>
      </div>
    </article>
  )
}

function SceneSection({ scene, mode, traveler, startNumber }: { scene: Scene; mode: ViewMode; traveler: Traveler; startNumber: number }) {
  return (
    <section className="scene" id={`scene-${scene.key}`}>
      <header className="scene-heading">
        <span className="scene-marker">SCENE {String(scene.id).slice(-3)}</span>
        <div>
          <h2>{scene.title.zh}</h2>
          <p>{scene.title.en}</p>
        </div>
        <span className="scene-count">{scene.lines.length} 条</span>
      </header>
      <div className="scene-lines">
        {scene.lines.map((line, index) => (
          <Line key={line.key} line={line} mode={mode} traveler={traveler} number={startNumber + index} />
        ))}
      </div>
    </section>
  )
}

function SceneSelector({
  quest,
  selected,
  onToggle,
  onAll,
}: {
  quest: Quest
  selected: Set<string>
  onToggle: (key: string) => void
  onAll: (enabled: boolean) => void
}) {
  const selectedCount = quest.scenes.filter((scene) => selected.has(scene.key)).length
  const allSelected = selectedCount === quest.scenes.length
  return (
    <div className="scene-selector">
      <div className="selector-title">
        <span>场景选取</span>
        <button type="button" onClick={() => onAll(!allSelected)}>{allSelected ? '清空' : '全选'}</button>
      </div>
      <p className="selector-meta">已选 {selectedCount} / {quest.scenes.length} 个含对话场景</p>
      <div className="scene-checklist">
        {quest.scenes.map((scene, index) => {
          const checked = selected.has(scene.key)
          return (
            <label className={checked ? 'scene-check checked' : 'scene-check'} key={scene.key}>
              <input type="checkbox" checked={checked} onChange={() => onToggle(scene.key)} />
              <span className="custom-check">{checked && <Check size={12} strokeWidth={3} />}</span>
              <span className="scene-check-number">{String(index + 1).padStart(2, '0')}</span>
              <span className="scene-check-copy">
                <strong>{scene.title.zh}</strong>
                <small>{scene.title.en}</small>
              </span>
              <span className="scene-check-lines">{scene.lines.length}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

function PrintDialog({ preset, onPreset, onClose, onPrint, selectedScenes, lines }: {
  preset: PrintPreset
  onPreset: (value: PrintPreset) => void
  onClose: () => void
  onPrint: () => void
  selectedScenes: number
  lines: number
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="print-dialog" role="dialog" aria-modal="true" aria-labelledby="print-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="关闭打印设置"><X size={20} /></button>
        <span className="eyebrow">PRINT EDITION</span>
        <h2 id="print-title">选择打印版式</h2>
        <p className="print-summary">将打印当前筛选结果：{selectedScenes} 个场景，{lines} 条双语台词。</p>
        <div className="print-options">
          {printOptions.map((option) => (
            <label key={option.id} className={preset === option.id ? 'print-option selected' : 'print-option'}>
              <input type="radio" name="print-preset" checked={preset === option.id} onChange={() => onPreset(option.id)} />
              <span className={`paper-preview paper-preview--${option.id}`}><i /><i /><i /></span>
              <span><strong>{option.title}</strong><small>{option.detail}</small></span>
              <span className="radio-dot" />
            </label>
          ))}
        </div>
        <div className="print-notes">
          <FileText size={17} />
          <span>A4 纵向 · 自动分页 · 保持单条台词完整 · 打印时隐藏所有操作控件</span>
        </div>
        <button className="print-primary" type="button" onClick={onPrint}><Printer size={18} /> 打开系统打印窗口</button>
      </section>
    </div>
  )
}

export default function App() {
  const { data, error } = useChapter()
  const [activeQuestId, setActiveQuestId] = useState<number | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<ViewMode>('parallel')
  const [traveler, setTraveler] = useState<Traveler>('aether')
  const [query, setQuery] = useState('')
  const [dark, setDark] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [printPreset, setPrintPreset] = useState<PrintPreset>('parallel')

  useEffect(() => {
    if (!data) return
    setActiveQuestId((current) => current ?? data.quests[0].id)
    setSelected(new Set(data.quests.flatMap((quest) => quest.scenes.map((scene) => scene.key))))
  }, [data])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  const activeQuest = data?.quests.find((quest) => quest.id === activeQuestId) ?? data?.quests[0]
  const visibleScenes = useMemo(
    () => activeQuest ? filterScenes(activeQuest.scenes, selected, query, traveler) : [],
    [activeQuest, selected, query, traveler],
  )
  const visibleLines = visibleScenes.reduce((sum, scene) => sum + scene.lines.length, 0)

  const toggleScene = (key: string) => setSelected((current) => {
    const next = new Set(current)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  const toggleAll = (enabled: boolean) => {
    if (!activeQuest) return
    setSelected((current) => {
      const next = new Set(current)
      activeQuest.scenes.forEach((scene) => enabled ? next.add(scene.key) : next.delete(scene.key))
      return next
    })
  }

  const print = () => {
    document.documentElement.dataset.print = printPreset
    setPrintOpen(false)
    window.setTimeout(() => window.print(), 80)
  }

  if (error) return (
    <main className="status-page">
      <Snowflake size={36} />
      <h1>剧情档案未能载入</h1>
      <p>{error}</p>
      <button type="button" onClick={() => window.location.reload()}>重新载入</button>
    </main>
  )

  if (!data || !activeQuest) return (
    <main className="status-page loading">
      <Snowflake size={36} />
      <p>正在展开北国档案…</p>
    </main>
  )

  let runningLine = 1
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="返回顶部">
          <span className="brand-seal"><Snowflake size={18} /></span>
          <span><strong>提瓦特剧本室</strong><small>TEYVAT SCRIPTORIUM</small></span>
        </a>
        <div className="header-actions">
          <span className="edition">第 1700 号档案 · 双语版</span>
          <button type="button" className="icon-button" onClick={() => setDark((value) => !value)} aria-label={dark ? '切换浅色' : '切换深色'}>
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button type="button" className="header-print" onClick={() => setPrintOpen(true)}><Printer size={17} /> 打印 / PDF</button>
        </div>
      </header>

      <div className="layout" id="top">
        <aside className={sidebarOpen ? 'sidebar sidebar-open' : 'sidebar'}>
          <div className="mobile-sidebar-head">
            <strong>内容与场景</strong>
            <button type="button" onClick={() => setSidebarOpen(false)} aria-label="关闭侧栏"><X size={20} /></button>
          </div>
          <div className="archive-label"><span>ARCHIVE</span><strong>VII · I</strong></div>
          <nav className="quest-nav" aria-label="任务目录">
            <span className="nav-kicker">本幕任务 · QUESTS</span>
            {data.quests.map((quest) => (
              <button
                type="button"
                key={quest.id}
                className={quest.id === activeQuest.id ? 'quest-link active' : 'quest-link'}
                onClick={() => { setActiveQuestId(quest.id); setSidebarOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
              >
                <span>{String(quest.order).padStart(2, '0')}</span>
                <span><strong>{quest.title.zh}</strong><small>{quest.title.en}</small></span>
              </button>
            ))}
          </nav>
          <SceneSelector quest={activeQuest} selected={selected} onToggle={toggleScene} onAll={toggleAll} />
          <div className="source-note">
            <span>DATA SNAPSHOT</span>
            <p>{new Date(data.generatedAt).toLocaleDateString('zh-CN')} · {data.stats.lines.toLocaleString()} 条中英对齐文本</p>
            <a href={data.source.url} target="_blank" rel="noreferrer">来源：Project Amber ↗</a>
          </div>
        </aside>
        {sidebarOpen && <button className="sidebar-scrim" type="button" aria-label="关闭侧栏" onClick={() => setSidebarOpen(false)} />}

        <main className="reader">
          <section className="chapter-masthead">
            <div className="masthead-copy">
              <div className="chapter-overline"><span>{data.chapter.region.zh}</span><i /><span>{data.chapter.region.en}</span></div>
              <h1>{data.chapter.title.zh}</h1>
              <p className="english-title">{data.chapter.title.en}</p>
              <div className="chapter-number"><span>{data.chapter.number.zh}</span><span>{data.chapter.number.en}</span></div>
            </div>
            <div className="masthead-emblem" aria-hidden="true"><Snowflake /><span>1700</span></div>
          </section>

          <section className="quest-intro">
            <span className="quest-index">任务 {String(activeQuest.order).padStart(2, '0')} / {String(data.quests.length).padStart(2, '0')}</span>
            <h2>{activeQuest.title.zh}</h2>
            <h3>{activeQuest.title.en}</h3>
            <div className="descriptions">
              <p>{activeQuest.description.zh}</p>
              <p>{activeQuest.description.en}</p>
            </div>
          </section>

          <div className="reader-toolbar">
            <button className="mobile-menu" type="button" onClick={() => setSidebarOpen(true)}><Menu size={18} /> 场景</button>
            <div className="view-switch" role="group" aria-label="阅读版式">
              {viewOptions.map((option) => (
                <button key={option.id} type="button" className={mode === option.id ? 'active' : ''} onClick={() => setMode(option.id)}>
                  <span>{option.zh}</span><small>{option.en}</small>
                </button>
              ))}
            </div>
            <label className="search-box">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索角色或台词…" aria-label="搜索角色或台词" />
              {query && <button type="button" onClick={() => setQuery('')} aria-label="清空搜索"><X size={14} /></button>}
            </label>
            <label className="traveler-select">
              <Languages size={15} />
              <select value={traveler} onChange={(event) => setTraveler(event.target.value as Traveler)} aria-label="旅行者性别">
                <option value="aether">空 · Aether</option>
                <option value="lumine">荧 · Lumine</option>
              </select>
              <ChevronDown size={14} />
            </label>
            <button className="toolbar-print" type="button" onClick={() => setPrintOpen(true)} aria-label="打印设置"><Printer size={17} /></button>
          </div>

          <div className="print-cover">
            <span>TEYVAT SCRIPTORIUM · BILINGUAL EDITION</span>
            <h1>{data.chapter.title.zh}</h1>
            <p>{data.chapter.title.en}</p>
            <div>{activeQuest.title.zh} · {activeQuest.title.en}</div>
          </div>

          <div className={`story-content story-content--${mode}`}>
            <div className="result-meta">
              <span><BookOpenText size={15} /> {visibleScenes.length} 个场景 · {visibleLines} 条台词</span>
              <span>中文 · SIMPLIFIED CHINESE</span>
              <span>ENGLISH · LOCALIZATION</span>
            </div>
            {visibleScenes.length ? visibleScenes.map((scene) => {
              const start = runningLine
              runningLine += scene.lines.length
              return <SceneSection key={scene.key} scene={scene} mode={mode} traveler={traveler} startNumber={start} />
            }) : (
              <div className="empty-state">
                <SlidersHorizontal size={28} />
                <h2>当前筛选下没有台词</h2>
                <p>请在左侧重新勾选场景，或清空搜索内容。</p>
                <button type="button" onClick={() => { toggleAll(true); setQuery('') }}>恢复全部场景</button>
              </div>
            )}
          </div>

          <footer className="reader-footer">
            <div><span className="brand-seal"><Snowflake size={15} /></span><strong>提瓦特剧本室</strong></div>
            <p>非官方、非商业的语言学习与剧情查阅工具。剧情文本及《原神》相关权利归其权利人所有。</p>
            <a href={data.source.verification} target="_blank" rel="noreferrer">Honey Hunter 核验页 ↗</a>
          </footer>
        </main>
      </div>

      {printOpen && (
        <PrintDialog preset={printPreset} onPreset={setPrintPreset} onClose={() => setPrintOpen(false)} onPrint={print} selectedScenes={visibleScenes.length} lines={visibleLines} />
      )}
    </div>
  )
}
