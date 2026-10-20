/**
 * dsh-startup-moss — Host 半侧
 * ---------------------------------------------------------------------------
 * 四件事：
 *   1. 发静态资源：splash.{js,css} / gate.{js,css} / theme.json；
 *   2. 用 webServer.tapIndex 把「主题关键样式 + 黑幕 + 口令门禁 + 配置」注入
 *      index.html —— 应用挂载之前就已经就位，没有白闪；
 *   3. 配置 API：读/改 <DSH_HOME>/dsh-moss.json（口令只落 scrypt 摘要）；
 *   4. 口令核验 API：/auth 带每 IP 节流，浏览器半拿不到 salt/hash。
 *
 * 载体差异：Electron 若改用 file:// + IPC 就没有 webServer —— 那种情况下本插件
 * 不抛异常，交给浏览器半侧自举（client/client.js）。
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  readConfig, writeConfig, publicConfig, homeDir,
  hashPassword, verifyPassword,
  noteAttempt, attemptsLeft, clearAttempts
} from './config.js'
import { themeCss, themePayload } from './theme.js'
import { collect as collectHostStats } from './hostinfo.js'

const NAME = 'dsh-startup-moss'
const BASE = '/dsh-startup-moss'
const PLUGIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
const MAX_BODY = 16 * 1024

let cache = null

function readAsset(file) {
  if (cache === null) cache = {}
  if (cache[file] === undefined) {
    cache[file] = readFileSync(join(PLUGIN_DIR, 'lib', file), 'utf8')
  }
  return cache[file]
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function send(res, type, body) {
  const buf = Buffer.from(body, 'utf8')
  res.writeHead(200, {
    'Content-Type': type + '; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': String(buf.length)
  })
  res.end(buf)
}

function sendJson(res, code, payload) {
  const buf = Buffer.from(JSON.stringify(payload), 'utf8')
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': String(buf.length)
  })
  res.end(buf)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('body too large'))
        try { req.destroy() } catch (err) { /* noop */ }
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve(text.length > 0 ? JSON.parse(text) : {})
      } catch (err) {
        reject(new Error('invalid json'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * 写操作的同源校验：浏览器页面带 Origin 时必须与 Host 一致。
 * 本机进程直连（没有 Origin 头）照常放行 —— 那是运维/脚本的正规用法。
 */
function sameOrigin(req) {
  try {
    const origin = req.headers && req.headers.origin
    if (!origin) return true
    const host = req.headers.host || ''
    const url = new URL(origin)
    return url.host === host
  } catch (err) {
    return false
  }
}

function methodNotAllowed(res, allow) {
  const buf = Buffer.from(JSON.stringify({ ok: false, error: 'method not allowed' }), 'utf8')
  res.writeHead(405, {
    'Content-Type': 'application/json; charset=utf-8',
    Allow: allow,
    'Cache-Control': 'no-store',
    'Content-Length': String(buf.length)
  })
  res.end(buf)
}

function clientIp(req) {
  try {
    return String((req.socket && req.socket.remoteAddress) || req.headers['x-forwarded-for'] || 'local')
  } catch (err) {
    return 'local'
  }
}

/** 取不到就留空，动画里回落默认值 —— 采集绝不允许把宿主带崩。 */
function collectFacts(ctx) {
  const facts = {}
  const get = (key) => {
    try { return typeof ctx.get === 'function' ? ctx.get(key) : undefined } catch (err) { return undefined }
  }
  try {
    const pc = get('profileContext') || {}
    if (pc.name) facts.profile = String(pc.name)
    if (Array.isArray(pc.startedBundles)) facts.plugins = pc.startedBundles.length
  } catch (err) { /* noop */ }
  try {
    const selection = get('agentDefaultModel')?.currentSelection?.()
    if (selection && selection.model) facts.model = String(selection.model)
  } catch (err) { /* noop */ }
  try {
    const version = process.env.DSH_CLIENT_VERSION
    if (version) facts.dshVersion = String(version)
  } catch (err) { /* noop */ }
  return facts
}


/** profile 目录解析：优先按 profileContext 的名字，其次 DSH_PROFILE，最后回退 desktop。 */
function resolveProfileDir(home, name) {
  const tried = []
  for (const candidate of [name, process.env.DSH_PROFILE, 'desktop']) {
    if (!candidate) continue
    const dir = join(home, 'profiles', String(candidate))
    if (tried.includes(dir)) continue
    tried.push(dir)
    if (existsSync(join(dir, 'package.json'))) return dir
  }
  return tried[0] || join(home, 'profiles', 'desktop')
}

/* 首屏关键样式：只保底盖住应用，完整样式由 splash.css / gate.css 承担。 */
const CRITICAL_CSS = [
  '.moss-root{position:fixed;inset:0;z-index:2147483000;background:radial-gradient(ellipse 90% 70% at 50% 38%,#160a07 0%,#0a0504 48%,#030202 100%)}',
  '#dsh-moss-gate{position:fixed;inset:0;z-index:2147483002;background:#050405}',
  'html.moss-lock,html.moss-lock body{overflow:hidden!important;overscroll-behavior:none}'
].join('')

/** 首屏早裁决：该不该放启动动画（同步，早于任何脚本）。 */
const BOOTSTRAP_JS = `(function(){try{
var c=window.__DSH_MOSS__||{},s=c.splash||{};
var root=document.getElementById('dsh-moss-root');
var q=location.search||'';
var forced=/(?:\\?|&)moss=(?:1|on|play)(?:&|$)/.test(q);
var off=!(c.enabled!==false&&s.enabled!==false||forced);
if(!off&&!forced&&s.mode!=='always'&&sessionStorage.getItem('dsh-startup-moss:shown')==='1')off=true;
var hardOff=/(?:\\?|&)moss=(?:0|off)(?:&|$)/.test(q);
if(hardOff){var ts=document.getElementById('dsh-startup-moss-theme');if(ts)ts.textContent='';}
if(off){if(root&&root.parentNode)root.parentNode.removeChild(root);}else{document.documentElement.classList.add('moss-lock');
/* 兜底：脚本 404 / 语法错 / 被拦时 8 秒后无条件放行，绝不锁黑屏 */
setTimeout(function(){try{var r=document.getElementById('dsh-moss-root');if(r&&r.getAttribute('data-live')!=='1'){if(r.parentNode)r.parentNode.removeChild(r);}document.documentElement.classList.remove('moss-lock');}catch(e){}},8000);}
}catch(e){}})()`

const name = NAME
const inject = ['webServer']

/** 环境级总闸：DSH_STARTUP_MOSS=off 时 Host 半侧什么都不做，页面原样返回。 */
function disabledByEnv() {
  return String(process.env.DSH_STARTUP_MOSS || '').toLowerCase() === 'off'
}

/**
 * 路由守卫：任何 handler 抛错都吞在插件内部。
 * 不这么做的话，抛出的异常会变成该请求的 400/断连，严重时连带首屏。
 */
function guardHandler(ctx, path, handler) {
  return async function guarded(req, res) {
    try {
      await handler(req, res)
    } catch (err) {
      try {
        if (!res.headersSent) {
          res.writeHead(500, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
          })
          res.end(JSON.stringify({ ok: false, error: 'dsh-startup-moss handler failed' }))
        } else {
          res.end()
        }
      } catch (e) { /* 连错误响应都发不出去就算了 */ }
      try {
        ctx.logger?.warn?.('[' + NAME + '] 路由 ' + path + ' 失败（已忽略）: ' + String((err && err.message) || err))
      } catch (e) { /* noop */ }
    }
  }
}

/**
 * 装配入口：整段包在 try/catch 里。
 * 本插件是启动链路上的一环，装配失败必须表现为「插件没生效」，而不是「DSH 起不来」。
 */
export function apply(ctx) {
  try {
    applyImpl(ctx)
  } catch (err) {
    try {
      ctx.logger?.warn?.('[' + NAME + '] 装配失败，已整体跳过（不影响 DSH 启动）: ' + String((err && err.message) || err))
    } catch (e) { /* noop */ }
  }
}

function applyImpl(ctx) {
  if (disabledByEnv()) {
    try { ctx.logger?.info?.('[' + NAME + '] DSH_STARTUP_MOSS=off，Host 半侧已跳过') } catch (e) { /* noop */ }
    return
  }
  const disposers = []
  let webServer = null
  try {
    webServer = typeof ctx.get === 'function' ? ctx.get('webServer') : undefined
  } catch (err) { /* noop */ }
  if (!webServer) webServer = ctx.webServer

  const usable = !!webServer
    && typeof webServer.register === 'function'
    && typeof webServer.tapIndex === 'function'

  if (!usable) {
    ctx.logger?.warn?.(
      '[' + NAME + '] 当前 profile 没有可用的 webServer（桌面端可能走 file:// + IPC）' +
      '—— 首屏注入跳过，启动动画交给浏览器半侧自举。'
    )
    return
  }

  const facts = collectFacts(ctx)
  const route = (path, handler, kind) => webServer.register({
    kind: kind || 'exact',
    path,
    handler: guardHandler(ctx, path, handler)
  })
  const text = (file, type) => (req, res) => send(res, type, readAsset(file))

  disposers.push(route(BASE + '/splash.css', text('splash.css', 'text/css')))
  disposers.push(route(BASE + '/splash.js', text('splash.js', 'application/javascript')))
  disposers.push(route(BASE + '/gate.css', text('gate.css', 'text/css')))
  disposers.push(route(BASE + '/gate.js', text('gate.js', 'application/javascript')))

  /* 主题包：给浏览器半调 theme.overrideTokens 用 */
  /* 启动页用的 MOSS 立绘（透明 webp） */
  const imageFile = (file, type) => (req, res) => {
    try {
      const buf = readFileSync(join(PLUGIN_DIR, 'assets', file))
      res.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=3600',
        'Content-Length': String(buf.length),
      })
      res.end(buf)
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('not found')
    }
  }
  disposers.push(route(BASE + '/assets/moss-work.webp', imageFile('moss-work.webp', 'image/webp')))
  disposers.push(route(BASE + '/assets/moss-idle.webp', imageFile('moss-idle.webp', 'image/webp')))
  disposers.push(route(BASE + '/assets/moss-idle-b.webp', imageFile('moss-idle-b.webp', 'image/webp')))

  disposers.push(route(BASE + '/theme.json', (req, res) => {
    const cfg = readConfig()
    const payload = themePayload(cfg.theme.mode)
    if (!payload) return sendJson(res, 200, { ok: true, mode: 'off', tokens: null, css: '' })
    sendJson(res, 200, { ok: true, mode: cfg.theme.mode, tokens: payload.tokens, css: payload.css })
  }))

  /*
   * /config：一条精确路由同时承担 GET（读）与 POST（改）。
   * 不能拆成两条同 path 的 register —— 路由表里同 path 重复会直接抛错，
   * 那是装配期故障，不是一个可忽略的告警。
   */
  disposers.push(route(BASE + '/config', async (req, res) => {
    if (req.method === 'GET') {
      return sendJson(res, 200, { ok: true, config: { ...publicConfig(readConfig()), facts } })
    }
    if (req.method !== 'POST') return methodNotAllowed(res, 'GET, POST')
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'untrusted origin' })
    let body
    try { body = await readBody(req) } catch (err) { return sendJson(res, 400, { ok: false, error: String(err.message || err) }) }
    const current = readConfig()
    const next = { ...current, splash: { ...current.splash }, theme: { ...current.theme }, auth: { ...current.auth } }

    if (typeof body.enabled === 'boolean') next.enabled = body.enabled

    if (body.splash && typeof body.splash === 'object') {
      if (typeof body.splash.enabled === 'boolean') next.splash.enabled = body.splash.enabled
      if (body.splash.mode === 'session' || body.splash.mode === 'always') next.splash.mode = body.splash.mode
      const speed = Number(body.splash.speed)
      if (Number.isFinite(speed)) next.splash.speed = Math.min(3, Math.max(0.35, speed))
    }

    if (body.theme && typeof body.theme === 'object') {
      if (['off', '550w', 'moss'].includes(body.theme.mode)) next.theme.mode = body.theme.mode
    }

    if (body.auth && typeof body.auth === 'object') {
      if (typeof body.auth.enabled === 'boolean') {
        /* 开门口令要求已经设置过 —— 否则一开就把自己锁在外面 */
        if (body.auth.enabled && (!next.auth.salt || !next.auth.hash)) {
          return sendJson(res, 400, { ok: false, error: '还没有设置口令，请先设置口令再开启' })
        }
        next.auth.enabled = body.auth.enabled
      }
      if (typeof body.auth.perSession === 'boolean') next.auth.perSession = body.auth.perSession
      const delay = Number(body.auth.delay)
      if (Number.isFinite(delay)) next.auth.delay = Math.min(120, Math.max(0, Math.round(delay)))
    }

    const saved = writeConfig(next)
    sendJson(res, 200, { ok: true, config: publicConfig(saved) })
  }))

  /* 设置 / 修改 / 清除口令 */
  disposers.push(route(BASE + '/password', async (req, res) => {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST')
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'untrusted origin' })
    let body
    try { body = await readBody(req) } catch (err) { return sendJson(res, 400, { ok: false, error: String(err.message || err) }) }

    const cfg = readConfig()
    const hasPassword = cfg.auth.salt.length > 0 && cfg.auth.hash.length > 0

    if (hasPassword) {
      const current = typeof body.current === 'string' ? body.current : ''
      if (!verifyPassword(current, cfg.auth.salt, cfg.auth.hash)) {
        return sendJson(res, 401, { ok: false, error: '当前口令不正确' })
      }
    }

    const next = { ...cfg, auth: { ...cfg.auth } }

    if (body.clear === true) {
      next.auth.salt = ''
      next.auth.hash = ''
      next.auth.enabled = false
      const saved = writeConfig(next)
      return sendJson(res, 200, { ok: true, cleared: true, config: publicConfig(saved) })
    }

    const password = typeof body.password === 'string' ? body.password : ''
    if (password.length < 4) {
      return sendJson(res, 400, { ok: false, error: '口令至少 4 位' })
    }
    if (password.length > 200) {
      return sendJson(res, 400, { ok: false, error: '口令过长' })
    }
    const digest = hashPassword(password)
    next.auth.salt = digest.salt
    next.auth.hash = digest.hash
    const saved = writeConfig(next)
    return sendJson(res, 200, { ok: true, config: publicConfig(saved) })
  }))

  /* 口令核验：每 IP 10 次 / 5 分钟 */
  disposers.push(route(BASE + '/auth', async (req, res) => {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST')
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'untrusted origin' })
    const ip = clientIp(req)
    if (attemptsLeft(ip) <= 0) {
      return sendJson(res, 429, { ok: false, error: 'too many attempts', retryAfter: 300 })
    }
    let body
    try { body = await readBody(req) } catch (err) { return sendJson(res, 400, { ok: false, error: String(err.message || err) }) }

    const cfg = readConfig()
    if (!cfg.auth.enabled) return sendJson(res, 200, { ok: true, bypass: true })
    if (!cfg.auth.salt || !cfg.auth.hash) return sendJson(res, 200, { ok: true, bypass: true })

    const password = typeof body.password === 'string' ? body.password : ''
    noteAttempt(ip)
    if (verifyPassword(password, cfg.auth.salt, cfg.auth.hash)) {
      clearAttempts(ip)
      return sendJson(res, 200, { ok: true })
    }
    return sendJson(res, 401, { ok: false, error: 'wrong password', attemptsLeft: attemptsLeft(ip) })
  }))

  /* index 注入 */
  disposers.push(webServer.tapIndex((html) => {
    /* 注入是整条启动链最危险的一步：坏一个字节，DSH 的首屏就没了。
       所以任何异常都必须原样返回宿主给的 html。 */
    try {
      return tapIndexImpl(html)
    } catch (err) {
      try {
        ctx.logger?.warn?.('[' + NAME + '] index 注入失败，已回退为原始页面: ' + String((err && err.message) || err))
      } catch (e) { /* noop */ }
      return html
    }
  }))

  function tapIndexImpl(html) {
    if (!html || html.includes(BASE + '/gate.js') || html.includes(BASE + '/splash.js')) return html
    const cfg = readConfig()
    /* 总开关：关掉就一个字节都不注入（主题曾经漏了这条判断） */
    if (cfg.enabled === false) return html
    const themeMode = cfg.theme.mode
    const splashOn = cfg.splash.enabled !== false
    const authOn = cfg.auth.enabled === true && cfg.auth.salt.length > 0 && cfg.auth.hash.length > 0

    /* 体检数据：读不到就留 null，动画里显示「—」，不允许把首屏打挂 */
    let stats = null
    try {
      const home = homeDir()
      stats = collectHostStats({
        homeDir: home,
        profileDir: resolveProfileDir(home, facts.profile)
      })
    } catch (err) { stats = null }

    const payload = { ...publicConfig(cfg), facts, stats }

    const head = [
      themeMode !== 'off' ? '<style id="dsh-startup-moss-theme">' + themeCss(themeMode) + '</style>' : '',
      '<style id="dsh-startup-moss-critical">' + CRITICAL_CSS + '</style>',
      splashOn ? '<link rel="stylesheet" href="' + BASE + '/splash.css">' : '',
      authOn ? '<link rel="stylesheet" href="' + BASE + '/gate.css">' : ''
    ].join('')

    /*
     * 只有「没有启动动画 + 延迟为 0」才预置门禁空壳：那种情况下应用不该先露脸。
     * 有延迟时是有意先让人看见界面再弹窗，预置反而会一上来就盖住。
     */
    const gateImmediate = authOn && cfg.auth.delay <= 0
    const gateShell = gateImmediate && !splashOn
      ? '<div id="dsh-moss-gate" class="moss-gate" data-pending="1"></div>'
        + '<script>(function(){setTimeout(function(){try{'
        + 'var g=document.getElementById("dsh-moss-gate");'
        + 'if(g&&g.getAttribute("data-pending")==="1"){'
        + 'if(g.parentNode)g.parentNode.removeChild(g);'
        + 'document.documentElement.classList.remove("moss-lock");'
        + 'window.__DSH_MOSS_GATE_FAILED__=true;'
        + '}}catch(e){}},6000)})()</script>'
      : ''

    const body = [
      gateShell,
      splashOn ? '<div id="dsh-moss-root" class="moss-root"></div>' : '',
      '<script>window.__DSH_MOSS_BOOT__="index";window.__DSH_MOSS__=' + safeJson(payload) + ';</script>',
      splashOn ? '<script>' + BOOTSTRAP_JS + '</script>' : '',
      splashOn ? '<script defer src="' + BASE + '/splash.js"></script>' : '',
      authOn ? '<script defer src="' + BASE + '/gate.js"></script>' : ''
    ].join('')

    let out = html
    if (out.includes('</head>')) out = out.replace('</head>', head + '</head>')
    else out = head + out
    if (out.includes('<body>')) out = out.replace('<body>', '<body>' + body)
    else if (out.includes('</body>')) out = out.replace('</body>', body + '</body>')
    else out = out + body
    return out
  }

  ctx.effect(() => () => {
    for (const dispose of disposers) {
      try { dispose() } catch (err) { /* noop */ }
    }
  })
}

export { name, inject }
