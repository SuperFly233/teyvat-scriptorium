import type { PrintBundle } from '../types'

export type PrintMeta = { chapter: string; chapterEn: string; quest: string; questEn: string }

export function buildPrintMeta(bundles: PrintBundle[]): PrintMeta {
  if (!bundles.length) return { chapter: '剧情选稿', chapterEn: 'Script Collection', quest: '尚未选择内容', questEn: 'No sections selected' }

  const chapters = [...new Map(bundles.map((bundle) => [bundle.chapter.id, bundle.chapter])).values()]
  if (chapters.length === 1) {
    const chapter = chapters[0]
    if (bundles.length === 1) return { chapter: chapter.title.zh, chapterEn: chapter.title.en, quest: bundles[0].quest.title.zh, questEn: bundles[0].quest.title.en }
    return {
      chapter: chapter.title.zh,
      chapterEn: chapter.title.en,
      quest: `${chapter.number.zh} · ${bundles.length} 个任务段`,
      questEn: `${chapter.number.en} · ${bundles.length} selected sections`,
    }
  }

  if (chapters.length <= 3) return {
    chapter: chapters.map((chapter) => chapter.title.zh).join(' · '),
    chapterEn: chapters.map((chapter) => chapter.title.en).join(' / '),
    quest: `共 ${chapters.length} 章 · ${bundles.length} 个任务段`,
    questEn: `${chapters.length} chapters · ${bundles.length} selected sections`,
  }

  const regions = [...new Map(chapters.map((chapter) => [chapter.region.zh || chapter.region.en, chapter.region])).values()]
  const first = chapters[0]
  const last = chapters[chapters.length - 1]
  if (regions.length === 1 && regions[0].zh) return {
    chapter: `${regions[0].zh}剧情选稿`,
    chapterEn: `${regions[0].en || regions[0].zh} Script Collection`,
    quest: `${first.number.zh}—${last.number.zh} · 共 ${chapters.length} 章`,
    questEn: `${first.number.en} — ${last.number.en} · ${chapters.length} chapters`,
  }

  return {
    chapter: '多章节剧情选稿',
    chapterEn: 'Multi-Chapter Script Collection',
    quest: `共 ${chapters.length} 章 · ${bundles.length} 个任务段`,
    questEn: `${chapters.length} chapters · ${bundles.length} selected sections`,
  }
}
