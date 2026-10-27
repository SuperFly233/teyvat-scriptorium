import type { CatalogItem, ChapterData, Quest } from '../types'

export type CopySource = { chapterTitle: string; questTitle: string; chapterNumber: string; version: string; region: string; taskType: string }
const TYPES: Record<string,string> = {aq:'魔神任务',wq:'世界任务',lq:'传说任务',hq:'邀约事件',eq:'活动任务',iq:'每日委托'};
const NATIONS: Record<string,string> = {mondstadt:'蒙德',liyue:'璃月',inazuma:'稻妻',sumeru:'须弥',fontaine:'枫丹',natlan:'纳塔',nodkrai:'挪德卡莱',snezhnaya:'至冬',traveler:'旅行者篇'};
export function buildCopySource(data: ChapterData, quest: Quest, item?: CatalogItem): CopySource {
  return {chapterTitle:data.chapter.title.zh,questTitle:quest.title.zh,chapterNumber:data.chapter.number.zh,
    version:item?.version || '',region:NATIONS[item?.nation || ''] || data.chapter.region.zh || '',taskType:TYPES[item?.type || ''] || ''};
}
export function formatCopySource(source: CopySource | undefined, mode:'full'|'short'|'custom', custom = ''): string {
  if (mode === 'custom') return custom.trim();
  if (!source) return '';
  const clean = (value: string) => value.trim().replace(/\s+/g,' ');
  const quote = (value:string) => /^「.*」$/.test(value) ? value : `「${value}」`;
  const chapter=clean(source.chapterTitle),quest=clean(source.questTitle);
  const caption=[chapter,quest && quest!==chapter ? quest : ''].filter(Boolean).map(quote).join('—');
  if (!caption) return '';
  const number=clean(source.chapterNumber);
  const structural=/第.+[章幕]|序章|序奏|间章|終章|终章/.test(number) ? number : '';
  if (mode==='short') return [structural.match(/第[一二三四五六七八九十百\d]+幕|序章|序奏|间章|終章|终章/)?.[0] || structural,caption].filter(Boolean).join(' ');
  return [`《原神》${clean(source.version)}${clean(source.region)}`,clean(source.taskType),structural,caption].filter(Boolean).join(' ');
}
export function validCopyDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year,month,day]=value.split('-').map(Number);
  return year>=1000 && year<=9999 && month>=1 && month<=12 && day>=1 && day<=new Date(Date.UTC(year,month,0)).getUTCDate();
}
export function localCopyDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function dottedCopyDate(iso: string): string {
  return validCopyDate(iso) ? iso.split('-').map(Number).join('.') : '';
}
