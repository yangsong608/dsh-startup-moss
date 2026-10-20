/**
 * dsh-startup-moss — 浏览器半侧
 *
 * 两件事：
 *   1. 设置页「550W 核心终端」：开关本插件、启动动画、主题、访问口令；
 *   2. 载体没有 index 注入时自举（先挂启动动画，再挂门禁）。
 *
 * 主题走 DSH 自己的主题服务：ctx.get('theme').overrideTokens(id, {light, dark})，
 * 与 dsh-opencode-palette 同一套机制；同时维护一条自己的 <style> 以便
 * 切换主题时即时生效（不必刷新）。
 */

window.__ModuleLoader__.load({
  id: 'dsh-startup-moss',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    /* react 只是设置页的渲染器；拿不到就退化成「只有动画 + 主题」，不许把客户端插件弄崩。 */
    var react = null
    try { react = require('react') } catch (e) { react = null }
    var h = react ? react.createElement : null
    var useState = react ? react.useState : null
    var useEffect = react ? react.useEffect : null
    var useCallback = react ? react.useCallback : null

    var BASE = '/dsh-startup-moss'
    var ROOT_ID = 'dsh-moss-root'
    var GATE_ID = 'dsh-moss-gate'
    var SESSION_KEY = 'dsh-startup-moss:shown'
    var THEME_OWNER = 'dsh-startup-moss'

    /* ── 主题运行时（模块级，面板挂载与否都在） ─────────────────────── */

    var themeDispose = null
    var liveStyle = null

    function ensureLiveStyle() {
      if (liveStyle !== null) return liveStyle
      if (typeof document === 'undefined') return null
      liveStyle = document.createElement('style')
      liveStyle.dataset.plugin = THEME_OWNER
      liveStyle.id = 'dsh-startup-moss-theme-live'
      document.head.appendChild(liveStyle)
      return liveStyle
    }

    function decl(obj) {
      var out = []
      for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) out.push(key + ':' + obj[key])
      }
      return out.join(';')
    }

    /* theme.json 给的是逐变量的 { light, dark }；这里摊平成两条 CSS 块 */
    function tokensToCss(tokens) {
      if (!tokens) return ''
      var light = {}
      var dark = {}
      for (var key in tokens) {
        if (!Object.prototype.hasOwnProperty.call(tokens, key)) continue
        var pair = tokens[key] || {}
        if (pair.light !== undefined && pair.light !== null) light[key] = pair.light
        if (pair.dark !== undefined && pair.dark !== null) dark[key] = pair.dark
      }
      /* 与 host 侧 themeCss 同款特异性：压过宿主写在 body 上的 token */
      return ':root,html body{' + decl(light) + '}\nhtml body[data-ds-dark-theme]{' + decl(dark) + '}'
    }

    function clearTheme(theme) {
      try { if (themeDispose) themeDispose() } catch (e) { /* noop */ }
      themeDispose = null
      var live = ensureLiveStyle()
      if (live) live.textContent = ''
      var injected = document.getElementById('dsh-startup-moss-theme')
      if (injected) injected.textContent = ''
    }

    function applyTheme(theme, mode) {
      if (!theme || typeof theme.overrideTokens !== 'function') return Promise.resolve()
      if (mode === 'off') { clearTheme(theme); return Promise.resolve() }
      return fetch(BASE + '/theme.json', { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json() })
        .then(function (payload) {
          if (!payload || !payload.tokens) return
          try { if (themeDispose) themeDispose() } catch (e) { /* noop */ }
          themeDispose = theme.overrideTokens(THEME_OWNER, payload.tokens)
          var live = ensureLiveStyle()
          if (live) live.textContent = tokensToCss(payload.tokens) + (payload.css ? '\n' + payload.css : '')
          var injected = document.getElementById('dsh-startup-moss-theme')
          if (injected) injected.textContent = tokensToCss(payload.tokens)
        })
        .catch(function () { /* 主题拿不到就维持宿主默认 */ })
    }

    /* ── 自举（没有 index 注入的载体） ─────────────────────────────── */

    function flag() {
      try { return sessionStorage.getItem(SESSION_KEY) } catch (e) { return null }
    }

    function booted(mark) {
      try { window.__DSH_MOSS_BOOT__ = mark } catch (e) { /* noop */ }
    }

    function selfBoot() {
      try {
        if (typeof document === 'undefined' || !document.body) return
        if (window.__DSH_MOSS_BOOT__) return
        if (document.getElementById(ROOT_ID) || document.getElementById(GATE_ID)) return
        booted('client')

        var forced = /(?:\?|&)moss=(?:1|on|play)(?:&|$)/.test(location.search || '')

        fetch(BASE + '/config', { headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json() })
          .then(function (j) {
            if (!j || !j.config) return
            var cfg = j.config
            if (cfg.enabled === false && !forced) return
            var splash = cfg.splash || {}
            var play = splash.enabled !== false && (forced || splash.mode === 'always' || flag() !== '1')
            /* 门禁脚本读的是 window.__DSH_MOSS__；自举时 splash 不播就没人写它 */
            window.__DSH_MOSS__ = cfg
            if (play) mountSplash(cfg)
            if (cfg.auth && cfg.auth.enabled) mountGate()
          })
          .catch(function () { /* 路由不在就当没这个插件 */ })
      } catch (e) { /* noop */ }
    }

    function addLink(href) {
      if (typeof document === 'undefined') return
      if (document.querySelector('link[data-moss="' + href + '"]')) return
      var link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = href
      link.dataset.moss = href
      document.head.appendChild(link)
    }

    function mountSplash(cfg) {
      addLink(BASE + '/splash.css')
      var root = document.createElement('div')
      root.id = ROOT_ID
      root.className = 'moss-root'
      document.body.appendChild(root)
      window.__DSH_MOSS__ = cfg
      var script = document.createElement('script')
      script.src = BASE + '/splash.js'
      script.defer = true
      script.onerror = function () {
        try {
          if (root.parentNode) root.parentNode.removeChild(root)
          document.documentElement.classList.remove('moss-lock')
        } catch (e) { /* noop */ }
      }
      document.head.appendChild(script)
    }

    function mountGate() {
      if (window.__DSH_MOSS_GATE__) return
      addLink(BASE + '/gate.css')
      var script = document.createElement('script')
      script.src = BASE + '/gate.js'
      script.defer = true
      document.head.appendChild(script)
    }

    /* ── 设置面板 ─────────────────────────────────────────────────── */

    var CSS = [
      '.__moss_root{max-width:660px;display:flex;flex-direction:column;gap:14px;font-size:13px;color:var(--dsw-alias-label-primary)}',
      '.__moss_intro{display:flex;align-items:center;gap:10px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}',
      '.__moss_badge{font-family:ui-monospace,Menlo,monospace;border:1px solid var(--dsw-alias-border-l2);border-radius:5px;padding:1px 7px;color:var(--dsw-alias-brand-text)}',
      '.__moss_group{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:13px 15px;display:flex;flex-direction:column;gap:12px;background:var(--dsw-alias-bg-layer-1)}',
      '.__moss_title{font-size:11px;font-weight:600;letter-spacing:.10em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}',
      '.__moss_row{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}',
      '.__moss_label{display:flex;flex-direction:column;gap:3px}',
      '.__moss_name{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.__moss_hint{font-size:11px;line-height:1.55;color:var(--dsw-alias-label-tertiary)}',
      '.__moss_check{display:flex;align-items:flex-start;gap:9px;cursor:pointer}',
      '.__moss_check input{margin-top:2px;accent-color:var(--dsw-alias-brand-primary)}',
      '.__moss_select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 10px;font:inherit;font-size:13px;min-width:170px}',
      '.__moss_input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:7px 10px;font-size:13px;box-sizing:border-box;width:100%;outline:none}',
      '.__moss_input:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.__moss_two{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
      '.__moss_btn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 14px;font:inherit;font-size:12.5px;cursor:pointer}',
      '.__moss_btn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary)}',
      '.__moss_btn:disabled{opacity:.5;cursor:default}',
      '.__moss_btnPri{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:#fff}',
      '.__moss_btnDanger{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
      '.__moss_range{width:190px;accent-color:var(--dsw-alias-brand-primary)}',
      '.__moss_status{font-size:12px;color:var(--dsw-alias-label-tertiary);min-height:18px}',
      '.__moss_ok{color:var(--dsw-alias-state-success-primary)}',
      '.__moss_err{color:var(--dsw-alias-state-error-primary)}',
      '.__moss_note{font-size:11px;line-height:1.6;color:var(--dsw-alias-label-tertiary);border-left:2px solid var(--dsw-alias-border-l3);padding-left:9px}',
      '.__moss_pwBtns{display:flex;gap:8px;flex-wrap:wrap}',
      '@media (max-width:620px){.__moss_two{grid-template-columns:1fr}}'
    ].join('')

    var styleTagId = 'dsh-startup-moss/panel.css'
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + styleTagId + '"]') === null) {
      var tag = document.createElement('style')
      tag.dataset.plugin = THEME_OWNER
      tag.dataset.pluginCss = styleTagId
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    function merge(target, patch) {
      for (var key in patch) {
        if (!Object.prototype.hasOwnProperty.call(patch, key)) continue
        var value = patch[key]
        if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') {
          for (var inner in value) {
            if (Object.prototype.hasOwnProperty.call(value, inner)) target[key][inner] = value[inner]
          }
        } else {
          target[key] = value
        }
      }
      return target
    }

    function postJson(url, body) {
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (r) {
        return r.json().then(function (j) { return { status: r.status, body: j } })
      })
    }

    function Panel(props) {
      var api = props && props.api ? props.api : props
      var theme = api && api.theme

      var cfgState = useState(null)
      var cfg = cfgState[0]
      var setCfg = cfgState[1]

      var statusState = useState({ kind: 'idle', text: '' })
      var status = statusState[0]
      var setStatus = statusState[1]

      var pwState = useState(''); var pw = pwState[0]; var setPw = pwState[1]
      var pw2State = useState(''); var pw2 = pw2State[0]; var setPw2 = pw2State[1]
      var curState = useState(''); var curPw = curState[0]; var setCurPw = curState[1]

      function toast(kind, text) { setStatus({ kind: kind, text: text }) }
      function toastOk(text) { toast('ok', text) }
      function toastErr(text) { toast('err', text) }

      var load = useCallback(function () {
        fetch(BASE + '/config', { headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json() })
          .then(function (j) {
            if (j && j.config) setCfg(j.config)
            else toastErr('读取配置失败')
          })
          .catch(function () { toastErr('宿主接口不可用（' + BASE + '/config 无响应）') })
      }, [])

      useEffect(function () { load() }, [load])
      useEffect(function () {
        applyTheme(theme, cfg ? cfg.theme.mode : null)
      }, [cfg && cfg.theme.mode])

      function save(patch) {
        postJson(BASE + '/config', patch)
          .then(function (out) {
            if (out.status === 200 && out.body && out.body.ok) {
              setCfg(function (prev) {
                var next = merge(JSON.parse(JSON.stringify(prev || {})), patch)
                if (out.body.config) merge(next, out.body.config)
                return next
              })
              toastOk('已保存 · ' + new Date().toLocaleTimeString())
            } else {
              toastErr((out.body && out.body.error) || '保存失败')
              load()
            }
          })
          .catch(function () { toastErr('保存失败：无法连接宿主') })
      }

      function setPassword() {
        if (pw.length < 4) { toastErr('口令至少 4 位'); return }
        if (pw !== pw2) { toastErr('两次输入不一致'); return }
        postJson(BASE + '/password', { password: pw, current: curPw })
          .then(function (out) {
            if (out.status === 200 && out.body && out.body.ok) {
              setPw(''); setPw2(''); setCurPw('')
              toastOk('口令已保存')
              load()
            } else {
              toastErr((out.body && out.body.error) || '设置失败')
            }
          })
          .catch(function () { toastErr('设置失败：无法连接宿主') })
      }

      function clearPassword() {
        postJson(BASE + '/password', { clear: true, current: curPw })
          .then(function (out) {
            if (out.status === 200 && out.body && out.body.ok) {
              setCurPw('')
              toastOk('口令已清除，门禁已关闭')
              load()
            } else {
              toastErr((out.body && out.body.error) || '清除失败')
            }
          })
          .catch(function () { toastErr('清除失败：无法连接宿主') })
      }

      if (!cfg) {
        return h('div', { className: '__moss_root' },
          h('div', { className: '__moss_intro' },
            h('span', { className: '__moss_badge' }, '550W'),
            h('span', null, '核心终端 · 设置')),
          h('div', { className: '__moss_status' + (status.kind === 'err' ? ' __moss_err' : '') },
            status.text || '读取配置中…'))
      }

      var splash = cfg.splash || {}
      var themeCfg = cfg.theme || {}
      var auth = cfg.auth || {}
      var statusClass = '__moss_status' + (status.kind === 'ok' ? ' __moss_ok' : status.kind === 'err' ? ' __moss_err' : '')

      return h('div', { className: '__moss_root' },
        h('div', { className: '__moss_intro' },
          h('span', { className: '__moss_badge' }, '550W'),
          h('span', null, '核心终端 · 启动动画 / 主题 / 访问口令')),

        h('div', { className: '__moss_group' },
          h('div', { className: '__moss_row' },
            h('label', { className: '__moss_check' },
              h('input', {
                type: 'checkbox',
                checked: cfg.enabled !== false,
                onChange: function (e) { save({ enabled: e.target.checked }) }
              }),
              h('span', { className: '__moss_label' },
                h('span', { className: '__moss_name' }, '启用 550W 核心终端'),
                h('span', { className: '__moss_hint' }, '关闭后启动动画、主题、口令门禁一并停用（刷新页面后完全退出）'))))),

        h('div', { className: '__moss_group' },
          h('div', { className: '__moss_title' }, '启动动画'),
          h('div', { className: '__moss_row' },
            h('label', { className: '__moss_check' },
              h('input', {
                type: 'checkbox',
                checked: splash.enabled !== false,
                onChange: function (e) { save({ splash: { enabled: e.target.checked } }) }
              }),
              h('span', { className: '__moss_label' },
                h('span', { className: '__moss_name' }, '启动时播放'),
                h('span', { className: '__moss_hint' }, '550W 核心终端 → 异常回滚 → 铭牌 180° 反转成 MOSS')))),
          h('div', { className: '__moss_row' },
            h('span', { className: '__moss_name' }, '播放时机'),
            h('select', {
              className: '__moss_select',
              value: splash.mode || 'session',
              onChange: function (e) { save({ splash: { mode: e.target.value } }) }
            },
              h('option', { value: 'session' }, '每个浏览器会话一次'),
              h('option', { value: 'always' }, '每次打开都播'))),
          h('div', { className: '__moss_row' },
            h('span', { className: '__moss_name' }, '速度'),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
              h('input', {
                className: '__moss_range',
                type: 'range',
                min: '0.35',
                max: '3',
                step: '0.05',
                value: String(splash.speed || 1),
                onChange: function (e) { save({ splash: { speed: Number(e.target.value) } }) }
              }),
              h('span', { className: '__moss_hint' }, (Number(splash.speed) || 1).toFixed(2) + '×'))),
          h('div', { className: '__moss_row' },
            h('button', {
              className: '__moss_btn',
              type: 'button',
              onClick: function () {
                try {
                  var u = new URL(location.href)
                  u.searchParams.set('moss', '1')
                  location.href = u.toString()
                } catch (e) { location.reload() }
              }
            }, '立即预览'),
            h('span', { className: '__moss_hint' }, '预览会重新加载页面（?moss=1）'))),

        h('div', { className: '__moss_group' },
          h('div', { className: '__moss_title' }, '主题'),
          h('div', { className: '__moss_row' },
            h('span', { className: '__moss_name' }, '界面配色'),
            h('select', {
              className: '__moss_select',
              value: themeCfg.mode || 'off',
              onChange: function (e) { save({ theme: { mode: e.target.value } }) }
            },
              h('option', { value: 'off' }, '关闭（用 DSH 原主题）'),
              h('option', { value: '550w' }, '550W · 深红核心终端'),
              h('option', { value: 'moss' }, 'MOSS · 青绿领航员'))),
          h('div', { className: '__moss_note' },
            '主题立即生效。若同时启用 OpenCode Palette 等换肤插件，两边会争同一批 --dsw-* 变量，建议只留一个。')),

        h('div', { className: '__moss_group' },
          h('div', { className: '__moss_title' }, '访问口令'),
          h('div', { className: '__moss_row' },
            h('label', { className: '__moss_check' },
              h('input', {
                type: 'checkbox',
                checked: auth.enabled === true,
                disabled: auth.configured !== true,
                onChange: function (e) { save({ auth: { enabled: e.target.checked } }) }
              }),
              h('span', { className: '__moss_label' },
                h('span', { className: '__moss_name' }, '进入前需要口令'),
                h('span', { className: '__moss_hint' },
                  auth.configured ? '开启后，页面加载时先显示核验界面' : '先设置一个口令，才能开启')))),
          h('div', { className: '__moss_row' },
            h('label', { className: '__moss_check' },
              h('input', {
                type: 'checkbox',
                checked: auth.perSession !== false,
                onChange: function (e) { save({ auth: { perSession: e.target.checked } }) }
              }),
              h('span', { className: '__moss_hint' }, '同一浏览器会话内不再重复询问（关闭 = 本机长期记住）'))),
          h('div', { className: '__moss_row' },
            h('span', { className: '__moss_name' }, '弹出延迟'),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              h('input', {
                className: '__moss_input',
                type: 'number',
                min: '0',
                max: '120',
                step: '1',
                style: { width: '92px' },
                value: String(typeof auth.delay === 'number' ? auth.delay : 5),
                onChange: function (e) { save({ auth: { delay: Number(e.target.value) } }) }
              }),
              h('span', { className: '__moss_hint' }, '秒 · 启动界面结束后再弹出'))),
          h('div', { className: '__moss_hint' }, '默认口令是 moss（首次运行自动写入，建议改掉）。'),

          h('div', { className: '__moss_two' },
            h('input', {
              className: '__moss_input',
              type: 'password',
              placeholder: auth.configured ? '新口令' : '设置口令（至少 4 位）',
              autoComplete: 'new-password',
              value: pw,
              onChange: function (e) { setPw(e.target.value) }
            }),
            h('input', {
              className: '__moss_input',
              type: 'password',
              placeholder: '再输一次',
              autoComplete: 'new-password',
              value: pw2,
              onChange: function (e) { setPw2(e.target.value) }
            })),
          auth.configured
            ? h('input', {
              className: '__moss_input',
              type: 'password',
              placeholder: '当前口令（修改或清除时需要）',
              autoComplete: 'current-password',
              value: curPw,
              onChange: function (e) { setCurPw(e.target.value) }
            })
            : null,
          h('div', { className: '__moss_row' },
            h('div', { className: '__moss_pwBtns' },
              h('button', {
                className: '__moss_btn __moss_btnPri',
                type: 'button',
                onClick: setPassword
              }, auth.configured ? '修改口令' : '设置口令'),
              auth.configured
                ? h('button', { className: '__moss_btn __moss_btnDanger', type: 'button', onClick: clearPassword }, '清除口令')
                : null),
            auth.configured && auth.enabled
              ? h('button', {
                className: '__moss_btn',
                type: 'button',
                onClick: function () {
                  if (typeof window.__DSH_MOSS_GATE_OPEN__ === 'function') window.__DSH_MOSS_GATE_OPEN__()
                  else toastErr('门禁脚本要刷新页面后才会挂载')
                }
              }, '立即测试')
              : null),
          h('div', { className: '__moss_note' },
            '这是界面门禁，不是身份认证：DSH 的 HTTP 接口仍然可达，会开控制台的人可以绕过。它挡的是「顺手就能看见」，适合个人机器的隐私遮挡。忘记口令时，把 ~/.dsh/dsh-moss.json 里的 auth.enabled 改成 false 即可恢复。')),

        h('div', { className: statusClass }, status.text || '改动自动保存'))
    }

    var inject = ['theme', 'slots']

    function apply(ctx) {
      try {
        applyImpl(ctx)
      } catch (e) {
        /* 客户端半侧失败最多是「没有设置页」，绝不允许影响已渲染的应用 */
      }
    }

    function applyImpl(ctx) {
      var theme = null
      var slots = null
      try {
        theme = ctx.get('theme')
        slots = ctx.get('slots')
      } catch (e) { /* noop */ }

      /* 自举（宿主没做 index 注入时兜底） */
      selfBoot()

      /* 接上主题服务（index 里已注入关键样式，这里补齐服务层与运行时切换） */
      try {
        fetch(BASE + '/config', { headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json() })
          .then(function (j) {
            if (j && j.config && j.config.enabled !== false) applyTheme(theme, j.config.theme.mode)
          })
          .catch(function () { /* noop */ })
      } catch (e) { /* noop */ }

      if (!slots || typeof slots.inject !== 'function' || !react) return

      var api = function () {
        return { theme: theme, reload: function () { location.reload() } }
      }

      try {
        slots.inject('settings.section', function () {
          return slots.register({
            name: 'settings.section',
            id: 'startup-moss',
            order: 27,
            label: '550W 核心终端',
            inject: api
          }, Panel)
        })
      } catch (e) { /* 设置页不可用时不影响动画与主题 */ }
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
