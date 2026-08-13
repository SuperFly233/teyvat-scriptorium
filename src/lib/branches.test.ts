import { describe,expect,it } from 'vitest'
import { enrichBranches } from './branches'
import type { DialogueLine } from '../types'

const line=(nodeId:string,nextNodeId:string,text:string,extra:Partial<DialogueLine>={}):DialogueLine=>({key:nodeId,nodeId,nextNodeId,variant:0,kind:'dialogue',speaker:{zh:'',en:''},text:{zh:text,en:text},sourceType:'SingleDialog',...extra})

describe('enrichBranches',()=>{
  it('does not treat consecutive role-less monologue as options',()=>{const result=enrichBranches([line('1','2','（独白一）'),line('2','3','（独白二）')]);expect(result.every((item)=>!item.branchGroupId&&item.kind==='dialogue')).toBe(true)})
  it('keeps distinct responses inside each branch until the merge node',()=>{const selector='10-player';const result=enrichBranches([line('10','11','问句'),line('11','12','选项一'),line('12','16','回应一'),line('13','14','选项二'),line('14','16','回应二'),line('16','17','共同后续'),line(selector,'11','选项一',{nodeId:selector,key:'s0',sourceType:'MultiDialog',kind:'choice'}),line(selector,'13','选项二',{nodeId:selector,key:'s1',variant:1,sourceType:'MultiDialog',kind:'choice'})]);expect(result.find((item)=>item.nodeId==='12')?.branchRole).toBe('response');expect(result.find((item)=>item.nodeId==='14')?.branchIndex).toBe(1);expect(result.find((item)=>item.nodeId==='16')?.branchGroupId).toBeUndefined();expect(result.some((item)=>item.nodeId.endsWith('-player'))).toBe(false)})
})
