/**
 * dsh-startup-moss — 主题层
 * ---------------------------------------------------------------------------
 * 变量名取自 dsh-opencode-palette 的 TOKEN_MAP（生产环境已验证存在的
 * --dsw-alias-* 词表），所以不会写出宿主不认识的 token。
 *
 * 两套皮肤：
 *   550w —— 启动动画里那块深红核心终端：近黑底、血橙红、中文日志的暖灰字。
 *   moss —— 反转之后的那一面：冷青绿、MOSS 的「一切为了人类」。
 * 每套都给 light / dark 两半：宿主切浅色时不会糊成一片。
 */

const RED = {
  dark: {
    '--dsw-alias-bg-base': '#0b0605',
    '--dsw-alias-bg-layer-1': '#120908',
    '--dsw-alias-bg-layer-2': '#170b09',
    '--dsw-alias-bg-layer-3': '#1e0e0b',
    '--dsw-alias-bg-overlay': '#1e0e0b',
    '--dsw-specific-sidebar-fill': '#0a0504',
    '--dsw-alias-markdown-code-segment-unselected': '#120908',
    '--dsw-alias-markdown-code-segment-selected': '#241210',
    '--dsw-alias-markdown-tag': '#1a0d0a',
    '--dsw-alias-markdown-placeholder': '#1a0d0a',
    '--dsw-specific-bubble': '#170b09',
    '--dsw-alias-bg-multi-select': '#1a0d0a',
    '--dsw-alias-markdown-citation': '#1e0e0b',
    '--dsw-alias-bg-module-platform': '#1e0e0b',
    '--dsw-specific-selector': '#1e0e0b',
    '--dsw-specific-tip': '#1e0e0b',
    '--dsw-specific-bubble-highlight': '#241210',
    '--dsw-specific-input-major': '#100807',
    '--dsw-specific-login-input': '#100807',
    '--dsw-alias-markdown-code-block': '#0f0706',
    '--dsw-alias-markdown-code-block-banner': '#150a08',
    '--dsw-alias-toast-bg': '#1e0e0b',
    '--dsw-alias-tooltip-bg': '#1e0e0b',
    '--dsw-alias-button-elevated-fill': '#1a0d0a',
    '--dsw-alias-button-floating-fill': '#1a0d0a',
    '--dsw-alias-label-primary': '#f2eae4',
    '--dsw-alias-label-primary-dimmed': '#d9c6bd',
    '--dsw-alias-label-secondary': '#b39c93',
    '--dsw-alias-label-tertiary': '#8d766e',
    '--dsw-alias-label-caption': '#8d766e',
    '--dsw-alias-label-primary-bluish': '#ff8a7a',
    '--dsw-alias-link': '#ff8a7a',
    '--dsw-alias-brand-primary': '#ff3b2f',
    '--dsw-alias-brand-text': '#ff8a7a',
    '--dsw-alias-button-primary-fill': '#ff3b2f',
    '--dsw-alias-button-info-fill': '#ff8a7a',
    '--dsw-alias-button-contrast-fill': '#f2eae4',
    '--dsw-alias-state-error-primary': '#ff5a4c',
    '--dsw-alias-state-warn-primary': '#ffb16b',
    '--dsw-alias-state-warn-label': '#ffb16b',
    '--dsw-alias-state-success-primary': '#7cfc9e',
    '--dsw-alias-state-business-primary': '#ff3b2f',
    '--dsw-alias-state-idle-primary': '#8d766e',
    '--dsw-alias-border-l1': '#241110',
    '--dsw-alias-border-l2': '#3a1a16',
    '--dsw-alias-border-l2-darkmode-thin': '#2e1411',
    '--dsw-alias-border-l3': '#4a1d18',
    '--dsw-alias-border-l4': '#5c2620',
    '--dsw-alias-button-ghost-active-border': '#5c2620',
    '--dsw-alias-code-diff-added': '#2e7d4f',
    '--dsw-alias-code-diff-deleted': '#a3322a',
    '--dsw-alias-file-diff-added-bg': 'rgba(46,125,79,.16)',
    '--dsw-alias-file-diff-added-gutter': 'rgba(46,125,79,.24)',
    '--dsw-alias-file-diff-added-marker': '#2e7d4f',
    '--dsw-alias-file-diff-deleted-bg': 'rgba(163,50,42,.16)',
    '--dsw-alias-file-diff-deleted-gutter': 'rgba(163,50,42,.24)',
    '--dsw-alias-file-diff-deleted-marker': '#a3322a',
    '--dsw-alias-menu-icon': '#b39c93',
    '--dsw-alias-toast-label': '#f2eae4',
    '--dsw-alias-tooltip-key-bg': '#241210',
    '--dsw-alias-markdown-inline-code': 'transparent'
  },
  light: {
    '--dsw-alias-bg-base': '#f7f1e7',
    '--dsw-alias-bg-layer-1': '#fbf6ee',
    '--dsw-alias-bg-layer-2': '#fffdf9',
    '--dsw-alias-bg-layer-3': '#f1e6d8',
    '--dsw-alias-bg-overlay': '#fffdf9',
    '--dsw-specific-sidebar-fill': '#f2e9dc',
    '--dsw-alias-markdown-code-segment-unselected': '#f1e6d8',
    '--dsw-alias-markdown-code-segment-selected': '#e6d5c2',
    '--dsw-alias-markdown-tag': '#f5ebdd',
    '--dsw-alias-markdown-placeholder': '#f5ebdd',
    '--dsw-specific-bubble': '#fbf6ee',
    '--dsw-alias-bg-multi-select': '#f5ebdd',
    '--dsw-alias-markdown-citation': '#fffdf9',
    '--dsw-alias-bg-module-platform': '#fffdf9',
    '--dsw-specific-selector': '#fffdf9',
    '--dsw-specific-tip': '#fffdf9',
    '--dsw-specific-bubble-highlight': '#fff8ef',
    '--dsw-specific-input-major': '#fffefb',
    '--dsw-specific-login-input': '#fffefb',
    '--dsw-alias-markdown-code-block': '#f3eadc',
    '--dsw-alias-markdown-code-block-banner': '#eadfce',
    '--dsw-alias-toast-bg': '#fffdf9',
    '--dsw-alias-tooltip-bg': '#2a1a16',
    '--dsw-alias-button-elevated-fill': '#fbf6ee',
    '--dsw-alias-button-floating-fill': '#fbf6ee',
    '--dsw-alias-label-primary': '#241612',
    '--dsw-alias-label-primary-dimmed': '#3b2823',
    '--dsw-alias-label-secondary': '#6b543f',
    '--dsw-alias-label-tertiary': '#8a7565',
    '--dsw-alias-label-caption': '#8a7565',
    '--dsw-alias-label-primary-bluish': '#9c2b1c',
    '--dsw-alias-link': '#9c2b1c',
    '--dsw-alias-brand-primary': '#b4311f',
    '--dsw-alias-brand-text': '#9c2b1c',
    '--dsw-alias-button-primary-fill': '#b4311f',
    '--dsw-alias-button-info-fill': '#9c2b1c',
    '--dsw-alias-button-contrast-fill': '#241612',
    '--dsw-alias-state-error-primary': '#b3261e',
    '--dsw-alias-state-warn-primary': '#a4610f',
    '--dsw-alias-state-warn-label': '#8a540d',
    '--dsw-alias-state-success-primary': '#2f7d4f',
    '--dsw-alias-state-business-primary': '#b4311f',
    '--dsw-alias-state-idle-primary': '#8a7565',
    '--dsw-alias-border-l1': '#efe3d4',
    '--dsw-alias-border-l2': '#e0cfba',
    '--dsw-alias-border-l2-darkmode-thin': '#e8dac6',
    '--dsw-alias-border-l3': '#cdb69d',
    '--dsw-alias-border-l4': '#b99e83',
    '--dsw-alias-button-ghost-active-border': '#b99e83',
    '--dsw-alias-code-diff-added': '#2f7d4f',
    '--dsw-alias-code-diff-deleted': '#b3261e',
    '--dsw-alias-file-diff-added-bg': 'rgba(47,125,79,.12)',
    '--dsw-alias-file-diff-added-gutter': 'rgba(47,125,79,.20)',
    '--dsw-alias-file-diff-added-marker': '#2f7d4f',
    '--dsw-alias-file-diff-deleted-bg': 'rgba(179,38,30,.10)',
    '--dsw-alias-file-diff-deleted-gutter': 'rgba(179,38,30,.18)',
    '--dsw-alias-file-diff-deleted-marker': '#b3261e',
    '--dsw-alias-menu-icon': '#6b543f',
    '--dsw-alias-toast-label': '#241612',
    '--dsw-alias-tooltip-key-bg': '#3b2823',
    '--dsw-alias-markdown-inline-code': 'transparent'
  }
}

