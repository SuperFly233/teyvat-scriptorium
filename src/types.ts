export type LanguagePair = { zh: string; en: string }

export type DialogueLine = {
  key: string
  nodeId: string
  variant: number
  kind: 'dialogue' | 'choice' | 'narration'
  speaker: LanguagePair
  text: LanguagePair
}

export type Scene = {
  key: string
  id: number
  hidden: boolean
  title: LanguagePair
  description: LanguagePair
  lines: DialogueLine[]
}

export type Quest = {
  id: number
  order: number
  title: LanguagePair
  description: LanguagePair
  scenes: Scene[]
}

export type ChapterData = {
  schemaVersion: number
  generatedAt: string
  source: { primary: string; url: string; verification: string }
  chapter: {
    id: number
    number: LanguagePair
    title: LanguagePair
    region: LanguagePair
  }
  stats: { quests: number; scenes: number; lines: number; missingPairs: number }
  quests: Quest[]
}

export type ViewMode = 'parallel' | 'stacked' | 'zh' | 'en' | 'compact'
export type Traveler = 'aether' | 'lumine'
export type PrintPreset = 'parallel' | 'study' | 'zh' | 'en'
