import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Copy, X } from 'lucide-react'
import type { LanguageCode, Traveler } from '../types'
import { COPY_KEY, COPY_NAMES, DEFAULT_COPY, LANGUAGE_SPEAKER_SEPARATORS, formatCopy, normalizeCopy, type CopyBlock, type CopyPreferences, type LanguageCopyStyle } from '../lib/copy'

const CopyContext = createContext<{ prefs: CopyPreferences; setPrefs: (prefs: CopyPreferences) => void; copy: (text: string) => void; message: string } | null>(null)
export function CopyProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState(() => { try { return normalizeCopy(JSON.parse(localStorage.getItem(COPY_KEY) || 'null')) } catch { return normalizeCopy(null) } })
  const [message, setMessage] = useState('')
  const [manual, setManual] = useState<string | null>(null)
  useEffect(() => { try { localStorage.setItem(COPY_KEY, JSON.stringify(prefs)) } catch { /* Copy stays usable without storage. */ } }, [prefs])
  useEffect(() => { if (!message) return; const timer = window.setTimeout(() => setMessage(''), 3000); return () => clearTimeout(timer) }, [message])
  const copy = (text: string) => {
    if (!text) { setMessage('所选语言无文本，请调整语言'); return }
    if (!navigator.clipboard?.writeText) { setManual(text); return }
    void navigator.clipboard.writeText(text).then(() => { setMessage('已复制'); setManual(null) }, () => setManual(text));
  }
  return <CopyContext.Provider value={{ prefs, setPrefs, copy, message }}>{children}
    {message && <div className="copy-notice" role="status">{message}</div>}
    {manual !== null && <CopyDialog title="手动复制" close={() => setManual(null)}><p>文本已选中，按 Ctrl/Cmd+C 或长按复制。</p><textarea data-auto-select aria-label="待复制文本" readOnly autoFocus value={manual} onFocus={event => event.target.select()}/></CopyDialog>}
  </CopyContext.Provider>
}
function CopyDialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const previous = document.activeElement as HTMLElement; ref.current?.showModal(); const field = ref.current?.querySelector<HTMLTextAreaElement>('textarea[data-auto-select]'); field?.focus(); field?.select(); return () => previous?.focus() }, [])
  return <dialog ref={ref} className="copy-dialog" aria-label={title} onCancel={event => { event.preventDefault(); close() }} onKeyDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) close() }}>
    <header><h2>{title}</h2><button aria-label="关闭复制面板" onClick={close}><X size={20}/></button></header>{children}
  </dialog>
}
const displaySeparator = (value: string) => value.replace(/\n/g, '\\n').replace(/\t/g, '\\t')
const decodeSeparator = (value: string) => value.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
function Separator({ label, value, change, speaker = false, inherit }: { label: string; value: string; change: (value: string) => void; speaker?: boolean; inherit?: string }) {
  const presets = speaker ? [['：','全角冒号（：）'],[': ', '半角冒号＋空格（: ）'],['\u00a0: ', '法文冒号（空格 : 空格）'],[' ', '空格'],['\n','换行'],['\n\n','空一行'],['','无分隔']] : [['\n','换行'],['\n\n','空一行'],[' ', '空格'],['\t','制表符'],['','无分隔']]
  const options = inherit ? [['__inherit', inherit], ...presets] : presets
  const [custom, setCustom] = useState(!options.some(([id]) => id === value))
  return <label className="copy-field">{label}<select aria-label={label} value={custom ? '__custom' : value} onChange={event => { const next = event.target.value; setCustom(next === '__custom'); if (next !== '__custom') change(next) }}>
    {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}<option value="__custom">自定义…</option></select>
    {custom && <input aria-label={`自定义${label}`} maxLength={80} placeholder="例如 ｜ 或 \n" value={displaySeparator(value)} onChange={event => change(decodeSeparator(event.target.value))}/>}
  </label>
}
export function CopySettings({ languages, blocks, traveler = 'aether' }: { languages: LanguageCode[]; blocks?: CopyBlock[]; traveler?: Traveler }) {
  const { prefs, setPrefs } = useContext(CopyContext)!
  const [resetVersion, setResetVersion] = useState(0)
  const change = (next: Partial<CopyPreferences>) => setPrefs({ ...prefs, ...next })
  const changeLanguage = (language: LanguageCode, next: Partial<LanguageCopyStyle>) => {
    const style = { ...prefs.languageStyles[language], ...next };
    const styles = { ...prefs.languageStyles };
    if (style.includeSpeaker === undefined) delete style.includeSpeaker;
    if (style.separator === undefined) delete style.separator;
    if (Object.keys(style).length) styles[language] = style; else delete styles[language];
    change({ languageStyles: styles });
  }
  const visibleOrder = prefs.languages.filter(lang => languages.includes(lang))
  const currentOrder = prefs.followReader ? languages : visibleOrder
  const isChinese = (lang: LanguageCode) => lang === 'CHS' || lang === 'CHT'
  const shift = (language: LanguageCode, offset: number) => {
    const next = [...visibleOrder]; const index = next.indexOf(language); [next[index], next[index + offset]] = [next[index + offset], next[index]];
    change({ languages: [...next, ...prefs.languages.filter(lang => !languages.includes(lang))] })
  }
  const example: CopyBlock[] = blocks || [{ speaker: { zh: '派蒙', en: 'Paimon', translations: { JP: 'パイモン' } }, text: { zh: '你好，旅行者。', en: 'Hello, Traveler.', translations: { JP: 'こんにちは、旅人。' } } }]
  return <section className="copy-settings" aria-label="复制格式设置">
    <label className="copy-check"><input type="checkbox" checked={prefs.followReader} onChange={event => change({ followReader: event.target.checked })}/>语言和顺序跟随阅读</label>
    {currentOrder.length > 1 && currentOrder.some(isChinese) && <div className="copy-order-shortcuts"><span>复制顺序</span><button onClick={() => change({ followReader: false, languages: [...currentOrder.filter(isChinese), ...currentOrder.filter(lang => !isChinese(lang))] })}>中文在前</button><button onClick={() => change({ followReader: false, languages: [...currentOrder.filter(lang => !isChinese(lang)), ...currentOrder.filter(isChinese)] })}>中文在后</button></div>}
    {!prefs.followReader && <div className="copy-language-options"><p>勾选语言，箭头排序。</p>
      {languages.map(lang => <label key={lang}><input type="checkbox" checked={prefs.languages.includes(lang)} disabled={visibleOrder.length === 1 && visibleOrder.includes(lang)} onChange={event => change({ languages: event.target.checked ? [...prefs.languages, lang] : prefs.languages.filter(item => item !== lang) })}/>{COPY_NAMES[lang]}</label>)}
      <ol>{visibleOrder.map((lang, index) => <li key={lang}><span>{COPY_NAMES[lang]}</span><button aria-label={`复制顺序上移${lang}`} disabled={!index} onClick={() => shift(lang, -1)}><ArrowUp size={14}/></button><button aria-label={`复制顺序下移${lang}`} disabled={index === visibleOrder.length - 1} onClick={() => shift(lang, 1)}><ArrowDown size={14}/></button></li>)}</ol>
      {!visibleOrder.length && <p role="status">请选择一种已载入的语言。</p>}
    </div>}
    <div className="copy-settings-grid">
      <label className="copy-check"><input type="checkbox" checked={prefs.includeSpeaker} onChange={event => change({ includeSpeaker: event.target.checked })}/>包含角色名字</label>
      <label className="copy-field">名字格式<select aria-label="名字格式" value={prefs.speakerMode} onChange={event => change({ speakerMode: event.target.value as CopyPreferences['speakerMode'] })}><option value="auto">按语言适配</option><option value="uniform">统一格式</option></select></label>
      {prefs.speakerMode === 'uniform' && <Separator key={`speaker-${resetVersion}`} label="名字分隔" speaker value={prefs.speakerSeparator} change={speakerSeparator => change({ speakerSeparator })}/>}
      <Separator key={`language-${resetVersion}`} label="语言分隔" value={prefs.languageSeparator} change={languageSeparator => change({ languageSeparator })}/>
    </div>
    <details className="copy-more copy-language-styles"><summary>按语言单独设置</summary>
      <p className="copy-help">单独设置优先；未设置时沿用上方选项。</p>
      {languages.map(language => { const style = prefs.languageStyles[language]; const separator = prefs.speakerMode === 'auto' ? LANGUAGE_SPEAKER_SEPARATORS[language] : prefs.speakerSeparator; return <fieldset key={language}>
        <legend>{COPY_NAMES[language]} · {language}</legend><div className="copy-settings-grid">
          <label className="copy-field">角色名字<select aria-label={`${language}角色名字`} value={style?.includeSpeaker === undefined ? 'inherit' : style.includeSpeaker ? 'show' : 'hide'} onChange={event => changeLanguage(language, { includeSpeaker: event.target.value === 'inherit' ? undefined : event.target.value === 'show' })}><option value="inherit">沿用总体设置</option><option value="show">保留名字</option><option value="hide">仅正文</option></select></label>
          <Separator key={`${language}-${resetVersion}-${prefs.speakerMode}`} label={`${language}名字分隔`} speaker inherit={`沿用（名字${displaySeparator(separator)}正文）`} value={style?.separator ?? '__inherit'} change={value => changeLanguage(language, { separator: value === '__inherit' ? undefined : value })}/>
        </div>
      </fieldset> })}
      {languages.some(language => prefs.languageStyles[language]) && <button onClick={() => { const styles = { ...prefs.languageStyles }; languages.forEach(language => delete styles[language]); change({ languageStyles: styles }); setResetVersion(value => value + 1) }}>清除这些语言的单独设置</button>}
    </details>
    <details className="copy-more"><summary>更多排版选项</summary><div className="copy-settings-grid">
      <label className="copy-check"><input type="checkbox" checked={prefs.languageLabels} onChange={event => change({ languageLabels: event.target.checked })}/>标注语言代码</label>
      <label className="copy-check"><input type="checkbox" checked={prefs.preserveBreaks} onChange={event => change({ preserveBreaks: event.target.checked })}/>保留正文内换行</label>
      <label className="copy-field">多句排列<select aria-label="多句排列" value={prefs.grouping} onChange={event => change({ grouping: event.target.value as CopyPreferences['grouping'] })}><option value="sentence">逐句对照</option><option value="language">按语言分组</option></select></label>
      <Separator key={`sentence-${resetVersion}`} label="句子分隔" value={prefs.sentenceSeparator} change={sentenceSeparator => change({ sentenceSeparator })}/>
    </div></details>
    <label className="copy-field">复制预览<textarea aria-label="复制预览" readOnly value={formatCopy(example, languages, prefs, traveler)} onFocus={event => event.target.select()}/></label>
    <div className="copy-settings-footer"><small>自动保存 · 仅复制已载入语言</small><button onClick={() => { setPrefs(normalizeCopy(DEFAULT_COPY)); setResetVersion(value => value + 1) }}>恢复默认格式</button></div>
  </section>
}
export function CopyButton({ blocks, languages, traveler = 'aether', label = '复制', only, compact = false, options = true }: {
  blocks: CopyBlock[]; languages: LanguageCode[]; traveler?: Traveler; label?: string; only?: LanguageCode; compact?: boolean; options?: boolean;
}) {
  const { prefs, copy, message } = useContext(CopyContext)!
  const [open, setOpen] = useState(false)
  return <span className={`copy-control ${compact ? 'copy-compact' : ''}`}>
    <button type="button" aria-label={label} title={label} onClick={() => copy(formatCopy(blocks, languages, prefs, traveler, only))}><Copy size={14}/>{!compact && <span>{label}</span>}</button>
    {options && !only && <button type="button" className="copy-options-button" aria-label={`${label}的格式选项`} title="复制格式选项" onClick={() => setOpen(true)}><ChevronDown size={13}/></button>}
    {open && <CopyDialog title="复制选项" close={() => setOpen(false)}>
      <CopySettings languages={languages} blocks={blocks} traveler={traveler}/>
      <div className="copy-dialog-footer"><button className="copy-confirm" onClick={() => copy(formatCopy(blocks, languages, prefs, traveler))}><Copy size={16}/>复制预览内容</button>
      {message && <p role="status">{message}</p>}</div>
    </CopyDialog>}
  </span>
}
