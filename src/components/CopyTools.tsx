import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Copy, X } from 'lucide-react'
import { dottedCopyDate, formatCopySource, localCopyDate, type CopySource } from '../lib/copySource'
import type { LanguageCode, Traveler } from '../types'
import { COPY_KEY, COPY_NAMES, DEFAULT_COPY, LANGUAGE_SPEAKER_SEPARATORS, formatCopyPayload, normalizeCopy, wordCopyPreset, type CopyBlock, type CopyPayload, type CopyPreferences, type LanguageCopyStyle } from '../lib/copy'

const CopyContext = createContext<{ prefs: CopyPreferences; setPrefs: (prefs: CopyPreferences) => void; copy: (payload: CopyPayload) => void; message: string; copying: boolean; source?: CopySource; setSource: (source?: CopySource) => void } | null>(null)
export function CopyProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState(() => { try { return normalizeCopy(JSON.parse(localStorage.getItem(COPY_KEY) || 'null')) } catch { return normalizeCopy(null) } })
  const [source, setSource] = useState<CopySource>()
  const [message, setMessage] = useState('')
  const [copying, setCopying] = useState(false)
  const [manual, setManual] = useState<string | null>(null)
  useEffect(() => { try { localStorage.setItem(COPY_KEY, JSON.stringify(prefs)) } catch { /* Copy stays usable without storage. */ } }, [prefs])
  useEffect(() => { if (!message) return; const timer = window.setTimeout(() => setMessage(''), 3000); return () => clearTimeout(timer) }, [message])
  const copy = ({text,html}: CopyPayload) => {
    if (!text) { setMessage('所选语言无文本，请调整语言'); return }
    setCopying(true);
    const plain = (fallback = false) => {
      if (!navigator.clipboard?.writeText) { setManual(text); setCopying(false); return }
      void navigator.clipboard.writeText(text).then(() => { setMessage(fallback ? '已复制纯文本，当前浏览器未保留样式' : '已复制'); setManual(null) }, () => setManual(text)).finally(()=>setCopying(false));
    };
    if (prefs.copyFormat === 'plain') { plain(); return }
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') { plain(true); return }
    try {
      void navigator.clipboard.write([new ClipboardItem({ 'text/plain':new Blob([text],{type:'text/plain'}), 'text/html':new Blob([html],{type:'text/html'}) })])
        .then(() => { setMessage('已复制（含格式）'); setManual(null); setCopying(false) }, () => plain(true));
    } catch { plain(true) }
  }
  return <CopyContext.Provider value={{ prefs, setPrefs, copy, message, copying, source, setSource }}>{children}
    {message && <div className="copy-notice" role="status">{message}</div>}
    {manual !== null && <CopyDialog title="手动复制" close={() => setManual(null)}><p>文本已选中，按 Ctrl/Cmd+C 或长按复制。</p><textarea data-auto-select aria-label="待复制文本" readOnly autoFocus value={manual} onFocus={event => event.target.select()}/></CopyDialog>}
  </CopyContext.Provider>
}
export function useCopySource(source: CopySource) {
  const {setSource} = useContext(CopyContext)!
  useEffect(() => { setSource(source); return () => setSource(undefined) }, [source,setSource])
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
  const presets = speaker ? [['：','全角冒号（：）'],[': ', '半角冒号＋空格（: ）'],['\u00a0: ', '法文冒号（空格 : 空格）'],[' ', '空格'],['\n','换行'],['\n\n','空一行'],['','无分隔']] : [['\n','换行'],['\n\n','空一行'],['\n\n\n','空两行'],['\n——\n','分隔线（——）'],['\n---\n','分隔线（---）'],[' ', '空格'],['\t','制表符'],['','无分隔']]
  const options = inherit ? [['__inherit', inherit], ...presets] : presets
  const [custom, setCustom] = useState(!options.some(([id]) => id === value))
  return <label className="copy-field">{label}<select aria-label={label} value={custom ? '__custom' : value} onChange={event => { const next = event.target.value; setCustom(next === '__custom'); if (next !== '__custom') change(next) }}>
    {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}<option value="__custom">自定义…</option></select>
    {custom && <input aria-label={`自定义${label}`} maxLength={80} placeholder="例如 ｜ 或 \n" value={displaySeparator(value)} onChange={event => change(decodeSeparator(event.target.value))}/>}
  </label>
}
export function CopySettings({ languages, blocks, traveler = 'aether', withHeader = true }: { languages: LanguageCode[]; blocks?: CopyBlock[]; traveler?: Traveler; withHeader?: boolean }) {
  const { prefs, setPrefs, source } = useContext(CopyContext)!
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
  const example: CopyBlock[] = blocks || [{ speaker: { zh: '派蒙', en: 'Paimon', translations: { JP: 'パイモン' } }, text: { zh: '你好，旅行者。', en: 'Hello, Traveler.', translations: { JP: 'こんにちは、旅人。' } } }, {speaker:{zh:'旅行者',en:'Traveler',translations:{JP:'旅人'}},text:{zh:'我们出发吧。',en:"Let's go.",translations:{JP:'出発しよう。'}}}]
  const preview = formatCopyPayload(example,languages,prefs,traveler,undefined,{source,allowHeader:withHeader});
  return <section className="copy-settings" aria-label="复制格式设置">
    <div className="copy-order-shortcuts"><span>预设</span><button onClick={() => { setPrefs(wordCopyPreset(prefs)); setResetVersion(value => value + 1) }}>Word 分语言稿</button></div>
    <label className="copy-check"><input type="checkbox" checked={prefs.followReader} onChange={event => change({ followReader: event.target.checked })}/>语言和顺序跟随阅读</label>
    {currentOrder.length > 1 && currentOrder.some(isChinese) && <div className="copy-order-shortcuts"><span>复制顺序</span><button onClick={() => change({ followReader: false, languages: [...currentOrder.filter(isChinese), ...currentOrder.filter(lang => !isChinese(lang))] })}>中文在前</button><button onClick={() => change({ followReader: false, languages: [...currentOrder.filter(lang => !isChinese(lang)), ...currentOrder.filter(isChinese)] })}>中文在后</button></div>}
    {!prefs.followReader && <div className="copy-language-options"><p>勾选语言，箭头排序。</p>
      {languages.map(lang => <label key={lang}><input type="checkbox" checked={prefs.languages.includes(lang)} disabled={visibleOrder.length === 1 && visibleOrder.includes(lang)} onChange={event => change({ languages: event.target.checked ? [...prefs.languages, lang] : prefs.languages.filter(item => item !== lang) })}/>{COPY_NAMES[lang]}</label>)}
      <ol>{visibleOrder.map((lang, index) => <li key={lang}><span>{COPY_NAMES[lang]}</span><button aria-label={`复制顺序上移${lang}`} disabled={!index} onClick={() => shift(lang, -1)}><ArrowUp size={14}/></button><button aria-label={`复制顺序下移${lang}`} disabled={index === visibleOrder.length - 1} onClick={() => shift(lang, 1)}><ArrowDown size={14}/></button></li>)}</ol>
      {!visibleOrder.length && <p role="status">请选择一种已载入的语言。</p>}
    </div>}
    <div className="copy-settings-grid">
      <label className="copy-check"><input type="checkbox" checked={prefs.includeSpeaker} onChange={event => change({ includeSpeaker: event.target.checked })}/>包含角色名字</label>
      {prefs.speakerLayout === 'inline' && <label className="copy-field">名字格式<select aria-label="名字格式" value={prefs.speakerMode} onChange={event => change({ speakerMode: event.target.value as CopyPreferences['speakerMode'] })}><option value="auto">按语言适配</option><option value="uniform">统一格式</option></select></label>}
      {prefs.speakerMode === 'uniform' && prefs.speakerLayout === 'inline' && <Separator key={`speaker-${resetVersion}`} label="名字分隔" speaker value={prefs.speakerSeparator} change={speakerSeparator => change({ speakerSeparator })}/>}
      <label className="copy-field">名字位置<select aria-label="名字位置" value={prefs.speakerLayout} onChange={event => change({speakerLayout:event.target.value as CopyPreferences['speakerLayout']})}><option value="inline">与正文同行</option><option value="heading">独占一行</option></select></label>
      <label className="copy-check"><input type="checkbox" checked={prefs.boldSpeaker} onChange={event=>change({boldSpeaker:event.target.checked})}/>名字加粗</label>
      {prefs.speakerLayout === 'heading' && <label className="copy-check"><input type="checkbox" checked={prefs.headingColon} onChange={event=>change({headingColon:event.target.checked})}/>名字后加冒号</label>}
      {prefs.speakerLayout === 'heading' && prefs.headingColon && <small>冒号按语言适配，行尾不加空格。</small>}
      <Separator key={`language-${resetVersion}`} label="语言分隔" value={prefs.languageSeparator} change={languageSeparator => change({ languageSeparator })}/>
    </div>
    {withHeader && <details className="copy-more copy-headers"><summary>日期与来源</summary>
      <div className="copy-settings-grid">
        <label className="copy-check"><input type="checkbox" checked={prefs.includeDate} onChange={event=>change({includeDate:event.target.checked})}/>添加日期</label>
        {prefs.includeDate && <label className="copy-field">日期<select aria-label="日期" value={prefs.dateMode} onChange={event=>change({dateMode:event.target.value as CopyPreferences['dateMode'],customDate:prefs.customDate || localCopyDate()})}><option value="today">当天（{dottedCopyDate(localCopyDate())}）</option><option value="custom">指定日期</option></select>{prefs.dateMode==='custom' && <input type="date" aria-label="指定日期" min="1000-01-01" max="9999-12-31" value={prefs.customDate} onChange={event=>change({customDate:event.target.value})}/>}</label>}
        <label className="copy-check"><input type="checkbox" checked={prefs.includeSource} onChange={event=>change({includeSource:event.target.checked})}/>添加来源</label>
        {prefs.includeSource && <label className="copy-field">来源格式<select aria-label="来源格式" value={prefs.sourceMode} onChange={event=>change({sourceMode:event.target.value as CopyPreferences['sourceMode']})}><option value="full">完整：游戏、版本、地区、任务与章节</option><option value="short">简短：幕次、章节与任务</option><option value="custom">自定义</option></select></label>}
      </div>
      {prefs.includeSource && (prefs.sourceMode==='custom' ? <label className="copy-field">自定义来源<textarea aria-label="自定义来源" maxLength={2000} value={prefs.customSource} onChange={event=>change({customSource:event.target.value})}/><small>固定文本，不随任务切换。</small></label> : <div className="copy-field"><span>{formatCopySource(source,prefs.sourceMode) || '打开任务后自动填入来源。'}</span><small>随当前任务更新；缺少的版本等信息自动省略。</small><button onClick={()=>change({sourceMode:'custom',customSource:formatCopySource(source,prefs.sourceMode)})}>编辑来源</button></div>)}
      <div className="copy-settings-grid"><label className="copy-check"><input type="checkbox" checked={prefs.boldHeader} onChange={event=>change({boldHeader:event.target.checked})}/>题头加粗</label><Separator key={`header-${resetVersion}`} label="题头与正文分隔" value={prefs.headerSeparator} change={headerSeparator=>change({headerSeparator})}/></div>
      <p className="copy-help">题头只在整份稿件开头添加一次。当天日期以复制时为准。</p>
    </details>}
    <details className="copy-more copy-language-styles"><summary>按语言单独设置</summary>
      <p className="copy-help">单独设置优先；未设置时沿用上方选项。</p>
      {languages.map(language => { const style = prefs.languageStyles[language]; const separator = prefs.speakerMode === 'auto' ? LANGUAGE_SPEAKER_SEPARATORS[language] : prefs.speakerSeparator; return <fieldset key={language}>
        <legend>{COPY_NAMES[language]} · {language}</legend><div className="copy-settings-grid">
          <label className="copy-field">角色名字<select aria-label={`${language}角色名字`} value={style?.includeSpeaker === undefined ? 'inherit' : style.includeSpeaker ? 'show' : 'hide'} onChange={event => changeLanguage(language, { includeSpeaker: event.target.value === 'inherit' ? undefined : event.target.value === 'show' })}><option value="inherit">沿用总体设置</option><option value="show">保留名字</option><option value="hide">仅正文</option></select></label>
          {prefs.speakerLayout === 'inline' && <Separator key={`${language}-${resetVersion}-${prefs.speakerMode}`} label={`${language}名字分隔`} speaker inherit={`沿用（名字${displaySeparator(separator)}正文）`} value={style?.separator ?? '__inherit'} change={value => changeLanguage(language, { separator: value === '__inherit' ? undefined : value })}/>}
        </div>
      </fieldset> })}
      {languages.some(language => prefs.languageStyles[language]) && <button onClick={() => { const styles = { ...prefs.languageStyles }; languages.forEach(language => delete styles[language]); change({ languageStyles: styles }); setResetVersion(value => value + 1) }}>清除这些语言的单独设置</button>}
    </details>
    <details className="copy-more copy-multiple"><summary>多段复制</summary>
      <p className="copy-help">每条台词算一段。段内与语言间的分隔分别设置。</p>
      <div className="copy-settings-grid">
        <label className="copy-field">多段排列<select aria-label="多段排列" value={prefs.grouping} onChange={event => change({ grouping: event.target.value as CopyPreferences['grouping'] })}><option value="sentence">逐段对照</option><option value="language">按语言分组</option></select></label>
        <Separator key={`sentence-${resetVersion}`} label="段落分隔" value={prefs.sentenceSeparator} change={sentenceSeparator => change({ sentenceSeparator })}/>
        <label className="copy-field">连续署名<select aria-label="连续署名" value={prefs.repeatSpeaker} onChange={event=>change({repeatSpeaker:event.target.value as CopyPreferences['repeatSpeaker']})}><option value="always">每段都署名</option><option value="changes">同一人连续发言只署名一次</option></select></label>
      </div>
    </details>
    <details className="copy-more"><summary>更多排版选项</summary><div className="copy-settings-grid">
      <label className="copy-check"><input type="checkbox" checked={prefs.languageLabels} onChange={event => change({ languageLabels: event.target.checked })}/>标注语言代码</label>
      <label className="copy-check"><input type="checkbox" checked={prefs.preserveBreaks} onChange={event => change({ preserveBreaks: event.target.checked })}/>保留正文内换行</label>
      <label className="copy-field">复制格式<select aria-label="复制格式" value={prefs.copyFormat} onChange={event=>change({copyFormat:event.target.value as CopyPreferences['copyFormat']})}><option value="rich">富文本＋纯文本</option><option value="plain">仅纯文本</option></select></label>
    </div></details>
    {prefs.copyFormat === 'rich' && (prefs.boldSpeaker || prefs.boldHeader || prefs.speakerLayout === 'heading') && <div className="copy-field">粘贴预览<div className="copy-rich-preview" role="region" aria-label="富文本预览" dangerouslySetInnerHTML={{__html:preview.html}}/><small>粘贴到 Word 时选择“保留源格式”。</small></div>}
    <label className="copy-field">纯文本预览<textarea aria-label="复制预览" readOnly value={preview.text} onFocus={event => event.target.select()}/></label>
    <div className="copy-settings-footer"><small>自动保存 · 仅复制已载入语言</small><button onClick={() => { setPrefs(normalizeCopy(DEFAULT_COPY)); setResetVersion(value => value + 1) }}>恢复默认格式</button></div>
  </section>
}
export function CopyButton({ blocks, languages, traveler = 'aether', label = '复制', only, compact = false, options = true, disabled = false, withHeader = true }: {
  blocks: CopyBlock[]; languages: LanguageCode[]; traveler?: Traveler; label?: string; only?: LanguageCode; compact?: boolean; options?: boolean; disabled?: boolean; withHeader?: boolean;
}) {
  const { prefs, copy, message, copying, source } = useContext(CopyContext)!
  const [open, setOpen] = useState(false)
  return <span className={`copy-control ${compact ? 'copy-compact' : ''}`}>
    <button type="button" disabled={disabled || copying} aria-busy={copying} aria-label={label} title={label} onClick={() => copy(formatCopyPayload(blocks, languages, prefs, traveler, only,{source,allowHeader:withHeader}))}><Copy size={14}/>{!compact && <span>{label}</span>}</button>
    {options && !only && <button type="button" disabled={disabled} className="copy-options-button" aria-label={`${label}的格式选项`} title="复制格式选项" onClick={() => setOpen(true)}><ChevronDown size={13}/></button>}
    {open && <CopyDialog title="复制选项" close={() => setOpen(false)}>
      <CopySettings languages={languages} blocks={blocks} traveler={traveler} withHeader={withHeader}/>
      <div className="copy-dialog-footer"><button className="copy-confirm" disabled={copying} aria-busy={copying} onClick={() => copy(formatCopyPayload(blocks, languages, prefs, traveler, undefined,{source,allowHeader:withHeader}))}><Copy size={16}/>{copying ? '正在复制…' : '复制预览内容'}</button>
      {message && <p role="status">{message}</p>}</div>
    </CopyDialog>}
  </span>
}
