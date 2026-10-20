/**
 * 安全启动自检：本插件是启动链上的一环，任何失败都必须表现为「插件没生效」，
 * 而不是「DSH 起不来」。这个脚本把四层守卫逐条跑一遍。
 *
 *   node test/safety.mjs
 */
import { readFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

let pass = 0, fail = 0
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log('  PASS', label) }
  else { fail++; console.log('  FAIL', label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 200)) }
}

const home = mkdtempSync(join(tmpdir(), 'moss-safety-'))
process.env.DSH_HOME = home

async function loadPlugin() {
  // 每次都重新 import 太难（ESM 缓存），改用一个可配置的入口：进程级 env + 动态 query 不行，
  // 所以分两次进程跑。这里只做「正常装配」这一轮。
  return import('../lib/index.js?t=' + Date.now())
}

function fakeServer() {
  const routes = new Map(); let tap = null
  const ws = {
    register(r) { if (routes.has(r.path)) throw new Error('dup ' + r.path); routes.set(r.path, r); return () => {} },
    tapIndex(f) { tap = f; return () => {} }
  }
  return { ws, routes, getTap: () => tap }
}

function ctxFor(ws) {
  return {
    get: (n) => n === 'webServer' ? ws : undefined,
    logger: { warn() {}, info() {} },
    effect() {}
  }
}

function callRoute(routes, path, method, raw, headers = {}) {
  const r = routes.get(path)
  if (!r) return Promise.resolve({ status: 0, thrown: 'no route' })
  const req = {
    method: method || 'GET',
    headers: { host: 'h', ...headers },
    socket: { remoteAddress: '127.0.0.1' },
    on(ev, cb) { if (ev === 'data' && raw !== undefined) cb(Buffer.from(raw)); if (ev === 'end') cb() },
    destroy() {}
  }
  return new Promise((resolve, reject) => {
    const res = {
      headersSent: false,
      code: 0,
      writeHead(c) { this.headersSent = true; this.code = c },
      end(b) {
        let body = null
        try { body = JSON.parse(String(b)) } catch { body = String(b).slice(0, 60) }
        resolve({ status: this.code, body })
      }
    }
    Promise.resolve().then(() => r.handler(req, res)).catch(reject)
  })
}

console.log('\n[1] 正常装配 + 注入自我防护')
{
  const { ws, routes, getTap } = fakeServer()
  const mod = await loadPlugin()
  mod.apply(ctxFor(ws))
  const tap = getTap()
  ok(typeof tap === 'function', 'tapIndex 已注册')
  ok(tap('') === '', '空 html 原样返回')
  ok(tap(null) === null, 'null 原样返回')
  ok(tap('<html><head></head><body></body></html>').includes('dsh-startup-moss'), '正常页面被注入')
  // 让注入内部抛错：任何属性访问都炸的 Proxy
  const evil = new Proxy({}, { get() { throw new Error('boom') } })
  let threw = null
  let out = null
  try { out = tap(evil) } catch (e) { threw = e }
  ok(threw === null && out === evil, '注入内部异常被吞掉并原样返回（不让首屏变 400）')

  // 坏请求（没有 req.on）→ 优雅 400，而不是把异常抛回宿主
  const broken = { method: 'POST', headers: { host: 'h' }, socket: { remoteAddress: '127.0.0.1' } }
  const bad = await new Promise((resolve) => {
    const route = routes.get('/dsh-startup-moss/config')
    const res = { headersSent: false, code: 0, writeHead(c) { this.headersSent = true; this.code = c }, end(b) { resolve({ status: this.code, body: String(b).slice(0, 80) }) } }
    Promise.resolve().then(() => route.handler(broken, res))
  })
  ok(bad.status === 400, '坏请求被优雅拒绝（400，不抛）', bad)

  // 未预期的异常（资源文件被删）→ 守卫吞成 500，而不是冒泡给 webserver
  const fs = await import('node:fs')
  const splash = fileURLToPath(new URL('../lib/splash.js', import.meta.url))
  const backup = splash + '.bak'
  fs.renameSync(splash, backup)
  try {
    const res = await new Promise((resolve) => {
      const route = routes.get('/dsh-startup-moss/splash.js')
      const r2 = { headersSent: false, code: 0, writeHead(c) { this.headersSent = true; this.code = c }, end(b) { resolve({ status: this.code, body: String(b).slice(0, 80) }) } }
      Promise.resolve().then(() => route.handler({ method: 'GET', headers: { host: 'h' } }, r2))
    })
    ok(res.status === 500, 'handler 未预期异常被吞成 500（不向宿主冒泡）', res)
  } finally {
    fs.renameSync(backup, splash)
  }
}

console.log('\n[2] 门禁空壳必须能自杀')
{
  const { ws, getTap } = fakeServer()
  const mod = await import('../lib/index.js?t2=' + Date.now())
  mod.apply(ctxFor(ws))
  const tap = getTap()
  // 制造「无动画 + 延迟 0 + 门禁开」的组合，才会预置空壳
  const fs = await import('node:fs')
  fs.writeFileSync(join(home, 'dsh-moss.json'), JSON.stringify({
    enabled: true,
    splash: { enabled: false, mode: 'session', speed: 1 },
    theme: { mode: 'off' },
    auth: { enabled: true, salt: '00', hash: '00', perSession: true, delay: 0 }
  }))
  const html = tap('<!doctype html><html><head></head><body></body></html>')
  ok(html.includes('data-pending="1"'), '预置了门禁空壳')
  ok(html.includes('__DSH_MOSS_GATE_FAILED__'), '空壳带 6 秒自杀脚本（门禁脚本没跑也不会留黑屏）')
}

console.log('\n[3] 客户端半侧：拿不到 react 也要活下来')
{
  const code = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
  let captured = null
  const style = { dataset: {}, setAttribute() {}, textContent: '' }
  const sandbox = {
    window: { __ModuleLoader__: { load: (m) => { captured = m } } },
    document: {
      querySelector: () => null,
      createElement: () => style,
      head: { appendChild() {} },
      documentElement: { classList: { add() {}, remove() {} } }
    },
    Symbol, Object, JSON, console, setTimeout
  }
  vm.createContext(sandbox)
  vm.runInContext(code, sandbox)
  ok(captured && typeof captured.factory === 'function', 'client bundle 完成注册')
  const mod = captured.factory(() => { throw new Error('react 不在') })
  ok(typeof mod.apply === 'function' && Array.isArray(mod.inject), 'react 缺失时仍导出 apply/inject')
  let threw = null
  try { mod.apply({ get: () => undefined, effect() {} }) } catch (e) { threw = e }
  ok(threw === null, 'react 缺失时 apply 不抛错')
}

console.log('\n[4] engines.dsh 声明')
{
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  ok(typeof pkg.engines?.dsh === 'string' && pkg.engines.dsh.includes('0.2.0-rc.1'), 'engines.dsh 已声明（宿主不匹配时跳过 bundle 而不是崩）', pkg.engines)
  ok(pkg.engines.dsh.includes('<0.3.0-0'), '上界存在：跨大版本会被宿主跳过')
}

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
