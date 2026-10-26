import type { LanguageCode, LanguagePair, Scene, Traveler } from '../types'
import { localText } from './reading'
import { formatGameText } from './text'

export type CopyBlock = { text: LanguagePair; speaker?: LanguagePair; continuityKey?: string; ordinal?: number }
export type CopyPayload = { text: string; html: string }
export type LanguageCopyStyle = { includeSpeaker?: boolean; separator?: string }
export type CopyPreferences = {
  followReader: boolean; languages: LanguageCode[]; includeSpeaker: boolean;
  speakerSeparator: string; languageSeparator: string; sentenceSeparator: string;
  languageLabels: boolean; grouping: 'sentence' | 'language'; preserveBreaks: boolean;
  speakerMode: 'auto' | 'uniform'; languageStyles: Partial<Record<LanguageCode, LanguageCopyStyle>>;
  repeatSpeaker: 'always' | 'changes'; speakerLayout: 'inline' | 'heading';
  boldSpeaker: boolean; headingColon: boolean; copyFormat: 'rich' | 'plain';
}
export const COPY_KEY = 'teyvat:copy:v1'
export const COPY_LANGUAGES: LanguageCode[] = ['CHS','CHT','EN','JP','KR','DE','ES','FR','ID','PT','RU','TH','VI','IT','TR']
export const COPY_NAMES: Record<LanguageCode, string> = { CHS:'简体中文', CHT:'繁體中文', EN:'English', JP:'日本語', KR:'한국어', DE:'Deutsch', ES:'Español', FR:'Français', ID:'Bahasa Indonesia', PT:'Português', RU:'Русский', TH:'ไทย', VI:'Tiếng Việt', IT:'Italiano', TR:'Türkçe' }
export const DEFAULT_COPY: CopyPreferences = { followReader: true, languages: ['CHS','EN'], includeSpeaker: true,
  speakerSeparator: '：', languageSeparator: '\n', sentenceSeparator: '\n\n', languageLabels: false, grouping: 'sentence', preserveBreaks: true,
  speakerMode: 'auto', languageStyles: {}, repeatSpeaker:'always', speakerLayout:'inline', boldSpeaker:false, headingColon:true, copyFormat:'rich' }
export function wordCopyPreset(prefs: CopyPreferences): CopyPreferences {
  return { ...prefs, includeSpeaker:true, speakerMode:'auto', languageStyles:{}, grouping:'language',
    sentenceSeparator:'\n', languageSeparator:'\n——\n', repeatSpeaker:'changes', speakerLayout:'heading', boldSpeaker:true, headingColon:true,
    copyFormat:'rich', languageLabels:false, preserveBreaks:true };
}
export function copyBlocksForScenes(scenes: Scene[], selected?: Set<string>): CopyBlock[] {
  return scenes.flatMap(scene => scene.lines.flatMap((line, ordinal) => !selected || selected.has(line.key) ? [{
    text:line.text, speaker:line.kind === 'narration' ? undefined : line.speaker, ordinal,
    continuityKey:`${scene.key}:${line.branchGroupId || ''}:${line.branchIndex ?? ''}`,
  }] : []));
}
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
  for (const key of ['followReader','includeSpeaker','languageLabels','preserveBreaks','boldSpeaker','headingColon'] as const) if (typeof raw[key] === 'boolean') prefs[key] = raw[key];
  if (raw.repeatSpeaker === 'always' || raw.repeatSpeaker === 'changes') prefs.repeatSpeaker = raw.repeatSpeaker;
  if (raw.speakerLayout === 'inline' || raw.speakerLayout === 'heading') prefs.speakerLayout = raw.speakerLayout;
  if (raw.copyFormat === 'rich' || raw.copyFormat === 'plain') prefs.copyFormat = raw.copyFormat;
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
type CopyToken = { text: string; bold?: boolean }
const escapeHtml = (text: string) => text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
export function formatCopyPayload(blocks: CopyBlock[], available: LanguageCode[], prefs: CopyPreferences, traveler: Traveler = 'aether', only?: LanguageCode): CopyPayload {
  const languages = copyLanguages(prefs, available, only);
  const clean = (value: string) => { const text = formatGameText(value, traveler); return prefs.preserveBreaks ? text : text.replace(/\s*\n\s*/g, ' '); };
  const previous = new Map<LanguageCode, { speaker: string; context?: string; ordinal?: number }>();
  const render = (block: CopyBlock, lang: LanguageCode): CopyToken[] => {
    const text = clean(localText(block.text, lang)); if (!text) { previous.delete(lang); return []; }
    const style = speakerStyle(prefs, lang);
    const speaker = style.includeSpeaker && block.speaker ? clean(localText(block.speaker, lang)) : '';
    const identity = speaker && block.speaker ? `${block.speaker.zh}\u0000${block.speaker.en}\u0000${speaker}` : '';
    const last = previous.get(lang);
    const continuous = last && last.speaker === identity && last.context === block.continuityKey &&
      (block.ordinal === undefined && last.ordinal === undefined || block.ordinal !== undefined && last.ordinal !== undefined && block.ordinal === last.ordinal + 1);
    const showName = speaker && (prefs.repeatSpeaker !== 'changes' || !continuous);
    if (identity) previous.set(lang, {speaker:identity,context:block.continuityKey,ordinal:block.ordinal}); else previous.delete(lang);
    const tokens: CopyToken[] = [];
    if (prefs.languageLabels) tokens.push({text:`[${lang}] `});
    if (showName) {
      if (prefs.speakerLayout === 'heading') {
        tokens.push({text:speaker + (prefs.headingColon ? LANGUAGE_SPEAKER_SEPARATORS[lang].trimEnd() : ''),bold:prefs.boldSpeaker}, {text:'\n'});
      } else tokens.push({text:speaker,bold:prefs.boldSpeaker}, {text:style.separator});
    }
    tokens.push({text}); return tokens;
  };
  const join = (groups: CopyToken[][], separator: string): CopyToken[] => groups.filter(group => group.length).flatMap((group,index) => index ? [{text:separator},...group] : group);
  const tokens = prefs.grouping === 'language'
    ? join(languages.map(lang => join(blocks.map(block => render(block,lang)),prefs.sentenceSeparator)),prefs.languageSeparator)
    : join(blocks.map(block => join(languages.map(lang => render(block,lang)),prefs.languageSeparator)),prefs.sentenceSeparator);
  const lines = [''];
  for (const token of tokens) {
    token.text.split('\n').forEach((part,index) => {
      if (index) lines.push('');
      if (part) lines[lines.length - 1] += token.bold ? `<strong style="font-weight:700">${escapeHtml(part)}</strong>` : escapeHtml(part);
    });
  }
  const text = tokens.map(token=>token.text).join('');
  const fragment = text ? lines.map(line=>`<p style="margin:0;white-space:pre-wrap">${line || '<br>'}</p>`).join('') : '';
  return { text, html:`<html><body><!--StartFragment--><div style="font-weight:400">${fragment}</div><!--EndFragment--></body></html>` };
}
export function formatCopy(blocks: CopyBlock[], available: LanguageCode[], prefs: CopyPreferences, traveler: Traveler = 'aether', only?: LanguageCode): string {
  return formatCopyPayload(blocks,available,prefs,traveler,only).text;
}
