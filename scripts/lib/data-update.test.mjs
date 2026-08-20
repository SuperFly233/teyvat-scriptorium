import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { mapLimit, writeStableSnapshot } from './data-update.mjs'

const directories = []
afterEach(async () => Promise.all(directories.splice(0).map((path) => rm(path, { recursive:true, force:true }))))

describe('data update primitives', () => {
  it('preserves generatedAt when semantic content is unchanged', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'teyvat-data-'))
    directories.push(directory)
    const path = join(directory, 'snapshot.json')
    await writeStableSnapshot(path, { generatedAt:'2026-01-01T00:00:00.000Z', items:[1] })
    const second = await writeStableSnapshot(path, { generatedAt:'2026-02-01T00:00:00.000Z', items:[1] })
    expect(second.semanticChanged).toBe(false)
    expect(JSON.parse(await readFile(path, 'utf8')).generatedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('updates generatedAt when content changes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'teyvat-data-'))
    directories.push(directory)
    const path = join(directory, 'snapshot.json')
    await writeStableSnapshot(path, { generatedAt:'2026-01-01T00:00:00.000Z', items:[1] })
    const second = await writeStableSnapshot(path, { generatedAt:'2026-02-01T00:00:00.000Z', items:[1, 2] })
    expect(second.semanticChanged).toBe(true)
    expect(JSON.parse(await readFile(path, 'utf8')).generatedAt).toBe('2026-02-01T00:00:00.000Z')
  })

  it('limits concurrency while preserving result order', async () => {
    let active = 0
    let maximum = 0
    const output = await mapLimit([1, 2, 3, 4], 2, async (value) => {
      active += 1
      maximum = Math.max(maximum, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return value * 2
    })
    expect(output).toEqual([2, 4, 6, 8])
    expect(maximum).toBe(2)
  })
})
