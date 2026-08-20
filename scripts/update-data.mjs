import { spawn } from 'node:child_process'
import { appendFile, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const tasks = [
  { name: '常规任务目录', script: 'scripts/fetch-catalog.mjs', files: ['public/data/catalog.json', 'public/data/wiki-metadata.json'], snapshot: 'public/data/catalog.json' },
  { name: '邀约事件目录', script: 'scripts/fetch-hangouts.mjs', files: ['public/data/hangouts.json'], snapshot: 'public/data/hangouts.json' },
  { name: '默认剧情正文', script: 'scripts/fetch-quest.mjs', args: ['1700'], files: ['public/data/quest-1700.json', 'public/data/manifest.json'], snapshot: 'public/data/quest-1700.json' },
]

async function backup(paths) {
  return new Map(await Promise.all(paths.map(async (path) => {
    try { return [path, await readFile(resolve(path))] } catch { return [path, null] }
  })))
}

async function restore(files) {
  for (const [path, content] of files) {
    if (content === null) await rm(resolve(path), { force: true })
    else await writeFile(resolve(path), content)
  }
}

function run(script, args = []) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, ['--use-env-proxy', script, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('exit', (code) => {
      if (code === 0) {
        if (stdout) process.stdout.write(stdout)
        if (stderr) process.stderr.write(stderr)
      }
      const reason = [...stderr.matchAll(/^Error:\s+(.+)$/gm)].at(-1)?.[1]
        || stderr.match(/^\[TypeError:\s+([^\]]+)\]/m)?.[1]
        || stderr.split(/\r?\n/).find((line) => line.trim())?.trim()
        || `进程退出码 ${code ?? 1}`
      resolveRun({ code: code ?? 1, reason })
    })
    child.on('error', (error) => resolveRun({ code: 1, reason: error.message }))
  })
}

async function snapshotAgeDays(path) {
  try {
    const snapshot = JSON.parse(await readFile(resolve(path), 'utf8'))
    const timestamp = Date.parse(snapshot.generatedAt)
    return Number.isFinite(timestamp) ? (Date.now() - timestamp) / 86_400_000 : Number.POSITIVE_INFINITY
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

const results = []
for (const task of tasks) {
  const before = await backup(task.files)
  const outcome = await run(task.script, task.args)
  if (outcome.code === 0) {
    results.push({ name: task.name, status: '已检查', detail: '上游读取与快照校验成功' })
    continue
  }
  await restore(before)
  const age = await snapshotAgeDays(task.snapshot)
  const reusable = age <= 14
  results.push({
    name: task.name,
    status: reusable ? '沿用快照' : '失败',
    detail: reusable
      ? `上游暂不可用；保留 ${age.toFixed(1)} 天前的有效快照（${outcome.reason}）`
      : `没有 14 天内的有效快照可回退（${outcome.reason}）`,
    failed: !reusable,
  })
}

const summary = [
  '## 剧情资料自动更新',
  '',
  '| 数据集 | 状态 | 说明 |',
  '| --- | --- | --- |',
  ...results.map((result) => `| ${result.name} | ${result.status} | ${result.detail} |`),
  '',
  '> 只有通过完整性校验的快照才会进入提交；无语义变化时不会刷新时间戳或触发空部署。',
  '',
].join('\n')
console.log(`\n${summary}`)
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary, 'utf8')
if (results.some((result) => result.failed)) process.exitCode = 1
