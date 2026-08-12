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
  const html=(await response.text()).replace(/\\"/g,'"').replace(/\\\//g,'/'); const rows=new Map(); const pattern=/<tr><td><a href="\/ch_(\d+)\/\?lang=[^"]+">[\s\S]*?<\/td><td><a[^>]+>([\s\S]*?)<\/a><\/td><td><a[^>]+>([\s\S]*?)<\/a><\/td><td>([\s\S]*?)<\/td>/g
  for (const match of html.matchAll(pattern)) rows.set(Number(match[1]),{title:decode(match[2]),chapter:decode(match[3]),character:decode(match[4])})
  return rows
}

const [zh,en]=await Promise.all([index('CHS'),index('EN')])
const nationFor=(name='')=>({Barbara:'mondstadt',Noelle:'mondstadt',Bennett:'mondstadt',Diona:'mondstadt',Chongyun:'liyue',Ningguang:'liyue',Beidou:'liyue',YunJin:'liyue',Gorou:'inazuma',Thoma:'inazuma',Sayu:'inazuma',KukiShinobu:'inazuma',ShikanoinHeizou:'inazuma',Faruzan:'sumeru',Layla:'sumeru',Kaveh:'sumeru',Kaeya:'mondstadt',Lynette:'fontaine'})[name.replace(/[^A-Za-z]/g,'')]||'unknown'
const items=[...new Set([...zh.keys(),...en.keys()])].map((id)=>{const z=zh.get(id)||en.get(id);const e=en.get(id)||z;return {id,type:'hq',title:{zh:z.title,en:e.title},chapter:{zh:z.chapter,en:e.chapter},imageTitle:{zh:z.character,en:e.character},route:'',chapterCount:0,icon:null,nation:nationFor(e.character),nationSource:'title-inference',version:null,versionSource:'unknown',versionGroup:'unknown',wikiPage:null,hidden:false,unreleased:false,languages:{zh:Boolean(zh.get(id)),en:Boolean(en.get(id))},sourceUrl:`https://gensh.honeyhunterworld.com/ch_${id}/?lang=CHS`}})
await mkdir(resolve('public/data'),{recursive:true});await writeFile(resolve('public/data/hangouts.json'),`${JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),source:'Honey Hunter World',items})}\n`,'utf8')
console.log(`Saved ${items.length} Hangout Event chapters.`)
