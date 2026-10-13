import type { ChapterData, DialogueLine, LanguageCode, LanguagePair, Scene, Traveler } from '../types'
import { formatGameText } from './text'

export type ReadingEntry = {
  id: string; chapterId: number; questId: number; lineKey: string;
  chapterTitle: string; questTitle: string; text: string; note: string; updatedAt: string;
}
export type ReadingLibrary = { schema: 1; entries: ReadingEntry[]; recent: ReadingEntry[] }
export const EMPTY_LIBRARY: ReadingLibrary = { schema: 1, entries: [], recent: [] }
export const LIBRARY_KEY = 'teyvat:reading-library:v1'
export const localText = (pair: LanguagePair, language: LanguageCode) =>
  pair.translations?.[language] || (language === 'CHS' ? pair.zh : language === 'EN' ? pair.en : '')

export function readingLink(entry: Pick<ReadingEntry, 'chapterId' | 'questId' | 'lineKey'>): string {
  return `?${new URLSearchParams({ chapter: String(entry.chapterId), quest: String(entry.questId), line: entry.lineKey })}`
}
export function makeEntry(data: ChapterData, questId: number, line: DialogueLine): ReadingEntry {
  return { id: `${data.chapter.id}:${questId}:${line.key}`, chapterId: data.chapter.id, questId,
    lineKey: line.key, chapterTitle: data.chapter.title.zh,
    questTitle: data.quests.find(quest => quest.id === questId)?.title.zh || '',
    text: line.text.zh || line.text.en, note: '', updatedAt: new Date().toISOString() }
}
export function parseLibrary(raw: string): ReadingLibrary {
  const data = JSON.parse(raw);
  if (data?.schema !== 1 || !Array.isArray(data.entries) || !Array.isArray(data.recent)) throw new Error('备份格式不正确');
  if (data.entries.length > 10000 || data.recent.length > 30) throw new Error('备份条目过多');
  const valid = (entry: ReadingEntry) => entry && Number.isSafeInteger(entry.chapterId) && entry.chapterId > 0 &&
    Number.isSafeInteger(entry.questId) && entry.questId > 0 &&
    ['id', 'lineKey', 'chapterTitle', 'questTitle', 'text', 'note', 'updatedAt'].every(key => typeof entry[key as keyof ReadingEntry] === 'string') &&
    entry.id === `${entry.chapterId}:${entry.questId}:${entry.lineKey}` && entry.note.length <= 5000 && entry.text.length <= 50000 &&
    entry.lineKey.length <= 300 && entry.chapterTitle.length <= 1000 && entry.questTitle.length <= 1000;
  if (![...data.entries, ...data.recent].every(valid)) throw new Error('备份中存在无效条目');
  if (new Set(data.entries.map((entry: ReadingEntry) => entry.id)).size !== data.entries.length) throw new Error('备份中存在重复收藏');
  return { schema: 1, entries: data.entries, recent: data.recent };
}
export function mergeLibrary(current: ReadingLibrary, incoming: ReadingLibrary): ReadingLibrary {
  const merge = (a: ReadingEntry[], b: ReadingEntry[]) => [...new Map([...b, ...a].map(entry => [entry.id, entry])).values()];
  return { schema: 1, entries: merge(current.entries, incoming.entries),
    recent: [...new Map([...current.recent, ...incoming.recent].map(entry => [entry.chapterId, entry])).values()].slice(0, 30) };
}
export function exportDialogue(scenes: Scene[], languages: LanguageCode[], traveler: Traveler, format: 'md' | 'tsv', title: string): string {
  const cell = (text: string) => {
    const clean = text.replace(/[\t\r\n]+/g, ' ');
    return /^[\s]*[=+@-]/.test(clean) ? `'${clean}` : clean;
  };
  if (format === 'tsv') return '\ufeff' + [['场景', '节点', ...languages.flatMap(lang => [`${lang} 角色`, `${lang} 台词`])],
    ...scenes.flatMap(scene => scene.lines.map(line => [scene.title.zh, line.nodeId,
      ...languages.flatMap(lang => [localText(line.speaker, lang), formatGameText(localText(line.text, lang), traveler)])]))]
    .map(row => row.map(cell).join('\t')).join('\r\n');
  return [`# ${title}`, ...scenes.flatMap(scene => [`\n## ${scene.title.zh}`, ...scene.lines.map(line =>
    `\n${languages.map(lang => `**${lang} · ${localText(line.speaker, lang) || '旁白'}**\n\n${formatGameText(localText(line.text, lang), traveler) || '—'}`).join('\n\n')}`)])].join('\n');
}
export function downloadText(text: string, filename: string, mime = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
  anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
