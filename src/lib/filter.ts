import type { DialogueLine, Scene, Traveler } from '../types'
import { formatGameText, normalizeSearch } from './text'

export function lineMatches(line: DialogueLine, query: string, traveler: Traveler): boolean {
  const needle = normalizeSearch(query)
  if (!needle) return true
  const haystack = [line.speaker.zh, line.speaker.en, ...Object.values(line.speaker.translations || {}), formatGameText(line.text.zh, traveler), formatGameText(line.text.en, traveler), ...Object.values(line.text.translations || {}).map((text) => formatGameText(text || '', traveler))].join(' ')
  return normalizeSearch(haystack).includes(needle)
}

export function filterScenes(scenes: Scene[], selected: Set<string>, query: string, traveler: Traveler): Scene[] {
  return scenes
    .filter((scene) => selected.has(scene.key))
    .map((scene) => ({ ...scene, lines: scene.lines.filter((line) => lineMatches(line, query, traveler)) }))
    .filter((scene) => scene.lines.length > 0)
}
