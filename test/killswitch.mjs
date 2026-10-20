/**
 * 环境级总闸：DSH_STARTUP_MOSS=off 时必须零注册、零注入。
 *   DSH_STARTUP_MOSS=off node test/killswitch.mjs
 */
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'moss-off-'))
const mod = await import('../lib/index.js?off=' + Date.now())

let registered = 0
let tapped = false
const ws = {
  register() { registered++; return () => {} },
  tapIndex() { tapped = true; return () => {} }
}
mod.apply({
  get: (n) => n === 'webServer' ? ws : undefined,
  logger: { warn() {}, info() {} },
  effect() {}
})

if (registered !== 0 || tapped) {
  console.error('FAIL: DSH_STARTUP_MOSS=off 仍然注册了', registered, '条路由 / tapIndex=', tapped)
  process.exit(1)
}
console.log('PASS: DSH_STARTUP_MOSS=off → 零注册、零注入（页面原样返回）')