const MOSS = {
  dark: {
    ...RED.dark,
    '--dsw-alias-bg-base': '#050806',
    '--dsw-alias-bg-layer-1': '#0a100d',
    '--dsw-alias-bg-layer-2': '#0e1612',
    '--dsw-alias-bg-layer-3': '#121c17',
    '--dsw-alias-bg-overlay': '#121c17',
    '--dsw-specific-sidebar-fill': '#060a08',
    '--dsw-alias-markdown-code-segment-unselected': '#0a100d',
    '--dsw-alias-markdown-code-segment-selected': '#153026',
    '--dsw-alias-markdown-tag': '#0d1712',
    '--dsw-alias-markdown-placeholder': '#0d1712',
    '--dsw-specific-bubble': '#0e1612',
    '--dsw-alias-bg-multi-select': '#0d1712',
    '--dsw-alias-markdown-citation': '#121c17',
    '--dsw-alias-bg-module-platform': '#121c17',
    '--dsw-specific-selector': '#121c17',
    '--dsw-specific-tip': '#121c17',
    '--dsw-specific-bubble-highlight': '#153026',
    '--dsw-specific-input-major': '#08120d',
    '--dsw-specific-login-input': '#08120d',
    '--dsw-alias-markdown-code-block': '#081009',
    '--dsw-alias-markdown-code-block-banner': '#0c1510',
    '--dsw-alias-toast-bg': '#121c17',
    '--dsw-alias-tooltip-bg': '#121c17',
    '--dsw-alias-button-elevated-fill': '#0d1712',
    '--dsw-alias-button-floating-fill': '#0d1712',
    '--dsw-alias-label-primary': '#e7f4ee',
    '--dsw-alias-label-primary-dimmed': '#c6ded4',
    '--dsw-alias-label-secondary': '#a3c0b5',
    '--dsw-alias-label-tertiary': '#7f9c90',
    '--dsw-alias-label-caption': '#7f9c90',
    '--dsw-alias-label-primary-bluish': '#7be7c0',
    '--dsw-alias-link': '#7be7c0',
    '--dsw-alias-brand-primary': '#46e3a6',
    '--dsw-alias-brand-text': '#7be7c0',
    '--dsw-alias-button-primary-fill': '#46e3a6',
    '--dsw-alias-button-info-fill': '#7be7c0',
    '--dsw-alias-button-contrast-fill': '#04120c',
    '--dsw-alias-state-error-primary': '#ff6b5a',
    '--dsw-alias-state-warn-primary': '#e9c46a',
    '--dsw-alias-state-warn-label': '#e9c46a',
    '--dsw-alias-state-success-primary': '#46e3a6',
    '--dsw-alias-state-business-primary': '#46e3a6',
    '--dsw-alias-state-idle-primary': '#7f9c90',
    '--dsw-alias-border-l1': '#122620',
    '--dsw-alias-border-l2': '#1c3a31',
    '--dsw-alias-border-l2-darkmode-thin': '#17302a',
    '--dsw-alias-border-l3': '#23503f',
    '--dsw-alias-border-l4': '#2c6450',
    '--dsw-alias-button-ghost-active-border': '#2c6450',
    '--dsw-alias-menu-icon': '#a3c0b5',
    '--dsw-alias-toast-label': '#e7f4ee',
    '--dsw-alias-tooltip-key-bg': '#153026'
  },
  light: {
    ...RED.light,
    '--dsw-alias-bg-base': '#f2f7f4',
    '--dsw-alias-bg-layer-1': '#f8fbf9',
    '--dsw-alias-bg-layer-2': '#ffffff',
    '--dsw-alias-bg-layer-3': '#e7f0eb',
    '--dsw-alias-bg-overlay': '#ffffff',
    '--dsw-specific-sidebar-fill': '#edf4f0',
    '--dsw-alias-label-primary': '#10211b',
    '--dsw-alias-label-primary-dimmed': '#24382f',
    '--dsw-alias-label-secondary': '#4a6157',
    '--dsw-alias-label-tertiary': '#6d857a',
    '--dsw-alias-label-caption': '#6d857a',
    '--dsw-alias-label-primary-bluish': '#0e8a5f',
    '--dsw-alias-link': '#0e8a5f',
    '--dsw-alias-brand-primary': '#0e8a5f',
    '--dsw-alias-brand-text': '#0b7350',
    '--dsw-alias-button-primary-fill': '#0e8a5f',
    '--dsw-alias-button-info-fill': '#0b7350',
    '--dsw-alias-button-contrast-fill': '#10211b',
    '--dsw-alias-state-business-primary': '#0e8a5f',
    '--dsw-alias-border-l1': '#e0ece6',
    '--dsw-alias-border-l2': '#cfded7',
    '--dsw-alias-border-l2-darkmode-thin': '#d9e6e0',
    '--dsw-alias-border-l3': '#a9c6b8',
    '--dsw-alias-border-l4': '#8fb2a2',
    '--dsw-alias-button-ghost-active-border': '#8fb2a2',
    '--dsw-alias-menu-icon': '#4a6157',
    '--dsw-alias-toast-label': '#10211b'
  }
}

