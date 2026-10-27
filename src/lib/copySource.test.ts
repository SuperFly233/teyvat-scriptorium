import { describe, expect, it } from 'vitest'
import { dottedCopyDate, formatCopySource, localCopyDate, validCopyDate, buildCopySource, type CopySource } from './copySource'
import { DEFAULT_COPY, formatCopyPayload, normalizeCopy, wordCopyPreset } from './copy'
import type { ChapterData, Quest } from '../types'

const source:CopySource={chapterTitle:'千手百眼，天下人间',questTitle:'眷属的践行',chapterNumber:'第二章 第三幕',version:'2.0',region:'稻妻',taskType:'魔神任务'}
const blocks=[{speaker:{zh:'派蒙',en:'Paimon'},text:{zh:'你好。',en:'Hello.'}}]
describe('copy document headers',()=>{
  it('formats full and short source headings from task metadata',()=>{
    expect(formatCopySource(source,'full')).toBe('《原神》2.0稻妻 魔神任务 第二章 第三幕 「千手百眼，天下人间」—「眷属的践行」')
    expect(formatCopySource(source,'short')).toBe('第三幕 「千手百眼，天下人间」—「眷属的践行」')
    expect(formatCopySource({...source,version:'7.0',region:'至冬',taskType:'世界任务',chapterNumber:'',chapterTitle:'她的宫殿正坍塌向风雪',questTitle:'曾为灵魂的木舟'},'full')).toBe('《原神》7.0至冬 世界任务 「她的宫殿正坍塌向风雪」—「曾为灵魂的木舟」')
  })
  it('does not invent missing metadata or duplicate a chapter title',()=>{
    expect(formatCopySource({...source,version:'',region:'',taskType:'',chapterNumber:'任务系列',questTitle:source.chapterTitle},'full')).toBe('《原神》 「千手百眼，天下人间」')
    expect(formatCopySource(undefined,'full')).toBe('')
    const data={chapter:{title:{zh:'系列'},number:{zh:''},region:{zh:'至冬'}}} as ChapterData
    expect(buildCopySource(data,{title:{zh:'任务'}} as Quest)).toMatchObject({version:'',taskType:'',region:'至冬',questTitle:'任务'})
  })
  it('uses local calendar dates without zero padding and validates custom dates',()=>{
    expect(localCopyDate(new Date(2026,8,3,23,59))).toBe('2026-09-03')
    expect(dottedCopyDate('2026-09-03')).toBe('2026.9.3')
    expect(validCopyDate('2024-02-29')).toBe(true)
    for(const value of ['2026-02-29','2026-13-01','2026-04-31','2026-9-3','0001-01-01']) expect(validCopyDate(value)).toBe(false)
    expect(dottedCopyDate('bad')).toBe('')
  })
  it('prepends bold date and source once before all language groups',()=>{
    const payload=formatCopyPayload(blocks,['CHS','EN'],wordCopyPreset(DEFAULT_COPY),'aether',undefined,{source,now:new Date(2026,9,27)})
    expect(payload.text).toBe(`2026.10.27\n${formatCopySource(source,'full')}\n派蒙：\n你好。\n——\nPaimon:\nHello.`)
    expect(payload.html.match(/2026\.10\.27/g)).toHaveLength(1)
    expect(payload.html).toContain('<strong style="font-weight:700">2026.10.27</strong>')
    expect(payload.html.match(/<strong /g)).toHaveLength(4)
  })
  it('supports fixed date, custom source, header separator and safe rich text',()=>{
    const prefs={...wordCopyPreset(DEFAULT_COPY),dateMode:'custom' as const,customDate:'2026-10-26',sourceMode:'custom' as const,customSource:'<img src=x> & 来源',headerSeparator:'\n\n'}
    const payload=formatCopyPayload(blocks,['CHS'],prefs)
    expect(payload.text).toContain('2026.10.26\n<img src=x> & 来源\n\n派蒙')
    expect(payload.html).toContain('&lt;img src=x&gt; &amp; 来源')
    expect(payload.html).not.toContain('<img')
    expect(normalizeCopy(JSON.parse(JSON.stringify(prefs)))).toEqual(prefs)
    expect(normalizeCopy({...prefs,customDate:'2026-02-29'}).customDate).toBe('')
  })
  it('omits headers from empty copies and title-only copies',()=>{
    const prefs=wordCopyPreset(DEFAULT_COPY)
    expect(formatCopyPayload([],['CHS'],prefs,'aether',undefined,{source}).text).toBe('')
    expect(formatCopyPayload(blocks,['CHS'],prefs,'aether',undefined,{source,allowHeader:false}).text).toBe('派蒙：\n你好。')
    expect(formatCopyPayload(blocks,['CHS'],{...prefs,boldHeader:false},'aether',undefined,{source}).html.match(/<strong /g)).toHaveLength(1)
  })
})
