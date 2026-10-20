import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'moss-audit-'))
process.env.DSH_CLIENT_VERSION = '0.2.1-rc.2'
const mod = await import(new URL('../lib/index.js?audit=' + Date.now(), import.meta.url).href)

const routes = new Map(); let tap = null
const ws = {
  register(r) { if (routes.has(r.path)) throw new Error('DUPLICATE ' + r.path); routes.set(r.path, r); return () => routes.delete(r.path) },
  tapIndex(f) { tap = f; return () => {} }
}
mod.apply({
  get: (n) => n === 'webServer' ? ws : (n === 'profileContext' ? { name: 'desktop', startedBundles: new Array(24) } : undefined),
  logger: { warn() {} }, effect() {}
})

let pass = 0, fail = 0
const ok = (cond, label, extra) => { if (cond) { pass++; console.log('  PASS', label) } else { fail++; console.log('  FAIL', label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 200)) } }

function call(path, method = 'GET', body, headers = {}) {
  const r = routes.get(path)
  const payload = body === undefined ? null : JSON.stringify(body)
  const req = { method, headers: { host: '127.0.0.1:8831', ...headers }, socket: { remoteAddress: '127.0.0.1' },
    on(ev, cb) { if (ev === 'data' && payload !== null) cb(Buffer.from(payload)); if (ev === 'end') cb() }, destroy() {} }
  return new Promise((res, rej) => {
    const rs = { code: 0, headers: {}, writeHead(c, h) { this.code = c; this.headers = h || {} }, end(b) { let j = null; try { j = JSON.parse(b.toString()) } catch { j = b.toString().slice(0, 80) } res({ status: this.code, body: j, headers: this.headers }) } }
    Promise.resolve().then(() => r.handler(req, rs)).catch(rej)
  })
}
const HTML = '<!doctype html><html><head><title>t</title></head><body><div id="app"></div></body></html>'
const inject = () => tap(HTML)

console.log('\n[1] 首次运行播种')
const c1 = (await call('/dsh-startup-moss/config')).body.config
ok(c1.auth.enabled === true, '门禁默认开启')
ok(c1.auth.configured === true, '默认口令已写入')
ok(c1.auth.delay === 5, '默认延迟 5 秒', c1.auth)
ok(c1.theme.mode === '550w', '默认主题 550w')
ok(c1.splash.enabled === true && c1.splash.speed === 1, '默认动画开启、速度 1')
ok(!JSON.stringify(c1).includes('salt') && !JSON.stringify(c1).includes('"hash"'), '配置响应不含 salt/hash')

console.log('\n[2] 默认注入')
let html = inject()
ok(html.includes('<style id="dsh-startup-moss-theme">'), '注入主题关键样式')
ok(html.includes('/dsh-startup-moss/splash.js'), '注入动画脚本')
ok(html.includes('/dsh-startup-moss/gate.js'), '注入门禁脚本')
ok(!html.includes('data-pending="1"'), '延迟>0 时不预置门禁空壳')
const payload = JSON.parse(html.match(/window\.__DSH_MOSS__=(\{.*?\});<\/script>/)[1])
ok(payload.stats && payload.stats.system && payload.stats.system.cpu, '载荷带体检数据')
ok(!JSON.stringify(payload).includes('"salt"'), '载荷不含 salt')

console.log('\n[3] 总开关关闭 = 零注入')
await call('/dsh-startup-moss/config', 'POST', { enabled: false })
const off = inject()
ok(off === HTML, '页面原样返回（不注入主题/动画/门禁）')
await call('/dsh-startup-moss/config', 'POST', { enabled: true })

console.log('\n[4] 主题关闭 / 动画关闭的组合')
await call('/dsh-startup-moss/config', 'POST', { theme: { mode: 'off' } })
let h4 = inject()
ok(!h4.includes('<style id="dsh-startup-moss-theme">'), '主题 off 时不注入主题样式')
ok(h4.includes('splash.js') && h4.includes('gate.js'), '动画与门禁仍在')
await call('/dsh-startup-moss/config', 'POST', { splash: { enabled: false } })
h4 = inject()
ok(!h4.includes('splash.js'), '动画关闭后不注入动画脚本')
ok(!h4.includes('data-pending="1"'), '延迟>0 仍不预置空壳')
await call('/dsh-startup-moss/config', 'POST', { auth: { delay: 0 } })
h4 = inject()
ok(h4.includes('data-pending="1"'), '无动画 + 延迟 0 → 预置门禁空壳')
await call('/dsh-startup-moss/config', 'POST', { splash: { enabled: true }, auth: { delay: 5 } })

console.log('\n[5] 口令核验与节流')
ok((await call('/dsh-startup-moss/auth', 'POST', { password: 'moss' })).status === 200, '默认口令 moss 通过')
const wrong = await call('/dsh-startup-moss/auth', 'POST', { password: 'x' })
ok(wrong.status === 401 && wrong.body.attemptsLeft === 9, '错误口令 401 且带剩余次数')
let limited = null
for (let i = 0; i < 12; i++) limited = await call('/dsh-startup-moss/auth', 'POST', { password: 'bad' })
ok(limited.status === 429, '连错超过阈值 → 429 节流')

console.log('\n[6] 改口令 / 清口令')
ok((await call('/dsh-startup-moss/password', 'POST', { password: 'newpass' })).status === 401, '未带当前口令不能改')
ok((await call('/dsh-startup-moss/password', 'POST', { current: 'moss', password: 'newpass' })).status === 200, '带当前口令可改')
ok((await call('/dsh-startup-moss/password', 'POST', { current: 'newpass', password: '123' })).status === 400, '新口令太短被拒（带当前口令后校验）')
const cleared = await call('/dsh-startup-moss/password', 'POST', { clear: true, current: 'newpass' })
ok(cleared.status === 200 && cleared.body.cleared === true, '清除口令')
ok((await call('/dsh-startup-moss/config')).body.config.auth.enabled === false, '清口令后门禁自动关闭')
ok((await call('/dsh-startup-moss/config', 'POST', { auth: { enabled: true } })).status === 400, '没口令不能开门禁')

console.log('\n[7] 方法与同源')
ok((await call('/dsh-startup-moss/config', 'PUT')).status === 405, 'PUT /config → 405')
ok((await call('/dsh-startup-moss/config', 'POST', { enabled: true }, { origin: 'http://evil.example' })).status === 403, '跨源 POST → 403')
ok((await call('/dsh-startup-moss/config', 'POST', { enabled: true }, { origin: 'http://127.0.0.1:8831' })).status === 200, '同源 POST 放行')

console.log('\n[8] 主题包')
await call('/dsh-startup-moss/config', 'POST', { theme: { mode: 'moss' } })
const theme = (await call('/dsh-startup-moss/theme.json')).body
const keys = Object.keys(theme.tokens)
ok(keys.length === 61, '61 个 token', keys.length)
ok(theme.tokens['--dsw-alias-bg-base'].light && theme.tokens['--dsw-alias-bg-base'].dark, 'token 是 {light,dark} 形状')
ok(theme.mode === 'moss', '主题切换后 theme.json 跟着变')

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
