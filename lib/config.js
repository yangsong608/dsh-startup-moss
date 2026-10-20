/**
 * dsh-startup-moss — 配置与口令
 * ---------------------------------------------------------------------------
 * 单一配置文件：<DSH_HOME>/dsh-moss.json
 *
 *   {
 *     enabled: true,
 *     splash: { enabled, mode: session|always, speed },
 *     theme:  { mode: off|550w|moss },
 *     auth:   { enabled, salt, hash, perSession }
 *   }
 *
 * 口令只以 scrypt(salt) 摘要落盘；浏览器半永远拿不到 salt / hash，
 * 只能调 /auth 做「验证」，不能离线爆破。
 *
 * 注意（诚实声明）：这是**界面门禁**，不是身份认证。DSH 的 HTTP API 仍然
 * 可达，能打开开发者工具的人可以绕过。它的作用是把「顺手就能看」变成
 * 「得先过一道门」，适合个人机器上的隐私遮挡，不要当成安全边界。
 */

import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const SPLASH_MODES = ['session', 'always']
export const THEME_MODES = ['off', '550w', 'moss']

export const DEFAULT_PASSWORD = 'moss'
export const DEFAULT_DELAY_SECONDS = 5

const DEFAULTS = {
  enabled: true,
  splash: { enabled: true, mode: 'session', speed: 1 },
  theme: { mode: '550w' },
  /* 首次落盘时用默认口令 moss 播种（只播种一次；之后改口令走 API） */
  auth: { enabled: true, salt: '', hash: '', perSession: true, delay: DEFAULT_DELAY_SECONDS }
}

/* 播种只在第一次尝试；失败后不再重试，避免每个请求都算一次 scrypt */
let seedFailed = false

export function homeDir() {
  const fromEnv = process.env.DSH_HOME
  return fromEnv && fromEnv.length > 0 ? fromEnv : join(homedir(), '.dsh')
}

export function configPath() {
  return join(homeDir(), 'dsh-moss.json')
}

function clamp(n, a, b) { return Math.min(b, Math.max(a, n)) }
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback)

/** 数字兜底：Number('') / Number(undefined) 都是 NaN，不能被 || 吞成默认值以外的数。 */
function numberOr(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** 兼容 0.1.x 的扁平配置（{enabled, mode, speed}），读的时候一并迁移。 */
function normalize(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const splashIn = src.splash && typeof src.splash === 'object' ? src.splash : src
  const authIn = src.auth && typeof src.auth === 'object' ? src.auth : {}
  return {
    enabled: src.enabled !== false,
    splash: {
      enabled: splashIn.enabled !== false,
      mode: oneOf(splashIn.mode, SPLASH_MODES, 'session'),
      speed: clamp(Number(splashIn.speed) || 1, 0.35, 3)
    },
    theme: {
      mode: oneOf(src.theme && src.theme.mode, THEME_MODES, '550w')
    },
    auth: {
      enabled: authIn.enabled === true,
      salt: typeof authIn.salt === 'string' ? authIn.salt : '',
      hash: typeof authIn.hash === 'string' ? authIn.hash : '',
      perSession: authIn.perSession !== false,
      delay: numberOr(authIn.delay, DEFAULT_DELAY_SECONDS, 0, 120)
    }
  }
}

export function readConfig() {
  const file = configPath()
  try {
    if (existsSync(file)) return normalize(JSON.parse(readFileSync(file, 'utf8')))
  } catch (err) {
    return normalize(DEFAULTS)
  }
  /* 第一次运行：把默认口令 moss 摘要写进配置文件，以后只认用户改过的那个。
     写失败（只读 home / 权限不对）只试一次，别让每个请求都跑一遍 scrypt。 */
  if (seedFailed) return normalize(DEFAULTS)
  try {
    const seeded = normalize(DEFAULTS)
    const digest = hashPassword(DEFAULT_PASSWORD)
    seeded.auth.salt = digest.salt
    seeded.auth.hash = digest.hash
    return writeConfig(seeded)
  } catch (err) {
    seedFailed = true
    return normalize(DEFAULTS)
  }
}

export function writeConfig(cfg) {
  const next = normalize(cfg)
  const file = configPath()
  try { mkdirSync(dirname(file), { recursive: true }) } catch (err) { /* noop */ }
  const tmp = file + '.tmp-' + process.pid
  writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 })
  renameSync(tmp, file)
  return next
}

/** 浏览器半能看到的全部内容：没有 salt / hash。 */
export function publicConfig(cfg) {
  const c = cfg || readConfig()
  return {
    enabled: c.enabled,
    splash: { ...c.splash },
    theme: { ...c.theme },
    auth: {
      enabled: c.auth.enabled,
      configured: c.auth.hash.length > 0 && c.auth.salt.length > 0,
      perSession: c.auth.perSession,
      delay: c.auth.delay
    }
  }
}

/** 口令摘要：scrypt，32 字节，随机 16 字节盐。 */
export function hashPassword(password, salt) {
  const s = salt || randomBytes(16).toString('hex')
  const hash = scryptSync(String(password), s, 32).toString('hex')
  return { salt: s, hash }
}

export function verifyPassword(password, salt, hash) {
  try {
    if (!salt || !hash) return false
    const want = Buffer.from(hash, 'hex')
    if (want.length === 0) return false
    const got = scryptSync(String(password), salt, want.length)
    return got.length === want.length && timingSafeEqual(got, want)
  } catch (err) {
    return false
  }
}

/** 同一个进程内的尝试节流：每 IP 10 次 / 5 分钟，超了退避。 */
const attempts = new Map()
const WINDOW_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 10

export function noteAttempt(ip) {
  const now = Date.now()
  const list = (attempts.get(ip) || []).filter(t => now - t < WINDOW_MS)
  list.push(now)
  attempts.set(ip, list)
  if (attempts.size > 512) {
    for (const [key, value] of attempts) {
      if (value.length === 0 || now - value[value.length - 1] > WINDOW_MS) attempts.delete(key)
    }
  }
  return list.length
}

export function attemptsLeft(ip) {
  const now = Date.now()
  const list = (attempts.get(ip) || []).filter(t => now - t < WINDOW_MS)
  return Math.max(0, MAX_ATTEMPTS - list.length)
}

export function clearAttempts(ip) {
  attempts.delete(ip)
}
