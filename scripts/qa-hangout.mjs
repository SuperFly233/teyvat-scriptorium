globalThis.caches={default:{match:async()=>null,put:async()=>{}}}
const {onRequestGet}=await import('../functions/api/quest/[id].js')
const response=await onRequestGet({params:{id:'101401'},request:new Request('http://local/api/quest/101401?langs=CHS,EN'),waitUntil:()=>{}})
const payload=await response.json()
const summary={status:response.status,id:payload.id,title:payload.title,quests:payload.quests?.length,lines:payload.stats?.lines,languages:payload.availableLanguages}
console.log(JSON.stringify(summary))
if(response.status!==200||!payload.quests?.length||!payload.stats?.lines)process.exitCode=1
