import type { DialogueLine } from '../types'

export function enrichBranches(lines:DialogueLine[]):DialogueLine[] {
  const nodes=new Map(lines.filter((line)=>!line.nodeId.endsWith('-player')).map((line)=>[line.nodeId,line]))
  const marks=new Map<string,Pick<DialogueLine,'branchGroupId'|'branchIndex'|'branchTotal'|'branchRole'>>()
  for(const selector of lines.filter((line)=>line.nodeId.endsWith('-player')&&line.sourceType==='MultiDialog')) {
    const variants=lines.filter((line)=>line.nodeId===selector.nodeId).sort((a,b)=>a.variant-b.variant)
    const targets=variants.map((line)=>line.nextNodeId||'').filter(Boolean)
    if(targets.length<2)continue
    const paths=targets.map((target)=>{const path:string[]=[];const seen=new Set<string>();let id=target;while(id&&nodes.has(id)&&!seen.has(id)&&path.length<80){seen.add(id);path.push(id);id=nodes.get(id)?.nextNodeId||''}return path})
    const merge=paths[0].find((id)=>paths.every((path)=>path.includes(id)))
    paths.forEach((path,index)=>path.slice(0,merge?path.indexOf(merge):1).forEach((id,step)=>marks.set(id,{branchGroupId:selector.nodeId,branchIndex:index,branchTotal:targets.length,branchRole:step===0?'option':'response'})))
  }
  return lines.filter((line)=>!line.nodeId.endsWith('-player')).map((line)=>marks.has(line.nodeId)?{...line,...marks.get(line.nodeId),kind:marks.get(line.nodeId)?.branchRole==='option'?'choice':line.kind}:line)
}
