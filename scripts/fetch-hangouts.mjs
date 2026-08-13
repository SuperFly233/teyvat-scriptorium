import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const decode = (value='') => value
  .replace(/<[^>]+>/g,'')
  .replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code)))
  .replace(/&#x([\da-f]+);/gi,(_,code)=>String.fromCodePoint(Number.parseInt(code,16)))
  .replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&quot;/g,'"')
  .trim()
async function index(lang) {
  const response=await fetch(`https://gensh.honeyhunterworld.com/chap_cat_hq/?lang=${lang}`,{headers:{'user-agent':'Teyvat-Scriptorium/0.5 hangout index'}})
  if (!response.ok) throw new Error(`Honey ${lang}: ${response.status}`)
  const html=await response.text();const rows=new Map();const marker='sortable_data.push(';const start=html.indexOf(marker)+marker.length;const end=html.indexOf(');',start)
  if(start>=marker.length&&end>start){for(const row of JSON.parse(html.slice(start,end))){const id=Number(row[0].match(/ch_(\d+)/)?.[1]);if(id)rows.set(id,{title:decode(row[1]),chapter:decode(row[2]),character:decode(row[3])})}}
  return rows
}

const [zh,en]=await Promise.all([index('CHS'),index('EN')])
const versionFor={101401:'1.4',103401:'1.4',103601:'1.4',103201:'1.4',103402:'1.5',103901:'1.5',105001:'2.2',105301:'2.2',102401:'2.3',105501:'2.3',106401:'2.4',102701:'2.4',106501:'2.7',105901:'2.8',107601:'3.5',107401:'3.6',108101:'3.7',101501:'3.8',108301:'4.5'}
const nationFor=(name='')=>({Barbara:'mondstadt',Noelle:'mondstadt',Bennett:'mondstadt',Diona:'mondstadt',Chongyun:'liyue',Ningguang:'liyue',Beidou:'liyue',YunJin:'liyue',Gorou:'inazuma',Thoma:'inazuma',Sayu:'inazuma',KukiShinobu:'inazuma',ShikanoinHeizou:'inazuma',Faruzan:'sumeru',Layla:'sumeru',Kaveh:'sumeru',Kaeya:'mondstadt',Lynette:'fontaine'})[name.replace(/[^A-Za-z]/g,'')]||'unknown'
const items=await Promise.all([...new Set([...zh.keys(),...en.keys()])].map(async(id)=>{const z=zh.get(id)||en.get(id);const e=en.get(id)||z;const detail=await fetch(`https://gi.yatta.moe/api/v2/CHS/quest/${id}`,{headers:{'user-agent':'Teyvat-Scriptorium/0.7 hangout metadata'}}).then((response)=>response.ok?response.json():null).catch(()=>null);const version=versionFor[id]||null;return {id,type:'hq',title:{zh:z.title,en:e.title},chapter:{zh:z.chapter,en:e.chapter},imageTitle:{zh:z.character,en:e.character},route:'',chapterCount:detail?.data?.info?.chapterCount||Object.keys(detail?.data?.storyList||{}).length||0,icon:detail?.data?.info?.chapterIcon||null,nation:nationFor(e.character),nationSource:'title-inference',version,versionSource:version?'curated':'unknown',versionGroup:version?.split('.')[0]||'unknown',wikiPage:null,hidden:false,unreleased:false,languages:{zh:Boolean(zh.get(id)),en:Boolean(en.get(id))},sourceUrl:`https://gensh.honeyhunterworld.com/ch_${id}/?lang=CHS`}}))
await mkdir(resolve('public/data'),{recursive:true});await writeFile(resolve('public/data/hangouts.json'),`${JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),source:'Honey Hunter World',items})}\n`,'utf8')
console.log(`Saved ${items.length} Hangout Event chapters.`)
