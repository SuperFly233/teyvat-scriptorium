import { readFile, writeFile } from 'node:fs/promises'

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export async function fetchJson(url, { label = url, attempts = 3, allowNotFound = false } = {}) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'Teyvat-Scriptorium/0.8 (+https://github.com/SuperFly233/teyvat-scriptorium)',
        },
        signal: AbortSignal.timeout(30_000),
      })
      if (allowNotFound && response.status === 404) return null
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    } catch (error) {
      lastError = error
      if (attempt < attempts) await wait(attempt * 750)
    }
  }
  throw new Error(`${label}: ${lastError?.message || lastError}`)
}

export async function mapLimit(values, limit, mapper) {
  const results = new Array(values.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(values[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

const withoutTimestamp = (value, timestampKey) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const copy = { ...value }
  delete copy[timestampKey]
  return copy
}

export async function writeStableSnapshot(path, value, { timestampKey = 'generatedAt' } = {}) {
  let previous = null
  let previousText = ''
  try {
    previousText = await readFile(path, 'utf8')
    previous = JSON.parse(previousText)
  } catch {
    // First snapshot.
  }
  const unchanged = previous && JSON.stringify(withoutTimestamp(previous, timestampKey)) === JSON.stringify(withoutTimestamp(value, timestampKey))
  const next = {
    ...value,
    [timestampKey]: unchanged && previous?.[timestampKey]
      ? previous[timestampKey]
      : value[timestampKey] || new Date().toISOString(),
  }
  const nextText = `${JSON.stringify(next)}\n`
  if (nextText !== previousText) await writeFile(path, nextText, 'utf8')
  return { changed: nextText !== previousText, semanticChanged: !unchanged, value: next }
}
