/*
 * dsh-startup-moss — 访问口令门禁（运行时）
 *
 * 流程：启动动画结束（或没开动画）→ 门禁盖上 → 口令正确 → 淡出放行。
 * 会话内已放行就不再问（auth.perSession=true 时存 sessionStorage，
 * 否则存 localStorage = 本机长期记住）。
 *
 * 老老实实说：这是界面门禁，不是认证。DSH 的 HTTP API 依旧可达，
 * 会开控制台的人能绕过。它挡的是「顺手看见」，不是「有人硬闯」。
 */
(function () {
  'use strict'

  if (window.__DSH_MOSS_GATE__) return
  window.__DSH_MOSS_GATE__ = true

  var ROOT_ID = 'dsh-moss-gate'
  /* 启动动画的容器。它和门禁自己的 id 是两个东西 —— 之前兜底检查查错了 id，
     5.2s 就误判「动画已结束」，门禁比动画早弹了出来。 */
  var SPLASH_ID = 'dsh-moss-root'
  var CFG = window.__DSH_MOSS__ || {}
  var AUTH = CFG.auth || {}
  var BASE = '/dsh-startup-moss'
  var SESSION_KEY = 'dsh-startup-moss:unlocked'
  var LOCAL_KEY = 'dsh-startup-moss:unlocked:persist'

  /* 任何「不弹门禁」的早退都要顺手拆掉 Host 预置的空壳，
     否则那块不透明的 div 会留在页面上，把人挡在一个永远解不开的黑幕后面。 */
  function dropShell() {
    try {
      var shell = document.getElementById(ROOT_ID)
      if (shell && shell.getAttribute && shell.getAttribute('data-pending') === '1') {
        if (shell.parentNode) shell.parentNode.removeChild(shell)
        document.documentElement.classList.remove('moss-lock')
      }
    } catch (e) { /* noop */ }
  }

  if (AUTH.enabled !== true) { dropShell(); return }
  if (CFG.enabled === false) { dropShell(); return }
  if (alreadyUnlocked()) { dropShell(); return }
  /* 延迟：启动界面（或首帧）之后再过 N 秒才弹，N 可配（auth.delay，0–120，默认 5） */
  var DELAY_MS = Math.round(Math.min(120, Math.max(0, Number(AUTH.delay) || 0)) * 1000)

  /* 轻量诊断：控制台 `__DSH_MOSS_GATE_LOG__` 能看到每一步是什么时候、被谁触发的 */
  var TRACE = []
  function mark(step) {
    try {
      TRACE.push(step + '@' + Math.round(performance.now()))
      window.__DSH_MOSS_GATE_LOG__ = TRACE
    } catch (e) { /* noop */ }
  }
  mark('init delay=' + DELAY_MS + 'ms splash=' + (CFG.splash ? CFG.splash.enabled : 'none'))

  var scheduled = false

  function scheduleShow(why) {
    if (scheduled) { mark('schedule-skip:' + why); return }
    scheduled = true
    mark('schedule:' + why)
    if (DELAY_MS <= 0) { show('immediate:' + why); return }
    setTimeout(function () { show('delayed:' + why) }, DELAY_MS)
  }

  if (!CFG.splash || CFG.splash.enabled === false) {
    /* 没有启动动画：等首帧 + 延迟 */
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { scheduleShow('dom-ready') }, { once: true })
    } else {
      scheduleShow('dom-ready')
    }
  } else {
    /* 有启动动画：动画结束（dsh-moss:end）+ 延迟再上屏 */
    window.addEventListener('dsh-moss:end', function () {
      mark('end-event')
      scheduleShow('splash-end')
    }, { once: true })

    /*
     * 看门狗：动画脚本 404 / 抛错时 end 事件永远不会来，但它的容器会消失
     * （bootstrap 的 8s 兜底会摘掉它）。盯住 SPLASH_ID：
     * 容器没了 = 这一场动画结束了 → 补一次调度，门禁不会永远不出现。
     */
    var watchdog = setInterval(function () {
      if (scheduled) { clearInterval(watchdog); return }
      if (!document.getElementById(SPLASH_ID)) {
        mark('watchdog:splash-gone')
        clearInterval(watchdog)
        scheduleShow('watchdog')
      }
    }, 600)
    setTimeout(function () { try { clearInterval(watchdog) } catch (e) { /* noop */ } }, 40000)
  }

  function alreadyUnlocked() {
    try {
      if (AUTH.perSession !== false) return sessionStorage.getItem(SESSION_KEY) === '1'
      return localStorage.getItem(LOCAL_KEY) === '1'
    } catch (e) { return false }
  }

  function remember() {
    try {
      if (AUTH.perSession !== false) sessionStorage.setItem(SESSION_KEY, '1')
      else localStorage.setItem(LOCAL_KEY, '1')
    } catch (e) { /* noop */ }
  }

  var built = null

  function build() {
    if (built) return built
    /* Host 在没有启动动画时已放好空壳（避免应用先闪一下），复用它 */
    var root = document.getElementById(ROOT_ID)
    if (!root) {
      root = document.createElement('div')
      root.id = ROOT_ID
    }
    root.className = 'moss-gate'
    if (root.getAttribute) root.removeAttribute('data-pending')
    root.innerHTML = [
      '<div class="moss-gate-veil"></div>',
      '<div class="moss-gate-card" role="dialog" aria-modal="true" aria-labelledby="moss-gate-title">',
      '  <div class="moss-gate-bar">',
      '    <i class="moss-gate-dot"></i><b>550W CORE TERMINAL · IDENTITY VERIFICATION</b><span>TTY0</span>',
      '  </div>',
      '  <h1 class="moss-gate-title" id="moss-gate-title">需要访问许可</h1>',
      '  <div class="moss-gate-sub">ACCESS PERMISSION REQUIRED</div>',
      '  <label class="moss-gate-label" for="moss-gate-input">访问口令 / ACCESS KEY</label>',
      '  <div class="moss-gate-row">',
      '    <input id="moss-gate-input" class="moss-gate-input" type="password" autocomplete="current-password" spellcheck="false" placeholder="请输入口令" />',
      '    <button id="moss-gate-btn" class="moss-gate-btn" type="button">验证</button>',
      '  </div>',
      '  <div class="moss-gate-msg" id="moss-gate-msg">核验通过后方可进入工作区</div>',
      '  <div class="moss-gate-foot"><span>DEEPSEEK HARNESS</span><span class="moss-gate-user">550W · MOSS</span></div>',
      '</div>'
    ].join('')
    built = {
      root: root,
      card: root.querySelector('.moss-gate-card'),
      input: root.querySelector('#moss-gate-input'),
      button: root.querySelector('#moss-gate-btn'),
      msg: root.querySelector('#moss-gate-msg')
    }
    built.button.addEventListener('click', submit)
    /* 焦点陷阱：门禁在屏幕上时，Tab 不许跑到背后的应用里去 */
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return
      var focusables = root.querySelectorAll('input,button')
      if (focusables.length === 0) return
      var first = focusables[0]
      var last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    })
    built.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submit() }
    })
    return built
  }

  function show(why) {
    if (alreadyUnlocked()) { mark('show-skip:unlocked'); return }
    mark('show:' + (why || 'unknown'))
    var ui = build()
    if (!ui.root.parentNode) {
      document.body.appendChild(ui.root)
      document.documentElement.classList.add('moss-lock')
    }
    ui.root.classList.remove('moss-gate-out')
    setTimeout(function () { try { ui.input.focus() } catch (e) { /* noop */ } }, 60)
  }

  var busy = false

  function setMsg(text, kind) {
    var ui = built
    if (!ui) return
    ui.msg.textContent = text
    ui.msg.className = 'moss-gate-msg' + (kind ? ' ' + kind : '')
  }

  function setBusy(on) {
    busy = on
    if (!built) return
    built.input.disabled = on
    built.button.disabled = on
    built.button.textContent = on ? '核验中' : '验证'
  }

  function fail(message) {
    var ui = built
    if (!ui) return
    ui.card.classList.remove('moss-shake')
    /* 强制重排后再加类，保证连点也能看到抖动 */
    void ui.card.offsetWidth
    ui.card.classList.add('moss-shake')
    setMsg(message, 'err')
    try { ui.input.value = ''; ui.input.focus() } catch (e) { /* noop */ }
  }

  function submit() {
    if (busy) return
    var ui = built
    if (!ui) return
    var value = ui.input.value
    if (value.length === 0) { fail('口令不能为空'); return }
    setBusy(true)
    setMsg('正在核验身份…')
    fetch(BASE + '/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: value })
    }).then(function (res) {
      return res.json().then(function (body) { return { status: res.status, body: body } })
    }).then(function (out) {
      setBusy(false)
      if (out.status === 200 && out.body && out.body.ok === true) {
        setMsg('核验通过 · 正在进入', 'ok')
        remember()
        setTimeout(close, 420)
        return
      }
      if (out.status === 429) {
        var wait = out.body && out.body.retryAfter ? out.body.retryAfter : 60
        fail('尝试过于频繁，请 ' + wait + ' 秒后再试')
        return
      }
      /* 只有「核验服务本身不可用」才放行跳过：口令错误（401）永远不给这个口子。 */
      if (out.status >= 500 || out.status === 0) {
        fail('核验服务不可用（' + out.status + '）')
        offerSkip()
        return
      }
      var left = out.body && typeof out.body.attemptsLeft === 'number' ? out.body.attemptsLeft : null
      fail('口令错误' + (left !== null ? ' · 还可尝试 ' + left + ' 次' : ''))
    }).catch(function () {
      setBusy(false)
      fail('无法连接核验服务')
      offerSkip()
    })
  }

  /**
   * 「核验服务不可用」时的逃生口：本页临时放行。
   * 触发条件只有 5xx / 网络不通 —— 也就是插件自己的服务半侧坏了（例如 DSH 升级后路由没了），
   * 而不是"口令输错"。这样既保证人永远进得去，又不把口令变成摆设。
   */
  function offerSkip() {
    var ui = built
    if (!ui || ui.skipBtn) return
    var btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'moss-gate-btn moss-gate-skip'
    btn.textContent = '核验服务不可用 · 跳过本次'
    btn.style.marginTop = '12px'
    btn.style.width = '100%'
    btn.addEventListener('click', function () {
      try { mark('skip:server-unavailable') } catch (e) { /* noop */ }
      remember()
      close()
    })
    ui.card.appendChild(btn)
    ui.skipBtn = btn
    mark('offer-skip')
  }

  function close() {
    var ui = built
    if (!ui) return
    ui.root.classList.add('moss-gate-out')
    setTimeout(function () {
      try {
        if (ui.root.parentNode) ui.root.parentNode.removeChild(ui.root)
        document.documentElement.classList.remove('moss-lock')
      } catch (e) { /* noop */ }
      try { window.dispatchEvent(new CustomEvent('dsh-moss:unlocked')) } catch (e) { /* noop */ }
    }, 460)
  }

  /* 供设置页「立即测试门禁」使用 */
  window.__DSH_MOSS_GATE_OPEN__ = function () {
    try {
      sessionStorage.removeItem(SESSION_KEY)
      localStorage.removeItem(LOCAL_KEY)
    } catch (e) { /* noop */ }
    show()
  }
})()