export const THEMES = { '550w': RED, moss: MOSS }

/** 全局小补丁：选区色、滚动条；不碰任何组件几何。 */
export const EXTRA_CSS = [
  'html body ::selection{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 32%, transparent);color:var(--dsw-alias-label-primary)}',
  'html{scrollbar-color:var(--dsw-alias-border-l3) transparent}',
  'html body{ --dsw-alias-markdown-inline-code: transparent }'
].join('\n')

/** 首屏关键样式：浅色放 :root，深色挂在 body[data-ds-dark-theme] —— 与宿主自己的写法一致。 */
export function themeCss(mode) {
  const theme = THEMES[mode]
  if (!theme) return ''
  const decl = (obj) => Object.entries(obj).map(([k, v]) => k + ':' + v).join(';')
  /* 特异性要压过宿主自己写在 body 上的 token：
     html body（0,0,2）> body（0,0,1）。深色再叠一层 body[data-ds-dark-theme]。 */
  return ':root,html body{' + decl(theme.light) + '}\n'
    + 'html body[data-ds-dark-theme]{' + decl(theme.dark) + '}'
}

/**
 * 给浏览器半：theme.overrideTokens 的 token 形状是**逐个变量**的
 *   { '--dsw-alias-x': { light, dark }, ... }
 * 不是 { light: {...}, dark: {...} } —— 后者会被主题服务直接拒掉。
 */
export function themePayload(mode) {
  const theme = THEMES[mode]
  if (!theme) return null
  const tokens = {}
  const names = new Set([...Object.keys(theme.light), ...Object.keys(theme.dark)])
  for (const key of names) {
    const light = theme.light[key]
    const dark = theme.dark[key]
    if (light === undefined && dark === undefined) continue
    const pair = {}
    if (light !== undefined) pair.light = light
    if (dark !== undefined) pair.dark = dark
    tokens[key] = pair
  }
  return { tokens, css: EXTRA_CSS }
}
