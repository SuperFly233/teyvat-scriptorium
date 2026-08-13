import { describe, expect, it } from 'vitest'
import { buildPrintMeta } from './printMeta'
import type { PrintBundle } from '../types'

const chapter = (id: number, title: string, number: string, region = '至冬') => ({
  id,
  title: { zh: title, en: `${title} EN` },
  number: { zh: number, en: `${number} EN` },
  region: { zh: region, en: `${region} EN` },
})

const bundle = (id: number, chapterData: ReturnType<typeof chapter>): PrintBundle => ({
  key: `${chapterData.id}:${id}`,
  chapter: chapterData,
  quest: { id, order: id, title: { zh: `任务 ${id}`, en: `Quest ${id}` }, description: { zh: '', en: '' } },
  scenes: [],
})

describe('buildPrintMeta', () => {
  it('keeps the official chapter title when multiple quest sections share one chapter', () => {
    const current = chapter(1700, '无神怜爱的雪国', '第七章 第一幕')
    expect(buildPrintMeta([bundle(1, current), bundle(2, current), bundle(3, current), bundle(4, current)])).toMatchObject({
      chapter: '第七章 第一幕 · 无神怜爱的雪国',
      quest: '4 个 Chapter / 任务段',
    })
  })

  it('lists up to three chapter titles', () => {
    const meta = buildPrintMeta([bundle(1, chapter(1, '第一幕', '第一章')), bundle(2, chapter(2, '第二幕', '第二章'))])
    expect(meta.chapter).toBe('第一幕 · 第二幕')
  })

  it('uses a region collection title for four or more chapters in one region', () => {
    const bundles = [1, 2, 3, 4].map((id) => bundle(id, chapter(id, `第${id}幕`, `第${id}章`)))
    expect(buildPrintMeta(bundles).chapter).toBe('至冬剧情选稿')
  })
})
