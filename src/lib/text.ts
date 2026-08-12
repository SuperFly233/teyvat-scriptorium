import type { Traveler } from '../types'

export function formatGameText(input: string, traveler: Traveler): string {
  if (!input) return ''
  const choice = traveler === 'aether' ? 1 : 2
  let text = input
    .replace(/^#/, '')
    .replace(/<color[^>]*>/gi, '')
    .replace(/<\/color>/gi, '')
    .replace(/\\n/g, '\n')
    .replace(/\{M#([^{}]*)\}\{F#([^{}]*)\}/g, (_, male, female) => choice === 1 ? male : female)
    .replace(/\{NICKNAME\}/gi, traveler === 'aether' ? '旅行者' : '旅行者')
    .replace(/\{PLAYERAVATAR#SEXPRO\[([^|\]]*)\|([^\]]*)\]\}/gi, (_, male, female) => choice === 1 ? male : female)
    .replace(/\{MATEAVATAR#SEXPRO\[([^|\]]*)\|([^\]]*)\]\}/gi, (_, male, female) => choice === 1 ? male : female)
  return text.replace(/\{[^{}]+\}/g, '').trim()
}

export function normalizeSearch(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, '')
}
