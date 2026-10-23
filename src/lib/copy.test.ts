import { describe, expect, it } from 'vitest'
import { DEFAULT_COPY, copyLanguages, formatCopy, normalizeCopy, type CopyBlock } from './copy'
const blocks: CopyBlock[] = [{ speaker: { zh:'派蒙', en:'Paimon' }, text: { zh:'#你好，{M#哥哥}{F#姐姐}。', en:'Hello.\nTraveler.', translations:{ JP:'こんにちは。' } } }, { text:{ zh:'风吹过。', en:'The wind blows.' } }]
describe('custom clipboard formatting', () => {
  it('copies one sentence bilingually in reader order', () => {
    expect(formatCopy(blocks.slice(0,1), ['EN','CHS'], DEFAULT_COPY, 'lumine')).toBe('Paimon: Hello.\nTraveler.\n派蒙：你好，姐姐。')
  })
  it('supports independent language order and one language only', () => {
    const prefs = {...DEFAULT_COPY, followReader:false, languages:['EN','CHS'] as const}
    expect(copyLanguages({...prefs,languages:[...prefs.languages]}, ['CHS','EN'])).toEqual(['EN','CHS'])
    expect(formatCopy(blocks.slice(0,1), ['CHS','EN'], DEFAULT_COPY, 'aether', 'EN')).toBe('Paimon: Hello.\nTraveler.')
  })
  it('omits names, skips absent translations and never inserts fake names for narration', () => {
    expect(formatCopy(blocks, ['JP'], {...DEFAULT_COPY, includeSpeaker:false})).toBe('こんにちは。')
    expect(formatCopy(blocks.slice(1), ['CHS'], DEFAULT_COPY)).toBe('风吹过。')
  })
  it('supports blank lines, spaces and custom separators exactly', () => {
    expect(formatCopy(blocks.slice(0,1), ['CHS','EN'], {...DEFAULT_COPY, speakerMode:'uniform',speakerSeparator:'\n\n',languageSeparator:' | ',preserveBreaks:false})).toBe('派蒙\n\n你好，哥哥。 | Paimon\n\nHello. Traveler.')
    expect(formatCopy(blocks.slice(0,1), ['CHS'], {...DEFAULT_COPY, speakerMode:'uniform',speakerSeparator:' '})).toBe('派蒙 你好，哥哥。')
  })
  it('groups multiple sentences by language with optional language labels', () => {
    const result = formatCopy(blocks, ['CHS','EN'], {...DEFAULT_COPY, grouping:'language',languageLabels:true,includeSpeaker:false,sentenceSeparator:' / ',languageSeparator:'\n---\n',preserveBreaks:false})
    expect(result).toBe('[CHS] 你好，哥哥。 / [CHS] 风吹过。\n---\n[EN] Hello. Traveler. / [EN] The wind blows.')
  })
  it('validates stored preferences and safely handles no available language', () => {
    expect(normalizeCopy({languages:['XX','CHS','CHS'],includeSpeaker:'false',grouping:'bad'})).toEqual({...DEFAULT_COPY,languages:['CHS']})
    expect(formatCopy(blocks, ['JP'], {...DEFAULT_COPY,followReader:false,languages:['EN']})).toBe('')
    expect(normalizeCopy(null)).toEqual(DEFAULT_COPY)
  })
  it('uses locale-specific speaker prefixes including French nonbreaking spacing', () => {
    const text = { zh:'正文', en:'Text', translations:{CHT:'正文', JP:'本文', FR:'Texte'} };
    const speaker = {zh:'名字',en:'Name',translations:{CHT:'名字',JP:'名前',FR:'Nom'}};
    expect(formatCopy([{text,speaker}], ['CHS','CHT','JP','EN','FR'], DEFAULT_COPY)).toBe('名字：正文\n名字：正文\n名前：本文\nName: Text\nNom\u00a0: Texte')
  })
  it('allows a different separator and name visibility for each language', () => {
    const prefs = {...DEFAULT_COPY,languageStyles:{CHS:{separator:'\n'},EN:{includeSpeaker:false}}};
    expect(formatCopy(blocks.slice(0,1), ['CHS','EN'], prefs)).toBe('派蒙\n你好，哥哥。\nHello.\nTraveler.')
    expect(formatCopy(blocks.slice(0,1), ['CHS','EN'], {...prefs,includeSpeaker:false,languageStyles:{EN:{includeSpeaker:true,separator:' — '}}})).toBe('你好，哥哥。\nPaimon — Hello.\nTraveler.')
  })
  it('prioritizes language overrides over uniform format without affecting narration', () => {
    expect(formatCopy(blocks, ['CHS','EN'], {...DEFAULT_COPY,speakerMode:'uniform',speakerSeparator:' ',languageStyles:{EN:{separator:'\n\n'}}})).toBe('派蒙 你好，哥哥。\nPaimon\n\nHello.\nTraveler.\n\n风吹过。\nThe wind blows.')
  })
  it('migrates the old default but preserves intentionally customized separators', () => {
    expect(normalizeCopy({speakerSeparator:'：',languages:['EN','CHS']}).speakerMode).toBe('auto')
    for(const separator of [': ', '\n\n', ' ', '']) expect(normalizeCopy({speakerSeparator:separator}).speakerMode).toBe('uniform')
    expect(normalizeCopy({speakerMode:'uniform',speakerSeparator:'：'}).speakerMode).toBe('uniform')
  })
  it('round trips overrides and safely filters malformed language styles', () => {
    const prefs = {...DEFAULT_COPY,languageStyles:{EN:{separator:'',includeSpeaker:false},CHS:{separator:'\n'}}};
    expect(normalizeCopy(JSON.parse(JSON.stringify(prefs)))).toEqual(prefs)
    expect(normalizeCopy({languageStyles:{XX:{separator:'x'},CHS:{separator:3,includeSpeaker:'no'},EN:{separator:'x'.repeat(100),includeSpeaker:true}}}).languageStyles).toEqual({EN:{separator:'x'.repeat(80),includeSpeaker:true}})
    expect(DEFAULT_COPY.languageStyles).toEqual({})
  })
})
