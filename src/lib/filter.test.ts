import { describe,expect,it } from 'vitest'
import type { DialogueLine,Scene } from '../types'
import { filterScenes,lineMatches,lineSearchText } from './filter'

const line:DialogueLine={key:'1',nodeId:'1',variant:0,kind:'dialogue',speaker:{zh:'派蒙',en:'Paimon'},text:{zh:'你好，旅行者！',en:'Hello, Traveler!'},nextNodeId:'finish'}
const scene:Scene={key:'s',id:1,hidden:false,title:{zh:'测试',en:'Test'},description:{zh:'',en:''},lines:[line]}

describe('dialogue search index',()=>{
  it('matches multilingual speaker and dialogue text',()=>{expect(lineMatches(line,'派蒙','aether')).toBe(true);expect(lineMatches(line,'traveler','aether')).toBe(true)})
  it('reuses the normalized line index for the same traveler',()=>{expect(lineSearchText(line,'aether')).toBe(lineSearchText(line,'aether'))})
  it('filters using one normalized query without altering the source scene',()=>{expect(filterScenes([scene],new Set(['s']),'hello','aether')[0].lines).toHaveLength(1);expect(filterScenes([scene],new Set(['s']),'钟离','aether')).toHaveLength(0);expect(scene.lines).toHaveLength(1)})
})
