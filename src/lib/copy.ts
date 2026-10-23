import type { LanguageCode, LanguagePair, Traveler } from '../types'
import { localText } from './reading'
import { formatGameText } from './text'

export type CopyBlock = { text: LanguagePair; speaker?: LanguagePair }
export type LanguageCopyStyle = { includeSpeaker?: boolean; separator?: string }
export type CopyPreferences = {
  followReader: boolean; languages: LanguageCode[]; includeSpeaker: boolean;
  speakerSeparator: string; languageSeparator: string; sentenceSeparator: string;
  languageLabels: boolean; grouping: 'sentence' | 'language'; preserveBreaks: boolean;
  speakerMode: 'auto' | 'uniform'; languageStyles: Partial<Record<LanguageCode, LanguageCopyStyle>>;
}
export const COPY_KEY = 'teyvat:copy:v1'
export const COPY_LANGUAGES: LanguageCode[] = ['CHS','CHT','EN','JP','KR','DE','ES','FR','ID','PT','RU','TH','VI','IT','TR']
export const COPY_NAMES: Record<LanguageCode, string> = { CHS:'简体中文', CHT:'繁體中文', EN:'English', JP:'日本語', KR:'한국어', DE:'Deutsch', ES:'Español', FR:'Français', ID:'Bahasa Indonesia', PT:'Português', RU:'Русский', TH:'ไทย', VI:'Tiếng Việt', IT:'Italiano', TR:'Türkçe' }
export const DEFAULT_COPY: CopyPreferences = { followReader: true, languages: ['CHS','EN'], includeSpeaker: true,
  speakerSeparator: '：', languageSeparator: '\n', sentenceSeparator: '\n\n', languageLabels: false, grouping: 'sentence', preserveBreaks: true,
  speakerMode: 'auto', languageStyles: {} }
// Plain-text speaker prefixes, not rules for all punctuation within the original dialogue.
export const LANGUAGE_SPEAKER_SEPARATORS: Record<LanguageCode, string> = {
  CHS:'：', CHT:'：', JP:'：', EN:': ', KR:': ', DE:': ', ES:': ',
  FR:'\u00a0: ', ID:': ', PT:': ', RU:': ', TH:': ', VI:': ', IT:': ', TR:': ',
}
export function speakerStyle(prefs: CopyPreferences, language: LanguageCode) {
  const style = prefs.languageStyles[language];
  return { includeSpeaker: style?.includeSpeaker ?? prefs.includeSpeaker,
    separator: style?.separator ?? (prefs.speakerMode === 'auto' ? LANGUAGE_SPEAKER_SEPARATORS[language] : prefs.speakerSeparator) };
}
export function normalizeCopy(value: unknown): CopyPreferences {
  const prefs = { ...DEFAULT_COPY, languageStyles: {} as CopyPreferences['languageStyles'] }; if (!value || typeof value !== 'object') return prefs;
  const raw = value as Record<string, unknown>;
  for (const key of ['followReader','includeSpeaker','languageLabels','preserveBreaks'] as const) if (typeof raw[key] === 'boolean') prefs[key] = raw[key];
  for (const key of ['speakerSeparator','languageSeparator','sentenceSeparator'] as const) if (typeof raw[key] === 'string') prefs[key] = raw[key].slice(0, 80);
  if (raw.speakerMode === 'auto' || raw.speakerMode === 'uniform') prefs.speakerMode = raw.speakerMode;
  else if (typeof raw.speakerSeparator === 'string' && raw.speakerSeparator !== '：') prefs.speakerMode = 'uniform';
  if (raw.languageStyles && typeof raw.languageStyles === 'object') {
    for (const language of COPY_LANGUAGES) {
      const style = (raw.languageStyles as Record<string, unknown>)[language];
      if (!style || typeof style !== 'object') continue;
      const { includeSpeaker, separator } = style as Record<string, unknown>;
      const clean: LanguageCopyStyle = {};
      if (typeof includeSpeaker === 'boolean') clean.includeSpeaker = includeSpeaker;
      if (typeof separator === 'string') clean.separator = separator.slice(0, 80);
      if (Object.keys(clean).length) prefs.languageStyles[language] = clean;
    }
  }
  if (raw.grouping === 'sentence' || raw.grouping === 'language') prefs.grouping = raw.grouping;
  if (Array.isArray(raw.languages)) {
    const languages = [...new Set(raw.languages.filter((lang): lang is LanguageCode => COPY_LANGUAGES.includes(lang)))];
    if (languages.length) prefs.languages = languages;
  }
  return prefs;
}
export function copyLanguages(prefs: CopyPreferences, available: LanguageCode[], only?: LanguageCode): LanguageCode[] {
  return only ? [only].filter(lang => available.includes(lang)) : prefs.followReader ? available : prefs.languages.filter(lang => available.includes(lang));
}
export function formatCopy(blocks: CopyBlock[], available: LanguageCode[], prefs: CopyPreferences, traveler: Traveler = 'aether', only?: LanguageCode): string {
  const languages = copyLanguages(prefs, available, only);
  const clean = (value: string) => { const text = formatGameText(value, traveler); return prefs.preserveBreaks ? text : text.replace(/\s*\n\s*/g, ' '); };
  const render = (block: CopyBlock, lang: LanguageCode) => {
    const text = clean(localText(block.text, lang)); if (!text) return '';
    const style = speakerStyle(prefs, lang);
    const speaker = style.includeSpeaker && block.speaker ? clean(localText(block.speaker, lang)) : '';
    return `${prefs.languageLabels ? `[${lang}] ` : ''}${speaker ? speaker + style.separator : ''}${text}`;
  };
  return prefs.grouping === 'language'
    ? languages.map(lang => blocks.map(block => render(block, lang)).filter(Boolean).join(prefs.sentenceSeparator)).filter(Boolean).join(prefs.languageSeparator)
    : blocks.map(block => languages.map(lang => render(block, lang)).filter(Boolean).join(prefs.languageSeparator)).filter(Boolean).join(prefs.sentenceSeparator);
}
