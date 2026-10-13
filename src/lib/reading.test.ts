import { describe, expect, it } from 'vitest'
import { EMPTY_LIBRARY, exportDialogue, mergeLibrary, parseLibrary, readingLink, type ReadingEntry } from './reading'
import type { Scene } from '../types'

const entry: ReadingEntry = { id: '1700:7011:a/b', chapterId: 1700, questId: 7011, lineKey: 'a/b', chapterTitle: '雪国', questTitle: '任务', text: '台词', note: '笔记', updatedAt: '2026-10-13T00:00:00Z' }
const scene: Scene = { id: 1, key: 's', hidden: false, title: { zh: '场景', en: 'Scene' }, description: { zh: '', en: '' }, lines: [
  { key: 'a', nodeId: '100', variant: 0, kind: 'dialogue', speaker: { zh: '派蒙', en: 'Paimon' }, text: { zh: '你好\n旅行者', en: '=HYPERLINK("x")', translations: { JP: 'こんにちは' } } },
] }
describe('reading library and exports', () => {
  it('round trips a backup and safely encodes sentence links', () => {
    expect(parseLibrary(JSON.stringify({ schema: 1, entries: [entry], recent: [entry] })).entries[0]).toEqual(entry)
    expect(new URLSearchParams(readingLink(entry).slice(1)).get('line')).toBe('a/b')
  })
  it('rejects malformed, conflicting and duplicate imported records', () => {
    for (const entries of [[{ ...entry, questId: -1 }], [{ ...entry, id: 'wrong' }], [{ ...entry, note: null }], [entry, entry]]) {
      expect(() => parseLibrary(JSON.stringify({ schema: 1, entries, recent: [] }))).toThrow()
    }
    expect(() => parseLibrary('{"schema":2}')).toThrow()
  })
  it('merges backups without overwriting existing notes or duplicating bookmarks', () => {
    const current = { ...EMPTY_LIBRARY, entries: [entry], recent: [entry] }
    const incoming = { ...EMPTY_LIBRARY, entries: [{ ...entry, note: '旧笔记' }], recent: [entry] }
    expect(mergeLibrary(current, incoming).entries).toEqual([entry])
    expect(mergeLibrary(current, incoming).recent).toHaveLength(1)
  })
  it('exports the chosen languages and prevents formula execution in TSV cells', () => {
    const output = exportDialogue([scene], ['CHS', 'EN', 'JP'], 'aether', 'tsv', '任务')
    expect(output).toContain('JP 台词')
    expect(output).toContain("'=HYPERLINK")
    expect(output).toContain('你好 旅行者')
    expect(output).toContain('こんにちは')
    expect(output.split('\r\n')).toHaveLength(2)
  })
  it('exports clean game text and traveler variants to Markdown', () => {
    const variant = { ...scene, lines: [{ ...scene.lines[0], text: { zh: '#<color=red>{M#哥哥}{F#姐姐}</color>', en: 'Hello' } }] }
    const output = exportDialogue([variant], ['CHS'], 'lumine', 'md', '任务')
    expect(output).toContain('姐姐'); expect(output).not.toContain('<color'); expect(output).not.toContain('Hello')
  })
})
