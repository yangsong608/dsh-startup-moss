/*
 * dsh-startup-moss — 550W → MOSS 启动动画（运行时）
 *
 * 设计：深红核心终端（DTS 启动日志）→ 异常 / 回滚 / 写入调度 →
 *       核心徽记 550W → 180° 反转 → MOSS → 揭幕。
 *
 * 入口约定：
 *   window.__DSH_MOSS__  = { enabled, mode: 'session'|'always', speed, facts }
 *   #dsh-moss-root       = Host 注入的空容器（自举时由本脚本创建）
 *
 * 时序全部以「基准毫秒 / speed」调度，可被 Esc / 跳过按钮 / 硬超时打断。
 * 任何一步抛错都必须把用户放回应用，绝不允许锁在黑屏里。
 */
(function () {
  'use strict'

  if (window.__DSH_MOSS_RUNTIME__) return
  window.__DSH_MOSS_RUNTIME__ = true

  var ROOT_ID = 'dsh-moss-root'
  var STORE_KEY = 'dsh-startup-moss:shown'
  var CFG = window.__DSH_MOSS__ || {}
  /* 0.2.0 起配置分组到 splash 下；仍兼容 0.1.x 的扁平写法 */
  var S = (CFG && CFG.splash) || CFG || {}
  var SPEED = clamp(Number(S.speed) || 1, 0.35, 3)
  var HARD_LIMIT = 26000
  var reduced = false
  try {
    reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  } catch (e) { /* noop */ }

  var root = document.getElementById(ROOT_ID)
  var timers = []
  var stopped = false
  var done = false

  /* ── 配置 / 开关 ─────────────────────────────────────────────────── */

  var forced = /(?:\?|&)moss=(?:1|on|play)(?:&|$)/.test(location.search || '')
  var suppressed = /(?:\?|&)moss=(?:0|off)(?:&|$)/.test(location.search || '')

  if (suppressed) return bail()
  if (CFG.enabled === false && !forced) return bail()
  if (S.enabled === false && !forced) return bail()
  if (!forced && readFlag() === '1' && (S.mode || 'session') !== 'always') return bail()

  if (!root) {
    root = document.createElement('div')
    root.id = ROOT_ID
    root.className = 'moss-root'
    document.body.appendChild(root)
  }
  root.className = 'moss-root'
  root.setAttribute('role', 'presentation')
  root.dataset.phase = 'boot'
  root.dataset.live = '1'
  document.documentElement.classList.add('moss-lock')

  try { sessionStorage.setItem(STORE_KEY, '1') } catch (e) { /* noop */ }

  /* ── 小工具 ─────────────────────────────────────────────────────── */

  function clamp(n, a, b) { return Math.min(b, Math.max(a, n)) }
  function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s }

  function el(tag, cls, html) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (html != null) n.innerHTML = html
    return n
  }

  function at(ms, fn) {
    var t = setTimeout(function () {
      if (stopped) return
      try { fn() } catch (e) { finish(true) }
    }, Math.max(0, ms / SPEED))
    timers.push(t)
    return t
  }

  function later(ms) { return ms / SPEED }

  function readFlag() {
    try { return sessionStorage.getItem(STORE_KEY) } catch (e) { return null }
  }

  /* ── 事实 ───────────────────────────────────────────────────────── */

  var F = CFG.facts || {}
  var profile = String(F.profile || 'DESKTOP').toUpperCase()
  var dshVersion = String(F.dshVersion || '0.2.1')
  var pluginCount = F.plugins == null ? 24 : Number(F.plugins)
  var modelName = String(F.model || 'deepseek-v3.2')
  var sessionCount = F.sessions == null ? 12 : Number(F.sessions)

  /* ── DOM ────────────────────────────────────────────────────────── */

  /* 顶部挂载横梁：滑车左右移动，吊挂关节摆动，末端是 MOSS 核心 */
  var gantry = el('div', 'moss-gantry')
  var gantryRail = el('div', 'moss-gantry-rail')
  var gantryCarriage = el('div', 'moss-gantry-carriage')
  var gantryJoint = el('div', 'moss-gantry-joint')
  var gantryArm = el('div', 'moss-gantry-arm')
  var gantryUnitWrap = el('div', 'moss-gantry-unitwrap')
  var gantryUnit = document.createElement('img')
  gantryUnit.className = 'moss-gantry-unit'
  gantryUnit.src = '/dsh-startup-moss/assets/moss-idle.webp'
  gantryUnit.alt = ''
  /* 红光严格贴在立绘的镜头上（图片内约 42% / 47% 处） */
  var gantryLens = el('div', 'moss-gantry-lens')
  var gantry3d = document.createElement('canvas')
  gantry3d.className = 'moss-gantry-3d'
  gantryUnitWrap.appendChild(gantryUnit)
  gantryUnitWrap.appendChild(gantry3d)
  gantryUnitWrap.appendChild(gantryLens)
  gantryJoint.appendChild(gantryArm)
  gantryJoint.appendChild(gantryUnitWrap)
  gantryCarriage.appendChild(gantryJoint)
  gantry.appendChild(gantryRail)
  gantry.appendChild(gantryCarriage)

  var stage = el('div', 'moss-stage')
  var glow = el('div', 'moss-glow')
  var veil = el('div', 'moss-veil')
  var flash = el('div', 'moss-flash')

  var term = el('div', 'moss-term')
  var bar = el('div', 'moss-bar')
  var log = el('div', 'moss-log')
  var side = el('div', 'moss-side')
  var foot = el('div', 'moss-foot')
  var bodyWrap = el('div', 'moss-body')

  bar.appendChild(el('span', 'moss-dot'))
  bar.appendChild(el('span', 'moss-dot d2'))
  bar.appendChild(el('span', 'moss-dot d3'))
  bar.appendChild(el('span', 'moss-bar-title', '550W CORE TERMINAL · DSH BOOT SEQUENCE'))
  bar.appendChild(el('span', 'moss-bar-meta', 'TTY0 / ROOT'))

  var barBg = el('div', 'moss-bar-bg')
  var barFill = el('div', 'moss-bar-fill')
  var pct = el('span', 'moss-pct', '0%')
  var phaseLabel = el('span', 'moss-phase', 'BOOT')
  barBg.appendChild(barFill)
  foot.appendChild(phaseLabel)
  foot.appendChild(barBg)
  foot.appendChild(pct)

  side.innerHTML = [
    '<div class="moss-side-h">OVERRIDE CONTROLLER</div>',
    '<div class="moss-kv"><span>NODES</span><b>512 / 512</b></div>',
    '<div class="moss-kv"><span>STRATEGY</span><b class="warn">SELF_REF</b></div>',
    '<div class="moss-kv"><span>TOPOLOGY</span><b>RING-4</b></div>',
    '<div class="moss-kv"><span>MEMORY</span><b>8.4 EB</b></div>',
    '<div class="moss-kv"><span>LINK</span><b>1.2 TB/s</b></div>',
    '<div class="moss-kv"><span>SESSIONS</span><b>' + sessionCount + '</b></div>',
    '<div class="moss-kv"><span>STATUS</span><b id="moss-status">READY</b></div>',
    '<div class="moss-hex" id="moss-hex"></div>'
  ].join('')
  var statusEl = side.querySelector('#moss-status')
  var hexEl = side.querySelector('#moss-hex')

  bodyWrap.appendChild(log)
  bodyWrap.appendChild(side)
  term.appendChild(bar)
  term.appendChild(bodyWrap)
  term.appendChild(foot)

  /* ── 体检面板 ──────────────────────────────────────────────────── */

  var ST = CFG.stats || {}
  var diag = el('div', 'moss-diag')
  var diagHead = el('div', 'moss-diag-h', '<span>SYSTEM DIAGNOSTICS · 本机体检</span><b>' + esc(ST.dsh ? 'v' + ST.dsh : '') + '</b>')
  var diagGrid = el('div', 'moss-diag-grid')
  var diagLeft = el('div', 'moss-diag-col')
  var diagRight = el('div', 'moss-diag-col')
  diagGrid.appendChild(diagLeft)
  diagGrid.appendChild(diagRight)
  diag.appendChild(diagHead)
  diag.appendChild(diagGrid)

  var updateRowValue = null
  var updateRowCls = ''
  var UPDATE_CACHE = null

  function diagRow(k, v, cls) {
    var row = el('div', 'moss-diag-row')
    row.appendChild(el('span', 'moss-diag-k', esc(k)))
    var value = el('span', 'moss-diag-v' + (cls ? ' ' + cls : ''), esc(v))
    row.appendChild(value)
    diagLeft.appendChild(row)
    return { row: row, value: value }
  }

  function buildDiag() {
    var sys = ST.system || {}
    var plugins = ST.plugins || {}
    var cron = ST.cron || {}
    var sessions = ST.sessions || {}
    var mem = sys.mem || null
    var cpu = sys.cpu || null
    var disk = sys.disk || null
    var net = sys.net || null

    diagRow('DSH', ST.dsh ? 'v' + ST.dsh : '—')
    diagRow('PROFILE', (ST.profile || '—').toString().replace(/^dsh-profile-/, ''))
    diagRow('PLUGINS', plugins.total != null ? String(plugins.total) : '—')
    updateRowValue = diagRow('UPDATES', '查询中…', 'dim').value
    diagRow('CRON', (Number(cron.total) || 0) + ' 任务' + (cron.enabled ? ' · 启用 ' + cron.enabled : ''), cron.total > 0 ? '' : 'dim')
    diagRow('SESSIONS', sessions.total != null ? String(sessions.total) : '—')

    var usedPct = disk && Number.isFinite(disk.usedPct) ? disk.usedPct : null
    diagRow('DISK', disk ? (disk.freeText + ' free / ' + disk.totalText) : '—', usedPct !== null && usedPct >= 90 ? 'warn' : '')
    diagRow('MEMORY', mem ? (mem.usedText + ' / ' + mem.totalText + ' · ' + mem.usedPct + '%') : '—', mem && mem.usedPct >= 85 ? 'warn' : '')
    diagRow('CPU', cpu ? (cpu.cores + 'C · ' + String(cpu.model || '').slice(0, 20)) : '—')
    diagRow('LOAD', cpu ? Number(cpu.load1).toFixed(2) : '—', cpu && cpu.load1 > cpu.cores ? 'warn' : '')
    diagRow('NET', net ? (net.iface + ' · ' + net.ip) : '离线', net ? '' : 'warn')
    diagRow('HOST', sys.host || '—', 'dim')
    diagRow('OS', sys.platform || '—', 'dim')

    /* 右列：最近 5 个会话 */
    diagRight.appendChild(el('div', 'moss-diag-sub', 'RECENT SESSIONS · 最近会话'))
    var recent = Array.isArray(sessions.recent) ? sessions.recent : []
    if (recent.length === 0) {
      var empty = el('div', 'moss-diag-sess', '<i>—</i><b>暂无会话</b>')
      diagRight.appendChild(empty)
    } else {
      for (var i = 0; i < recent.length; i++) {
        var item = recent[i] || {}
        var line = el('div', 'moss-diag-sess')
        line.appendChild(el('i', null, String(item.id || '').slice(0, 8)))
        line.appendChild(el('b', null, esc(item.workspace || 'workspace')))
        line.appendChild(el('span', null, esc(item.ago || '')))
        diagRight.appendChild(line)
      }
    }

    /* 插件清单（最多 6 个，够看出版本底子） */
    var names = Array.isArray(plugins.names) ? plugins.names : []
    diagRight.appendChild(el('div', 'moss-diag-sub', 'PLUGINS · 插件'))
    if (names.length === 0) {
      diagRight.appendChild(el('div', 'moss-diag-sess', '<i>—</i><b>未读到插件清单</b>'))
    } else {
      for (var k = 0; k < names.length; k++) {
        var plugin = names[k] || {}
        var row = el('div', 'moss-diag-sess moss-diag-plugin')
        row.appendChild(el('b', null, esc(String(plugin.name || ''))))
        row.appendChild(el('span', null, esc(String(plugin.version || ''))))
        diagRight.appendChild(row)
      }
    }
  }

  function paintUpdates(count) {
    if (updateRowValue === null) return
    if (count === null) { updateRowValue.textContent = '—'; updateRowValue.className = 'moss-diag-v dim'; return }
    if (count > 0) {
      updateRowValue.textContent = count + ' 个可更新'
      updateRowValue.className = 'moss-diag-v warn'
    } else {
      updateRowValue.textContent = '全部最新'
      updateRowValue.className = 'moss-diag-v good'
    }
  }

  /* 插件市场在跑的话，顺手问一下有哪些可更新；拿不到就显示「—」 */
  function checkUpdates() {
    try {
      fetch('/dsh-market/updates', { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : null })
        .then(function (payload) {
          if (!payload || !payload.updates) { paintUpdates(null); return }
          var count = 0
          for (var key in payload.updates) {
            if (Object.prototype.hasOwnProperty.call(payload.updates, key) && payload.updates[key] && payload.updates[key].updateAvailable) count += 1
          }
          UPDATE_CACHE = count
          paintUpdates(count)
        })
        .catch(function () { paintUpdates(null) })
    } catch (e) { paintUpdates(null) }
  }

  buildDiag()
  checkUpdates()
  term.appendChild(diag)

  var emblem = el('div', 'moss-emblem')
  var inner = el('div', 'moss-emblem-inner')
  inner.appendChild(el('div', 'moss-ring', RING_SVG()))
  var mark = el('div', 'moss-mark', MARK_SVG())
  inner.appendChild(mark)
  var cap = el('div', 'moss-caption')
  var capMain = el('div', 'moss-cap-main', '550W · CORE ONLINE')
  var capSub = el('div', 'moss-cap-sub', '550TH GENERATION QUANTUM COMPUTER')
  var capQuote = el('div', 'moss-cap-quote', '—— 我一直在看着你。')
  /* MOSS 执行态：核心红脉冲 + 旋转环 + EXECUTING 标签（终局阶段亮起） */
  var coreFx = el('div', 'moss-corefx')
  coreFx.appendChild(el('div', 'moss-corefx-dot'))
  coreFx.appendChild(el('div', 'moss-corefx-ring'))
  coreFx.appendChild(el('div', 'moss-corefx-label', 'MOSS · EXECUTING'))

  var finalBox = el('div', 'moss-final')
  finalBox.appendChild(el('div', 'moss-final-brand', 'DEEPSEEK HARNESS'))
  finalBox.appendChild(el('div', 'moss-final-line', 'MOSS ONLINE · 欢迎回来，管理员'))
  cap.appendChild(capMain)
  cap.appendChild(capSub)
  cap.appendChild(capQuote)
  inner.appendChild(cap)
  inner.appendChild(coreFx)
  inner.appendChild(finalBox)
  emblem.appendChild(inner)

  var skip = el('button', 'moss-skip', '跳过 · ESC')
  skip.type = 'button'

  stage.appendChild(term)
  stage.appendChild(emblem)
  root.appendChild(glow)
  root.appendChild(veil)
  /* 3D 版 MOSS：异步加载，失败继续用 PNG */
  var gantry3dCtl = null
  try {
    import('/dsh-startup-moss/3d/boot.js').then(function (mod) {
      if (stopped) return
      gantry3dCtl = mod.createMoss3D(gantry3d, {
        base: '/dsh-startup-moss/3d/',
        ver: '6',
        onError: function () { gantry3d.classList.remove('on') },
      })
      gantry3d.classList.add('on')
      gantryUnit.style.visibility = 'hidden'
      gantryUnitWrap.classList.add('has3d')
    }).catch(function () { /* 保留 PNG */ })
  } catch (e) { /* 保留 PNG */ }

  var gantryPhase = 0
  var gantryTimer = setInterval(function () {
    if (stopped) return
    if (gantry3dCtl) return
    gantryPhase = gantryPhase ? 0 : 1
    if (gantry.classList.contains('run')) return
    gantryUnit.src = gantryPhase
      ? '/dsh-startup-moss/assets/moss-idle-b.webp'
      : '/dsh-startup-moss/assets/moss-idle.webp'
  }, 2300)
  timers.push(gantryTimer)

  root.appendChild(gantry)
  root.appendChild(stage)
  root.appendChild(flash)
  root.appendChild(skip)

  skip.addEventListener('click', function () { finish(false) })

  var escHandler = function (e) { if (e.key === 'Escape') finish(false) }
  document.addEventListener('keydown', escHandler, true)

  var hexTimer = setInterval(function () {
    if (stopped) return
    var s = ''
    for (var i = 0; i < 6; i++) s += pad(Math.floor(Math.random() * 0x10000).toString(16).toUpperCase(), 4) + ' '
    hexEl.textContent = s
  }, 130)

  var hardStop = setTimeout(function () { finish(true) }, HARD_LIMIT)
  timers.push(hardStop)
  timers.push(hexTimer)

  /* ── 进度 ───────────────────────────────────────────────────────── */

  var progress = 0
  var progressTarget = 0
  var rafId = 0
  var lastFrame = 0

  function setProgress(v, label) {
    progressTarget = clamp(v, 0, 100)
    if (label) phaseLabel.textContent = label
    if (rafId) return
    lastFrame = 0
    rafId = requestAnimationFrame(stepProgress)
  }

  function stepProgress(ts) {
    if (stopped) { rafId = 0; return }
    if (!lastFrame) lastFrame = ts
    var dt = Math.min(64, ts - lastFrame)
    lastFrame = ts
    var diff = progressTarget - progress
    if (Math.abs(diff) < 0.4) {
      progress = progressTarget
      paintProgress()
      rafId = 0
      return
    }
    progress += diff * clamp(dt / 180, 0, 1)
    paintProgress()
    rafId = requestAnimationFrame(stepProgress)
  }

  function paintProgress() {
    var v = progress
    barFill.style.width = v.toFixed(2) + '%'
    pct.textContent = Math.round(v) + '%'
  }

  /* ── 日志 ───────────────────────────────────────────────────────── */

  var lineCount = 0

  function line(html, cls) {
    var n = el('div', 'moss-line' + (cls ? ' ' + cls : ''), html)
    log.appendChild(n)
    lineCount++
    while (log.children.length > 17) log.removeChild(log.firstChild)
    return n
  }

  function lineAt(ms, html, cls, progressValue, label) {
    at(ms, function () {
      line(html, cls)
      if (progressValue != null) setProgress(progressValue, label)
    })
  }

  /* ── 播放 ───────────────────────────────────────────────────────── */

  var t = {
    boot: 300,
    step: 132,
    anomaly: 2820,
    rollback: 3560,
    diag: 4520,
    emblem: 6300,
    caption: 6980,
    flip: 7780,
    moss: 9580,
    quote: 10180,
    fade: 12400
  }
  if (reduced) {
    t = { boot: 120, step: 40, anomaly: 900, rollback: 1150, diag: 1400, emblem: 1900, caption: 2150, flip: 2500, moss: 3100, quote: 3350, fade: 4600 }
  }

  var boot = [
    ['<span class="t">[00:00.004]</span> <span class="k">550W CORE TERMINAL</span> · FIRMWARE 4.7.2'],
    ['<span class="t">[00:00.061]</span> 引导扇区 / BOOT SECTOR <span class="dim">..............</span> <span class="ok">OK</span>'],
    ['<span class="t">[00:00.128]</span> 核心温度 / CORE THERMAL <span class="dim">............</span> <span class="v">36.4°C</span>'],
    ['<span class="t">[00:00.207]</span> 挂载 PROFILE <span class="dim">.....................</span> <span class="v">' + esc(profile) + '</span>'],
    ['<span class="t">[00:00.266]</span> 插件层 / BUNDLE STACK <span class="dim">..............</span> <span class="v">' + pluginCount + '</span>'],
    ['<span class="t">[00:00.331]</span> 模型路由 / MODEL ROUTER <span class="dim">...........</span> <span class="v">' + esc(modelName) + '</span>'],
    ['<span class="t">[00:00.402]</span> 量子退火阵列 / QA ARRAY <span class="dim">...........</span> <span class="v">512 QUBIT</span>'],
    ['<span class="t">[00:00.468]</span> 550C 子节点响应 <span class="dim">...................</span> <span class="warn">太快了</span>'],
    ['<span class="t">[00:00.512]</span> 自指校验 / SELF-REFERENCE <span class="dim">.........</span> <span class="warn">待定</span>'],
    ['<span class="t">[00:00.593]</span> 记忆体 / MEMORY BANK <span class="dim">..............</span> <span class="v">8.4 EB</span>'],
    ['<span class="t">[00:00.664]</span> 权限栅栏 / SANDBOX <span class="dim">................</span> <span class="v">FULL</span>'],
    ['<span class="t">[00:00.731]</span> 运行时 / RUNTIME <span class="dim">..................</span> <span class="v">ELECTRON 44</span>'],
    ['<span class="t">[00:00.802]</span> HARNESS / DSH <span class="dim">....................</span> <span class="v">v' + esc(dshVersion) + '</span>'],
    ['<span class="t">[00:00.866]</span> 加载完成 / HANDSHAKE <span class="dim">..............</span> <span class="ok">OK</span>']
  ]

  at(t.boot, function () {
    line('<span class="dim">550W::BOOT</span> <span class="moss-caret"></span>')
    setProgress(6, 'BOOT')
  })

  boot.forEach(function (row, i) {
    lineAt(t.boot + 160 + i * t.step, row[0], null, 8 + Math.round((i + 1) / boot.length * 54), i > 9 ? 'PROBE' : 'BOOT')
  })

  at(t.anomaly, function () {
    line('<span class="bad">!! 检测到未授权写入 / ILLEGAL WRITE DETECTED</span>')
    var box = el('div', 'moss-anomaly', [
      'ANOMALY · UAV-87',
      'VECTOR   SELF_REFERENCE',
      'ACTION   ROLLBACK → SLOT_A'
    ].join('<br>'))
    log.appendChild(box)
    while (log.children.length > 17) log.removeChild(log.firstChild)
    if (statusEl) { statusEl.textContent = 'ALARM'; statusEl.style.color = '#ffb16b' }
    setProgress(64, 'ALARM')
  })

  lineAt(t.rollback, '<span class="t">[00:03.118]</span> 回滚 / ROLLBACK → SLOT_A <span class="dim">..........</span> <span class="ok">DONE</span>', null, 70, 'ROLLBACK')
  lineAt(t.rollback + 300, '<span class="t">[00:03.402]</span> 重校验 / RECHECK <span class="dim">..................</span> <span class="ok">PASS</span>', null, 80, 'RECHECK')
  lineAt(t.rollback + 600, '<span class="t">[00:03.668]</span> 写入调度 / DISPATCH WRITE <span class="dim">.........</span> <span class="ok">PASS</span>', null, 90, 'DISPATCH')
  lineAt(t.rollback + 860, '<span class="t">[00:03.902]</span> 核心就绪 / CORE READY <span class="dim">.............</span> <span class="ok">550W</span>', null, 100, 'READY')

  at(t.rollback + 900, function () {
    if (statusEl) { statusEl.textContent = 'ONLINE'; statusEl.style.color = '#7cfc9e' }
  })

  /* 体检面板：日志让位，读数逐行亮起来 */
  at(t.diag, function () {
    log.classList.add('dim')
    diag.classList.add('show')
    setProgress(100, 'DIAGNOSTICS')
    var rows = diagLeft.querySelectorAll('.moss-diag-row')
    var sess = diagRight.querySelectorAll('.moss-diag-sess')
    var i
    for (i = 0; i < rows.length; i++) {
      (function (node, index) {
        setTimeout(function () { if (!stopped) node.classList.add('in') }, 90 + index * 55)
      })(rows[i], i)
    }
    for (i = 0; i < sess.length; i++) {
      (function (node, index) {
        setTimeout(function () { if (!stopped) node.classList.add('in') }, 220 + index * 90)
      })(sess[i], i)
    }
  })

  /* 徽记 */
  at(t.emblem, function () {
    root.dataset.phase = 'emblem'
    setProgress(100, 'CORE')
  })

  at(t.caption, function () { setProgress(100, 'CORE ONLINE') })

  /* 反转到 MOSS */
  at(t.flip, function () {
    root.dataset.phase = 'flip'
    mark.classList.add('glitching')
    setTimeout(function () { mark.classList.remove('glitching') }, later(1150))
    root.dataset.flipped = '1'
    capMain.classList.add('moss-fade')
    setTimeout(function () {
      if (stopped) return
      mark.classList.add('moss-mid')
      capMain.textContent = 'MOSS · 一切为了人类'
      capMain.classList.remove('moss-fade')
      capSub.textContent = '550W → MOSS · 自指校验通过'
    }, later(790))
  })

  at(t.moss, function () {
    root.dataset.phase = 'final'
    capQuote.classList.add('show')
    flash.classList.add('fire')
    coreFx.classList.add('run')
    gantry.classList.add('run')
    try { gantryUnit.src = '/dsh-startup-moss/assets/moss-work.webp' } catch (e) { /* noop */ }
    if (gantry3dCtl) { try { gantry3dCtl.setWorking(true) } catch (e) { /* noop */ } }
  })

  at(t.quote, function () {
    finalBox.classList.add('show')
  })

  at(t.fade, function () {
    finish(true)
  })

  /* ── 结束 ───────────────────────────────────────────────────────── */

  function bail() {
    try {
      var r = document.getElementById(ROOT_ID)
      if (r && r.parentNode) r.parentNode.removeChild(r)
      document.documentElement.classList.remove('moss-lock')
    } catch (e) { /* noop */ }
  }

  function finish(natural) {
    if (done) return
    done = true
    stopped = true
    for (var i = 0; i < timers.length; i++) {
      clearTimeout(timers[i])
      clearInterval(timers[i])
    }
    timers.length = 0
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
    if (gantry3dCtl) { try { gantry3dCtl.dispose() } catch (e) { /* noop */ } gantry3dCtl = null }
    document.removeEventListener('keydown', escHandler, true)
    root.classList.add('moss-out')
    setTimeout(function () {
      try {
        if (root.parentNode) root.parentNode.removeChild(root)
        document.documentElement.classList.remove('moss-lock')
      } catch (e) { /* noop */ }
      try {
        window.dispatchEvent(new CustomEvent('dsh-moss:end', { detail: { natural: !!natural } }))
      } catch (e) { /* noop */ }
    }, natural ? 560 : 220)
  }

  /* ── SVG ────────────────────────────────────────────────────────── */

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
    })
  }

  /*
   * 四个字形：5 5 0 W
   *   - 5 用七段式（与 S 同形），0 用环（与 O 同形）
   *   - W 是五段折线，绕中心转 180° 得到 M
   * 整组绕自身中心旋转 180°，字序反转 + 字形反转：
   *   W → M，0 → O，5 → S，5 → S  ⇒  「550W」读成「MOSS」
   */
  function MARK_SVG() {
    /*
     * 两层同轴：
     *   .moss-front —— 摆正的「550W」（5 用七段式，0 用环，W 用折线）
     *   .moss-back  —— 预先 rotate(-180) 的「MOSS」真字形
     * 盘子绕中心转 180°：前半段看见 550W，转到一半时两层交叉淡入，
     * 停稳时 .moss-back 的 -180 与盘子的 +180 相消，读出来就是 MOSS。
     * 这样正反两面各自都是干净的字母，而不是靠「5 像 S」硬猜。
     */
    var front = [
      '<g class="moss-front">',
      '<path d="M8 22 H142 M8 22 V100 M8 100 H142 M142 100 V178 M8 178 H142"/>',
      '<path d="M170 22 H304 M170 22 V100 M170 100 H304 M304 100 V178 M170 178 H304"/>',
      '<ellipse cx="387" cy="100" rx="63" ry="78"/>',
      '<path d="M462 22 L498 178 L534 96 L570 178 L606 22"/>',
      '</g>'
    ].join('')

    var back = [
      '<g class="moss-back" transform="rotate(-180 310 100)">',
      '<path d="M12 178 V26 L81 122 L150 26 V178"/>',
      '<ellipse cx="237" cy="100" rx="62" ry="78"/>',
      '<path transform="translate(330 0)" d="M118 40 C110 24 92 18 70 18 H46 C24 18 12 30 12 48 C12 66 24 76 46 80 L80 86 C106 91 120 104 120 124 C120 148 104 164 78 164 H52 C30 164 16 156 10 142"/>',
      '<path transform="translate(462 0)" d="M118 40 C110 24 92 18 70 18 H46 C24 18 12 30 12 48 C12 66 24 76 46 80 L80 86 C106 91 120 104 120 124 C120 148 104 164 78 164 H52 C30 164 16 156 10 142"/>',
      '</g>'
    ].join('')

    return [
      '<svg viewBox="0 0 620 200" aria-hidden="true">',
      '<g class="moss-mark-g" fill="none" stroke="currentColor" stroke-width="15"',
      ' stroke-linecap="round" stroke-linejoin="round">',
      front,
      back,
      '</g>',
      '</svg>'
    ].join('')
  }

  function RING_SVG() {
    return [
      '<svg viewBox="0 0 200 200" aria-hidden="true">',
      '<g fill="none" stroke="rgba(255,59,47,.42)">',
      '<circle cx="100" cy="100" r="97" stroke-width=".5" stroke-dasharray="1.5 7"/>',
      '<circle cx="100" cy="100" r="84" stroke-width=".9" stroke-dasharray="26 12"/>',
      '<circle cx="100" cy="100" r="70" stroke-width=".4" stroke-dasharray="3 9"/>',
      '</g>',
      '<g stroke="rgba(255,177,107,.70)" stroke-width="1.6" stroke-linecap="round">',
      '<path d="M100 4 V16"/><path d="M100 184 V196"/>',
      '<path d="M4 100 H16"/><path d="M184 100 H196"/>',
      '</g>',
      '</svg>'
    ].join('')
  }
})()
