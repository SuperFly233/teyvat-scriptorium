import type { DialogueLine, Scene, Traveler } from '../types'
import { formatGameText, normalizeSearch } from './text'

const lineSearchCache = new WeakMap<DialogueLine, Partial<Record<Traveler, string>>>()

export function lineSearchText(line: DialogueLine, traveler: Traveler): string {
  const cached = lineSearchCache.get(line)?.[traveler]
  if (cached !== undefined) return cached
  const text = normalizeSearch([line.speaker.zh, line.speaker.en, ...Object.values(line.speaker.translations || {}), formatGameText(line.text.zh, traveler), formatGameText(line.text.en, traveler), ...Object.values(line.text.translations || {}).map((value) => formatGameText(value || '', traveler))].join(' '))
  const entry = lineSearchCache.get(line) || {}
  entry[traveler] = text
  lineSearchCache.set(line, entry)
  return text
}

export function lineMatches(line: DialogueLine, query: string, traveler: Traveler): boolean {
  const needle = normalizeSearch(query)
  if (!needle) return true
  return lineSearchText(line, traveler).includes(needle)
}

export function filterScenes(scenes: Scene[], selected: Set<string>, query: string, traveler: Traveler): Scene[] {
  const needle = normalizeSearch(query)
  return scenes
    .filter((scene) => selected.has(scene.key))
    .map((scene) => ({ ...scene, lines: needle ? scene.lines.filter((line) => lineSearchText(line, traveler).includes(needle)) : scene.lines }))
    .filter((scene) => scene.lines.length > 0)
}
