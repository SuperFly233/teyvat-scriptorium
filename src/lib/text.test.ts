import { describe, expect, it } from 'vitest'
import { filterScenes, lineMatches } from './filter'
import { formatGameText } from './text'
import type { DialogueLine, Scene } from '../types'

const line: DialogueLine = {
  key: '1', nodeId: '1', variant: 0, kind: 'dialogue',
  speaker: { zh: '派蒙', en: 'Paimon' },
  text: { zh: '#这是{M#哥哥}{F#姐姐}。', en: 'This is {M#his}{F#her} story.' },
}

describe('game text formatting', () => {
  it('resolves traveler variants and control prefixes', () => {
    expect(formatGameText(line.text.zh, 'aether')).toBe('这是哥哥。')
    expect(formatGameText(line.text.en, 'lumine')).toBe('This is her story.')
  })
})

describe('story filtering', () => {
  it('searches both languages and speakers', () => {
    expect(lineMatches(line, 'Paimon', 'aether')).toBe(true)
    expect(lineMatches(line, '哥哥', 'aether')).toBe(true)
    expect(lineMatches(line, '不存在', 'aether')).toBe(false)
  })

  it('keeps only selected scenes with matching lines', () => {
    const scene: Scene = { key: 'scene', id: 1, hidden: false, title: { zh: '场景', en: 'Scene' }, description: { zh: '', en: '' }, lines: [line] }
    expect(filterScenes([scene], new Set(['scene']), '派蒙', 'aether')).toHaveLength(1)
    expect(filterScenes([scene], new Set(), '', 'aether')).toHaveLength(0)
  })
})
