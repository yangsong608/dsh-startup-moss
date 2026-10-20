/**
 * dsh-startup-moss — 启动时的本机 / 宿主体检
 * ---------------------------------------------------------------------------
 * 启动动画里那群「读数」不再是装饰：版本、插件、会话、定时任务、
 * 磁盘、内存、CPU、网络全部现场采集。
 *
 * 两条纪律：
 *   1. 读不到就留 null，动画里显示「—」，绝不因为某个来源缺文件就抛；
 *   2. 结果带 30 秒缓存 —— tapIndex 每次页面加载都会要一份，别让磁盘扫描
 *      变成刷新的成本。
 */

import { existsSync, readFileSync, readdirSync, statSync, statfsSync } from 'node:fs'
import { cpus, freemem, totalmem, loadavg, networkInterfaces, hostname, platform, arch } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const CACHE_MS = 30_000
let cache = { at: 0, value: null }

function safe(fn, fallback) {
  try { return fn() } catch (err) { return fallback }
}

function round(n, digits = 1) {
  const p = Math.pow(10, digits)
  return Math.round(n * p) / p
}

function humanBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1 }
  return round(v, 1) + units[i]
}

function ago(ts) {
  if (!Number.isFinite(ts) || ts <= 0) return null
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return s + 's'
  if (s < 3600) return Math.round(s / 60) + 'm'
  if (s < 86400) return Math.round(s / 3600) + 'h'
  return Math.round(s / 86400) + 'd'
}

/* ── 磁盘 ──────────────────────────────────────────────────────────── */

function diskStats(path) {
  return safe(() => {
    const st = statfsSync(path)
    const total = Number(st.bsize) * Number(st.blocks)
    const free = Number(st.bsize) * Number(st.bavail)
    return {
      path,
      total,
      free,
      totalText: humanBytes(total),
      freeText: humanBytes(free),
      usedPct: total > 0 ? round((1 - free / total) * 100, 0) : null
    }
  }, null)
}

/* ── 会话：最近 5 个（只解压首帧拿 header，不解全部） ───────────────── */

function readSessionHeader(file) {
  return safe(() => {
    const size = statSync(file).size
    /* 大文件整包解压不划算；zstdDecompressSync 只还原第一帧，刚好是 header */
    if (size > 4 * 1024 * 1024) return null
    const text = zstdDecompressSync(readFileSync(file)).toString('utf8')
    const first = text.split('\n', 1)[0]
    const header = JSON.parse(first)
    return {
      id: header.id || null,
      cwd: header.cwd || null,
      createdAt: Number(header.createdAt) || null
    }
  }, null)
}

function scanSessions(homeDir) {
  const root = join(homeDir, 'sessions')
  if (!existsSync(root)) return { total: 0, recent: [] }

  const found = []
  for (const project of safe(() => readdirSync(root, { withFileTypes: true }), [])) {
    if (!project.isDirectory()) continue
    const projectDir = join(root, project.name)
    for (const entry of safe(() => readdirSync(projectDir, { withFileTypes: true }), [])) {
      if (!entry.isDirectory() || !entry.name.startsWith('session-')) continue
      const file = join(projectDir, entry.name, 'session.v4.jsonl.zstd')
      const stat = safe(() => statSync(file), null)
      if (!stat) continue
      found.push({ id: entry.name, project: project.name, file, mtime: stat.mtimeMs, size: stat.size })
    }
  }

  found.sort((a, b) => b.mtime - a.mtime)
  const recent = found.slice(0, 5).map((item) => {
    const header = readSessionHeader(item.file)
    const cwd = header && header.cwd ? header.cwd : null
    return {
      id: item.id.replace(/^session-/, '').slice(0, 8),
      workspace: cwd ? cwd.split('/').filter(Boolean).slice(-1)[0] : projectLabel(item.project),
      startedAt: header ? header.createdAt : null,
      ago: ago(item.mtime)
    }
  })

  return { total: found.length, recent }
}

