import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Bookmark, BookOpen, Download, Eye, FileText, Share2, X } from 'lucide-react'
import type { ChapterData, DialogueLine, LanguageCode, Quest, Scene, Traveler } from '../types'
import { EMPTY_LIBRARY, LIBRARY_KEY, downloadText, exportDialogue, makeEntry, mergeLibrary, parseLibrary, readingLink, type ReadingEntry, type ReadingLibrary } from '../lib/reading'

const ReadingContext = createContext<{
  library: ReadingLibrary; update: (fn: (value: ReadingLibrary) => ReadingLibrary) => void;
  study: string; setStudy: (language: string) => void;
  edit: (entry: ReadingEntry) => void; report: (message: string) => void; open: () => void;
} | null>(null)
const useReading = () => useContext(ReadingContext)!

function ReadingDialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const previous = document.activeElement as HTMLElement; ref.current?.showModal(); return () => { previous?.focus() } }, [])
  return <dialog ref={ref} className="reading-dialog" aria-label={title} onCancel={event => { event.preventDefault(); close() }} onKeyDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) close() }}>
    <header><h2>{title}</h2><button aria-label="关闭" onClick={close}><X size={20}/></button></header>{children}
  </dialog>
}

export function ReadingProvider({ children }: { children: ReactNode }) {
  const [library, setLibrary] = useState<ReadingLibrary>(() => { try { return parseLibrary(localStorage.getItem(LIBRARY_KEY) || JSON.stringify(EMPTY_LIBRARY)) } catch { return EMPTY_LIBRARY } })
  const [study, setStudy] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ReadingEntry | null>(null)
  const [note, setNote] = useState('')
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [storageError, setStorageError] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => { try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(library)); setStorageError(false) } catch { setStorageError(true) } }, [library])
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === LIBRARY_KEY) { try { setLibrary(event.newValue ? parseLibrary(event.newValue) : EMPTY_LIBRARY) } catch { setMessage('其他标签页的阅读资料无法读取') } } }
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync)
  }, [])
  useEffect(() => { if (!message) return; const timer = window.setTimeout(() => setMessage(''), 5000); return () => clearTimeout(timer) }, [message])
  const value = useMemo(() => ({ library, update: setLibrary, study, setStudy, report: setMessage, open: () => setOpen(true),
    edit: (entry: ReadingEntry) => { const saved = library.entries.find(item => item.id === entry.id); setEditing(saved || entry); setNote(saved?.note || '') } }), [library, study])
  const filtered = library.entries.filter(entry => `${entry.chapterTitle} ${entry.questTitle} ${entry.text} ${entry.note}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  return <ReadingContext.Provider value={value}>
    {children}
    {message && <div className="reading-notice" role="status">{message}</div>}
    {storageError && <div className="reading-storage-warning" role="status">浏览器存储不可用，本次收藏仅保留在当前页面。请到阅读资料导出备份。</div>}
    {editing && <ReadingDialog title="台词笔记" close={() => setEditing(null)}>
      <p>{editing.questTitle}</p><blockquote>{editing.text}</blockquote>
      <label className="note-field">我的笔记<textarea autoFocus maxLength={5000} value={note} onChange={event => setNote(event.target.value)} placeholder="记录词汇、译法或剧情线索…"/></label>
      <div className="reading-dialog-actions"><span>{note.length}/5000</span><button onClick={() => {
        const entry = { ...editing, note, updatedAt: new Date().toISOString() };
        setLibrary(current => ({ ...current, entries: [entry, ...current.entries.filter(item => item.id !== entry.id)] }));
        setEditing(null); setMessage('笔记已保存至阅读资料');
      }}>保存笔记</button></div>
    </ReadingDialog>}
    {open && <ReadingDialog title="阅读资料" close={() => setOpen(false)}>
      <p className="reading-help">收藏和笔记保存在此浏览器，可导出备份后在其他设备导入。</p>
      <div className="reading-dialog-actions">
        <button onClick={() => downloadText(JSON.stringify(library, null, 2), '提瓦特阅读资料.json', 'application/json')}><Download size={16}/>导出备份</button>
        <button onClick={() => fileRef.current?.click()}>导入备份</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async event => {
          const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
          try { if (file.size > 10 * 1024 * 1024) throw new Error('备份不能超过 10 MB'); const incoming = parseLibrary(await file.text()); setLibrary(current => mergeLibrary(current, incoming)); setMessage('备份已合并，已有笔记保留') }
          catch (error) { setMessage(error instanceof Error ? error.message : '导入失败') }
        }}/>
      </div>
      {library.recent.length > 0 && <section className="reading-recent"><h3>继续阅读</h3>{library.recent.slice(0, 5).map(entry => <a key={entry.id} href={readingLink(entry)}>{entry.questTitle}<small>{entry.text.slice(0, 60)}</small></a>)}<button onClick={() => setLibrary(current => ({ ...current, recent: [] }))}>清除阅读记录</button></section>}
      <label className="note-field">查找收藏与笔记<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="任务、台词或笔记"/></label>
      <p>{filtered.length} 条收藏</p>
      <div className="reading-saved-list">{filtered.map(entry => <article key={entry.id}>
        <a href={readingLink(entry)}><strong>{entry.questTitle}</strong><p>{entry.text}</p></a>
        {entry.note && <p className="saved-note">{entry.note}</p>}
        <div className="reading-dialog-actions"><button onClick={() => value.edit(entry)}>编辑笔记</button><button onClick={() => setLibrary(current => ({ ...current, entries: current.entries.filter(item => item.id !== entry.id) }))}>移除收藏与笔记</button></div>
      </article>)}{!filtered.length && <p className="reading-help">{query ? '没有匹配的收藏' : '在台词下方点击收藏或笔记，即可保存到这里。'}</p>}</div>
    </ReadingDialog>}
  </ReadingContext.Provider>
}

export function ReadingShelf() {
  const { library, open } = useReading()
  const recent = library.recent[0]
  return <aside className="reading-shelf"><button onClick={open}><Bookmark size={17}/>阅读资料{library.entries.length ? ` · ${library.entries.length}` : ''}</button>
    {recent && <a href={readingLink(recent)}><BookOpen size={17}/><span>继续阅读 · {recent.questTitle}</span></a>}
  </aside>
}

export function ReaderTools({ data, quest, scenes, selected, languages, traveler }: {
  data: ChapterData; quest: Quest; scenes: Scene[]; selected: Set<string>; languages: LanguageCode[]; traveler: Traveler;
}) {
  const { library, update, study, setStudy, open, report } = useReading()
  const [share, setShare] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [scope, setScope] = useState<'visible' | 'selected'>('visible')
  const visibleCount = scenes.reduce((n, scene) => n + scene.lines.length, 0)
  const selectedCount = quest.scenes.reduce((n, scene) => n + scene.lines.filter(line => selected.has(line.key)).length, 0)
  const latest = useRef({ data, quest, scenes, update }); latest.current = { data, quest, scenes, update }
  useEffect(() => {
    if (study && !languages.includes(study as LanguageCode)) setStudy('')
  }, [languages.join(','), study, setStudy])
  useEffect(() => {
    let timer = 0
    let lastKey = ''
    const save = () => {
      const rows = [...document.querySelectorAll<HTMLElement>('.script [data-line-key]')];
      const row = rows.find(element => { const box = element.getBoundingClientRect(); return box.bottom > 210 && box.top < innerHeight - 100 });
      if (!row || row.dataset.lineKey === lastKey) return;
      const { data: currentData, quest: currentQuest, update: write } = latest.current;
      const line = currentQuest.scenes.flatMap(scene => scene.lines).find(item => item.key === row.dataset.lineKey);
      if (!line) return; lastKey = line.key;
      const entry = makeEntry(currentData, currentQuest.id, line);
      write(current => ({ ...current, recent: [entry, ...current.recent.filter(item => item.chapterId !== entry.chapterId)].slice(0, 30) }));
    }
    const schedule = () => { clearTimeout(timer); timer = window.setTimeout(save, 350) }
    window.addEventListener('scroll', schedule, { passive: true }); schedule();
    const onHide = () => { if (document.visibilityState === 'hidden') save() }; document.addEventListener('visibilitychange', onHide);
    return () => { clearTimeout(timer); window.removeEventListener('scroll', schedule); document.removeEventListener('visibilitychange', onHide) }
  }, [data.chapter.id, quest.id])
  useEffect(() => {
    const params = new URLSearchParams(location.search); const key = params.get('line');
    if (!key || Number(params.get('quest')) !== quest.id) return;
    let cancelled = false;
    void document.fonts.ready.then(() => { if (cancelled) return; requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`[data-line-key="${CSS.escape(key)}"]`);
      if (row) { row.scrollIntoView({ block: 'center', behavior: 'instant' }); row.classList.add('shared-line'); }
      else report('这条台词在当前数据源或筛选下不可见，可切换来源或取消筛选后重试');
    }) });
    return () => { cancelled = true }
  }, [data.chapter.id, quest.id, scenes.length])
  return <>
    <div className="reader-study-tools">
      <button onClick={open}><Bookmark size={16}/>阅读资料{library.entries.length ? ` · ${library.entries.length}` : ''}</button>
      <label><Eye size={16}/><span>遮译自测</span><select aria-label="遮译语言" value={study} onChange={event => setStudy(event.target.value)}><option value="">关闭</option>{languages.map(lang => <option key={lang} value={lang}>遮住 {lang}</option>)}</select></label>
      <button onClick={() => { setShare(''); setScope(selectedCount ? 'selected' : 'visible'); setExportOpen(true) }}><Download size={16}/>导出台词</button>
    </div>
    {exportOpen && <ReadingDialog title="导出台词" close={() => setExportOpen(false)}>
      <p>保留当前语言与旅行者称谓，可用于笔记或导入表格。</p>
      <label className="note-field">导出范围<select aria-label="导出范围" value={scope} onChange={event => setScope(event.target.value as 'visible' | 'selected')}><option value="visible">当前筛选结果 · {visibleCount} 句</option><option value="selected" disabled={!selectedCount}>当前任务已选台词 · {selectedCount} 句</option></select></label>
      <div className="reading-dialog-actions">{(['md', 'tsv'] as const).map(format => <button key={format} disabled={scope === 'selected' ? !selectedCount : !visibleCount} onClick={() => {
        const output = scope === 'selected' ? quest.scenes.map(scene => ({ ...scene, lines: scene.lines.filter(line => selected.has(line.key)) })).filter(scene => scene.lines.length) : scenes;
        downloadText(exportDialogue(output, languages, traveler, format, quest.title.zh), `提瓦特-${data.chapter.id}-${quest.id}.${format}`); report('台词文件已导出');
      }}>{format === 'md' ? 'Markdown 文稿' : 'TSV 表格'}</button>)}</div>
      <label className="note-field">当前任务链接<input readOnly value={share || new URL(`?chapter=${data.chapter.id}&quest=${quest.id}`, location.href).href} onFocus={event => event.target.select()}/></label>
    </ReadingDialog>}
  </>
}

export function LineTools({ data, questId, line }: { data: ChapterData; questId: number; line: DialogueLine }) {
  const { library, update, edit, report, study } = useReading()
  const [revealed, setRevealed] = useState(false)
  const [share, setShare] = useState('')
  const actionsRef = useRef<HTMLDivElement>(null)
  const entry = makeEntry(data, questId, line)
  const saved = library.entries.find(item => item.id === entry.id)
  useEffect(() => { setRevealed(false); actionsRef.current?.closest('[data-line-key]')?.classList.remove('study-revealed') }, [study, line.key])
  return <>
    <div ref={actionsRef} className="line-reading-actions">
      <button aria-label={saved ? '取消收藏台词' : '收藏台词'} aria-pressed={Boolean(saved)} onClick={() => {
        if (saved?.note) { report('这条收藏含有笔记，请在阅读资料中编辑或移除'); return }
        update(current => ({ ...current, entries: saved ? current.entries.filter(item => item.id !== entry.id) : [entry, ...current.entries] }));
      }}><Bookmark size={14} fill={saved ? 'currentColor' : 'none'}/><span>{saved ? '已收藏' : '收藏'}</span></button>
      <button aria-label="编辑台词笔记" onClick={() => edit(entry)}><FileText size={14}/><span>{saved?.note ? '有笔记' : '笔记'}</span></button>
      <button aria-label="分享这句台词" onClick={async () => {
        const url = new URL(readingLink(entry), location.href).href;
        try { await navigator.clipboard.writeText(url); report('台词链接已复制') } catch { setShare(url) }
      }}><Share2 size={14}/><span>分享</span></button>
      {study && <button aria-label={revealed ? '重新遮住译文' : '揭晓译文'} aria-pressed={revealed} onClick={event => {
        const row = event.currentTarget.closest('[data-line-key]'); row?.classList.toggle('study-revealed', !revealed); setRevealed(!revealed);
      }}><Eye size={14}/><span>{revealed ? '重新遮住' : '揭晓译文'}</span></button>}
    </div>
    {share && <ReadingDialog title="分享台词" close={() => setShare('')}><p>复制下面的链接，对方可直接定位到这句台词。</p><input aria-label="台词分享链接" autoFocus readOnly value={share} onFocus={event => event.target.select()}/></ReadingDialog>}
  </>
}

export function useStudyLanguage() { return useReading().study }