function projectLabel(encoded) {
  const raw = String(encoded || '').replace(/^--|--$/g, '')
  const parts = raw.split('-').filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : 'workspace'
}

/* ── 定时 / 自动化任务 ─────────────────────────────────────────────── */

function cronStats(homeDir) {
  const file = join(homeDir, 'data', 'cron', 'tasks.json')
  if (!existsSync(file)) return { total: 0, enabled: 0, nextAt: null, names: [] }
  return safe(() => {
    const data = JSON.parse(readFileSync(file, 'utf8'))
    const tasks = Array.isArray(data.tasks) ? data.tasks : []
    const enabled = tasks.filter(t => t && t.enabled !== false)
    const withNext = enabled
      .map(t => ({ name: String(t.name || t.id || 'task'), at: t.nextRunAt || t.runAt || null }))
      .filter(x => x.at)
      .sort((a, b) => String(a.at).localeCompare(String(b.at)))
    return {
      total: tasks.length,
      enabled: enabled.length,
      nextAt: withNext.length > 0 ? withNext[0].at : null,
      names: tasks.slice(0, 3).map(t => String(t.name || t.id || 'task'))
    }
  }, { total: 0, enabled: 0, nextAt: null, names: [] })
}

/* ── 插件 ──────────────────────────────────────────────────────────── */

function pluginStats(profileDir) {
  const pkgFile = join(profileDir, 'package.json')
  if (!existsSync(pkgFile)) return { total: 0, names: [] }
  return safe(() => {
    const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
    const deps = pkg.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {}
    const names = Object.keys(deps)
    const installed = []
    for (const name of names) {
      const version = safe(() => JSON.parse(readFileSync(join(profileDir, 'node_modules', name, 'package.json'), 'utf8')).version, null)
      installed.push({ name, version: version || String(deps[name]).replace(/^[\^~]/, '') })
    }
    return { total: names.length, names: installed.slice(0, 6) }
  }, { total: 0, names: [] })
}

/* ── 系统 ──────────────────────────────────────────────────────────── */

function systemStats(homeDir) {
  const cpuList = safe(() => cpus(), [])
  const load = safe(() => loadavg(), [0, 0, 0])
  const memTotal = safe(() => totalmem(), 0)
  const memFree = safe(() => freemem(), 0)

  let net = null
  safe(() => {
    const ifaces = networkInterfaces()
    for (const [name, list] of Object.entries(ifaces)) {
      for (const addr of list || []) {
        if (addr.family !== 'IPv4' || addr.internal) continue
        net = { iface: name, ip: addr.address }
        return
      }
    }
  }, null)

  return {
    cpu: cpuList.length > 0
      ? {
        model: String(cpuList[0].model || '').replace(/\(R\)|\(TM\)/g, '').replace(/\s+/g, ' ').trim().slice(0, 34),
        cores: cpuList.length,
        load1: Number(load[0]) || 0
      }
      : null,
    mem: memTotal > 0
      ? {
        total: memTotal,
        free: memFree,
        usedText: humanBytes(memTotal - memFree),
        totalText: humanBytes(memTotal),
        usedPct: round(((memTotal - memFree) / memTotal) * 100, 0)
      }
      : null,
    disk: diskStats(homeDir),
    net,
    host: safe(() => hostname(), null),
    platform: safe(() => platform() + ' ' + arch(), null)
  }
}

/* ── 汇总 ──────────────────────────────────────────────────────────── */

export function collect({ homeDir, profileDir }) {
  const now = Date.now()
  if (cache.value !== null && now - cache.at < CACHE_MS) return cache.value

  const value = {
    at: now,
    dsh: process.env.DSH_CLIENT_VERSION || null,
    profile: safe(() => JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')).name, null),
    plugins: pluginStats(profileDir),
    sessions: safe(() => scanSessions(homeDir), { total: 0, recent: [] }),
    cron: safe(() => cronStats(homeDir), { total: 0, enabled: 0, nextAt: null, names: [] }),
    system: systemStats(homeDir)
  }

  cache = { at: now, value }
  return value
}
