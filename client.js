/**
 * Client half of the UI background plugin.
 *
 * Two registrations share one store:
 *  - `settings.section` — the "UI设置" page: image library + display mode;
 *  - `shell.overlay`    — paints the selected image (wallpaper behind the
 *                         interface, or a click-through overlay above it).
 *
 * The Host (`index.js`) owns the content-addressed image library, so this
 * module only ever handles blob URLs and state snapshots.
 */
window.__ModuleLoader__.load({
  id: '@zhang/dsh-ui-background',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useRef, useSyncExternalStore } = React

    const NS = 'ui-background'
    const MAX_BYTES = 12 * 1024 * 1024
    const MAX_ITEMS = 10
    const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'
    const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

    const ZH = {
      nav: 'UI设置',
      heading: '界面背景',
      intro: '上传图片作为界面背景（最多 10 张，可随时切换）：壁纸模式图片在界面下方、面板半透明；浮层模式图片盖在界面上方。设置保存在本机，重启后仍然生效。',
      imageTitle: '背景图',
      imageHint: '支持 PNG、JPEG、WebP、GIF，单张不超过 12 MB。',
      empty: '还没有图片',
      add: '添加图片',
      refresh: '刷新图库',
      refreshOk: '已刷新：共 {total} 张（新增 {added}，移除 {removed}）',
      refreshOverflow: '超出 10 张上限，未纳入 {overflow} 张。',
      refreshFailed: '刷新失败，请重试。',
      remove: '删除',
      galleryHint: '点击缩略图切换背景，右上角 × 删除；最多 10 张。',
      limitReached: '最多保存 10 张图片，请先删除一张。',
      uploadDuplicate: '这张图已在库里，已切换。',
      uploadOk: '已添加并切换。',
      modeTitle: '显示方式',
      modeHint: '壁纸：图片在界面下方、面板半透明；浮层：图片盖在界面上方、按浓度叠加。',
      modeWallpaper: '壁纸',
      modeOverlay: '浮层',
      opacityWallpaperTitle: '界面透明度',
      opacityWallpaperHint: '数值越大，界面越透明、壁纸越明显；0% 恢复不透明界面。',
      opacityOverlayTitle: '图片浓度',
      opacityOverlayHint: '数值越大，图片越明显；图片在界面之上，过高会影响文字可读性。',
      dimTitle: '暗化遮罩',
      dimHint: '壁纸模式下压暗图片，提升文字可读性；0% 关闭。',
      rotateTitle: '轮换背景',
      rotateHint: '0 = 关闭轮换；最小 10 秒。',
      rotateIntervalLabel: '间隔',
      rotateOrderLabel: '顺序',
      rotateUnitSeconds: '秒',
      rotateUnitMinutes: '分钟',
      rotateSequential: '顺序',
      rotateRandom: '随机',
      enabledTitle: '启用背景',
      enabledHint: '关闭后保留图片，但不在界面上显示；可用下方的快捷键一键去除背景。',
      shortcutTitle: '去除背景快捷键',
      shortcutHint: '默认 Alt+C；点「修改」按下新组合键，「清除」可禁用。',
      shortcutRecording: '请按下新的组合键…（Esc 取消；至少一个修饰键，F1–F24 除外）',
      shortcutChange: '修改',
      shortcutClear: '清除',
      shortcutCancel: '取消',
      shortcutNone: '未设置',
      loading: '正在读取…',
      loadFailed: '读取背景设置失败，请刷新页面后重试。',
      saveFailed: '保存失败，请重试。',
      uploadFailed: '上传失败，请重试。',
      tooLarge: '图片超过 12 MB，请换一张更小的图片。',
      badType: '不支持的图片格式，请使用 PNG、JPEG、WebP 或 GIF。',
    }

    const EN = {
      nav: 'UI Settings',
      heading: 'Interface background',
      intro: 'Upload images as the interface background (up to 10, switchable anytime): Wallpaper puts the image behind the interface with semi-transparent panels; Overlay paints it above the interface. The setting is stored on this machine and survives a restart.',
      imageTitle: 'Background image',
      imageHint: 'PNG, JPEG, WebP or GIF, up to 12 MB each.',
      empty: 'No images yet',
      add: 'Add image',
      refresh: 'Refresh',
      refreshOk: 'Refreshed: {total} image(s), {added} added, {removed} removed',
      refreshOverflow: '{overflow} image(s) beyond the 10-image limit were left out.',
      refreshFailed: 'Refresh failed. Please try again.',
      remove: 'Delete',
      galleryHint: 'Click a thumbnail to switch, × to delete; up to 10 images.',
      limitReached: 'Up to 10 images. Remove one first.',
      uploadDuplicate: 'That image is already in the library and is now selected.',
      uploadOk: 'Image added and selected.',
      modeTitle: 'Display mode',
      modeHint: 'Wallpaper: the image sits behind the interface with semi-transparent panels. Overlay: the image covers the interface at the chosen strength.',
      modeWallpaper: 'Wallpaper',
      modeOverlay: 'Overlay',
      opacityWallpaperTitle: 'Interface opacity',
      opacityWallpaperHint: 'Higher values make the interface more transparent, so the wallpaper shows through; 0% restores an opaque interface.',
      opacityOverlayTitle: 'Image strength',
      opacityOverlayHint: 'Higher values make the image stronger; it sits above the interface, so very high values reduce text contrast.',
      dimTitle: 'Dim overlay',
      dimHint: 'Darkens the wallpaper to improve text readability; 0% disables it.',
      rotateTitle: 'Background rotation',
      rotateHint: '0 = off; minimum 10 seconds.',
      rotateIntervalLabel: 'Every',
      rotateOrderLabel: 'Order',
      rotateUnitSeconds: 'seconds',
      rotateUnitMinutes: 'minutes',
      rotateSequential: 'Sequential',
      rotateRandom: 'Random',
      enabledTitle: 'Enable background',
      enabledHint: 'Turn off to keep the images but hide them; the shortcut below clears the background.',
      shortcutTitle: 'Clear-background shortcut',
      shortcutHint: 'Default Alt+C. Click Change and press a new combination; Clear disables it.',
      shortcutRecording: 'Press the new combination… (Esc cancels; at least one modifier, except F1–F24)',
      shortcutChange: 'Change',
      shortcutClear: 'Clear',
      shortcutCancel: 'Cancel',
      shortcutNone: 'Not set',
      loading: 'Loading…',
      loadFailed: 'Could not read the background settings. Refresh the page and try again.',
      saveFailed: 'Save failed. Please try again.',
      uploadFailed: 'Upload failed. Please try again.',
      tooLarge: 'The image is larger than 12 MB. Choose a smaller one.',
      badType: 'Unsupported image format. Use PNG, JPEG, WebP or GIF.',
    }

    const S = {
      page: {
        boxSizing: 'border-box',
        maxWidth: 780,
        padding: '20px 2px 40px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        color: 'var(--dsw-alias-label-primary)',
      },
      header: { display: 'flex', flexDirection: 'column', gap: 6 },
      heading: { margin: 0, fontSize: 20, fontWeight: 600, lineHeight: '28px' },
      intro: { margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' },
      card: {
        boxSizing: 'border-box',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 20,
        padding: '16px 18px',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 12,
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      cardText: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 },
      label: { fontSize: 14, fontWeight: 500, lineHeight: '20px' },
      hint: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' },
      primaryButton: {
        height: 32,
        padding: '0 14px',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        background: 'var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary))',
        color: 'var(--dsw-alias-label-primary-foreground, var(--dsw-alias-bg-base))',
        fontSize: 13,
        fontWeight: 500,
      },
      secondaryButton: {
        height: 32,
        padding: '0 14px',
        cursor: 'pointer',
        borderRadius: 8,
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        border: '1px solid var(--dsw-alias-border-l1)',
        fontSize: 13,
      },
      emptyBox: {
        boxSizing: 'border-box',
        width: 168,
        height: 96,
        padding: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        borderRadius: 8,
        border: '1px dashed var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
        fontSize: 12,
        color: 'var(--dsw-alias-label-secondary)',
      },
      preview: {
        width: 168,
        height: 96,
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-l1)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundImage: 'none',
      },
      gallery: { width: '100%', display: 'flex', flexWrap: 'wrap', gap: 8, userSelect: 'none' },
      thumbWrap: { position: 'relative', width: 72, height: 48 },
      thumb: {
        boxSizing: 'border-box',
        width: '100%',
        height: '100%',
        padding: 0,
        overflow: 'hidden',
        cursor: 'pointer',
        borderRadius: 6,
        background: 'var(--dsw-alias-bg-layer-2)',
        display: 'block',
        userSelect: 'none',
      },
      thumbImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
      thumbRemove: {
        position: 'absolute',
        top: -5,
        right: -5,
        width: 18,
        height: 18,
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: '50%',
        cursor: 'pointer',
        fontSize: 12,
        background: 'var(--dsw-alias-bg-overlay)',
        color: 'var(--dsw-alias-label-secondary)',
      },
      galleryFoot: { width: '100%', display: 'flex', flexDirection: 'column', gap: 6 },
      opacityValue: {
        width: 44,
        textAlign: 'right',
        fontSize: 13,
        fontVariantNumeric: 'tabular-nums',
        color: 'var(--dsw-alias-label-secondary)',
      },
      slider: { width: 200, accentColor: 'var(--dsw-alias-brand-primary)', cursor: 'pointer' },
      input: {
        width: 74,
        height: 30,
        padding: '0 8px',
        boxSizing: 'border-box',
        borderRadius: 6,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 13,
      },
      select: {
        height: 30,
        padding: '0 8px',
        borderRadius: 6,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 13,
      },
      shortcutValue: {
        minWidth: 64,
        padding: '4px 10px',
        borderRadius: 6,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'var(--dsh-font-family-code, ui-monospace, Menlo, Consolas, monospace)',
        fontSize: 12,
        textAlign: 'center',
      },
      error: { fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-state-error-primary)' },
      notice: { fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-state-success-primary)', whiteSpace: 'nowrap' },
    }

    function api(path) {
      const relative = String(path).replace(/^\/+/, '')
      if (typeof document === 'undefined') return '/' + relative
      const url = new URL(relative, document.baseURI)
      // Keep the query: thumbnail uploads pass `?id=…` through this helper.
      return url.pathname + url.search
    }

    /**
     * The wallpaper is painted behind the app, so every surface that would
     * cover it has to become translucent. These values track the built-in
     * light/dark palettes (near-white and the #151517 boot canvas) and fade
     * toward transparent as the slider rises.
     */
    function glassTokens(amount) {
      const k = Math.min(1, Math.max(0, Number(amount) || 0))
      const alpha = (drop) => (1 - drop * k).toFixed(3)
      return {
        '--dsw-alias-bg-base': {
          light: 'rgba(255, 255, 255, ' + alpha(0.55) + ')',
          dark: 'rgba(21, 21, 23, ' + alpha(0.55) + ')',
        },
        '--dsw-alias-bg-layer-1': {
          light: 'rgba(250, 250, 251, ' + alpha(0.45) + ')',
          dark: 'rgba(30, 30, 34, ' + alpha(0.45) + ')',
        },
        '--dsw-alias-bg-layer-2': {
          light: 'rgba(245, 245, 247, ' + alpha(0.35) + ')',
          dark: 'rgba(38, 38, 43, ' + alpha(0.35) + ')',
        },
        '--dsw-alias-bg-overlay': {
          light: 'rgba(255, 255, 255, ' + alpha(0.12) + ')',
          dark: 'rgba(26, 26, 30, ' + alpha(0.12) + ')',
        },
        '--dsw-specific-sidebar-fill': {
          light: 'rgba(247, 248, 250, ' + alpha(0.5) + ')',
          dark: 'rgba(26, 26, 29, ' + alpha(0.5) + ')',
        },
      }
    }

    /**
     * The wallpaper is the document canvas: `body` (and the app root, when it
     * paints its own layer) carries the image, so the translucent surfaces
     * above it reveal the wallpaper.
     */
    function wallpaperCss(url, dim) {
      const alpha = Math.max(0, Math.min(1, Number(dim) || 0))
      const image = 'url("' + url + '")'
      const layers = alpha > 0
        ? 'linear-gradient(rgba(0,0,0,' + alpha.toFixed(3) + '),rgba(0,0,0,' + alpha.toFixed(3) + ')),' + image
        : image
      return 'body,#root{background-image:' + layers + ' !important;'
        + 'background-size:cover !important;background-position:center !important;'
        + 'background-repeat:no-repeat !important;background-attachment:fixed !important}'
    }

    const MODIFIER_CODES = new Set([
      'ControlLeft', 'ControlRight',
      'AltLeft', 'AltRight',
      'ShiftLeft', 'ShiftRight',
      'MetaLeft', 'MetaRight',
    ])

    /**
     * Canonical form: modifiers in Ctrl/Alt/Shift/Meta order, then event.code
     * (e.g. "Alt+KeyC"). Requires a modifier, except for F1–F24.
     */
    function canonicalShortcut(event) {
      if (!event || typeof event.code !== 'string' || event.code === '') return null
      const parts = []
      if (event.ctrlKey) parts.push('Ctrl')
      if (event.altKey) parts.push('Alt')
      if (event.shiftKey) parts.push('Shift')
      if (event.metaKey) parts.push('Meta')
      const isFunction = /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(event.code)
      if (parts.length === 0 && !isFunction) return null
      return parts.concat(event.code).join('+')
    }

    function parseShortcut(value) {
      if (typeof value !== 'string' || value === '') return null
      const parts = value.split('+')
      const code = parts.pop()
      if (!code) return null
      return {
        code,
        ctrl: parts.includes('Ctrl'),
        alt: parts.includes('Alt'),
        shift: parts.includes('Shift'),
        meta: parts.includes('Meta'),
      }
    }

    function matchesShortcut(event, parsed) {
      if (!parsed) return false
      return event.code === parsed.code
        && event.ctrlKey === parsed.ctrl
        && event.altKey === parsed.alt
        && event.shiftKey === parsed.shift
        && event.metaKey === parsed.meta
    }

    function shortcutLabel(value) {
      const parsed = parseShortcut(value)
      if (!parsed) return ''
      const parts = []
      if (parsed.ctrl) parts.push('Ctrl')
      if (parsed.alt) parts.push('Alt')
      if (parsed.shift) parts.push('Shift')
      if (parsed.meta) parts.push('Meta')
      parts.push(keyLabel(parsed.code))
      return parts.join('+')
    }

    function keyLabel(code) {
      if (code.startsWith('Key')) return code.slice(3)
      if (code.startsWith('Digit')) return code.slice(5)
      if (code.startsWith('Numpad')) return 'Num ' + code.slice(6)
      if (code === 'Space') return 'Space'
      if (code === 'Escape') return 'Esc'
      if (code === 'Backspace') return 'Backspace'
      if (code === 'Delete') return 'Del'
      if (code === 'Enter') return 'Enter'
      if (code === 'Tab') return 'Tab'
      return code
    }

    function clampRotateSeconds(value) {
      const number = Number(value)
      if (!Number.isFinite(number) || number <= 0) return 0
      return Math.min(24 * 60 * 60, Math.max(10, Math.round(number)))
    }

    function formatRotateValue(seconds, unit) {
      if (unit === 'minutes') {
        const minutes = seconds / 60
        return String(Number.isInteger(minutes) ? minutes : Math.round(minutes * 100) / 100)
      }
      return String(seconds)
    }

    /** Normalize a digits-only draft; null means "keep the stored value". */
    function normalizeRotateSeconds(raw, unit) {
      if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null
      let seconds = Number(raw)
      if (!Number.isFinite(seconds)) seconds = 86400
      if (unit === 'minutes') seconds *= 60
      if (seconds <= 0) return 0
      if (unit === 'seconds' && seconds < 10) return 10
      return Math.min(86400, Math.round(seconds))
    }

    /** Downscale to a small WebP/JPEG thumbnail; null when unsupported. */
    async function makeThumbnail(blob) {
      if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return null
      let bitmap = null
      try {
        bitmap = await createImageBitmap(blob)
        const max = 320
        const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
        const width = Math.max(1, Math.round(bitmap.width * scale))
        const height = Math.max(1, Math.round(bitmap.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) return null
        context.drawImage(bitmap, 0, 0, width, height)
        const webp = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82))
        if (webp) return webp
        return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
      } catch {
        return null
      } finally {
        if (bitmap && typeof bitmap.close === 'function') bitmap.close()
      }
    }

    function createStore(ctx) {
      const t = (key) => ctx.locale.bind(NS)(key)
      let state = {
        ready: false,
        busy: false,
        error: null,
        notice: null,
        enabled: true,
        mode: 'wallpaper',
        opacity: 0.2,
        overlayOpacity: 0.25,
        dim: 0,
        rotateSeconds: 0,
        rotateOrder: 'sequential',
        shortcut: 'Alt+KeyC',
        recording: false,
        currentId: null,
        items: [],
        thumbs: {},
        fullId: null,
        fullUrl: null,
        updatedAt: 0,
      }
      const listeners = new Set()
      const thumbUrls = {}
      const loadingThumbs = new Set()
      let saveTimer = 0
      let pendingPatch = {}
      let resetPending = false
      let fullSeq = 0

      function set(patch) {
        state = Object.assign({}, state, patch)
        for (const listener of [...listeners]) listener()
      }

      function subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }

      async function request(path, init) {
        const response = await fetch(api(path), Object.assign({ credentials: 'same-origin' }, init || {}))
        const text = await response.text()
        let body = null
        try {
          body = text ? JSON.parse(text) : null
        } catch {
          body = null
        }
        if (!response.ok) {
          const message = body && typeof body.error === 'string' ? body.error : 'HTTP ' + response.status
          throw new Error(message)
        }
        return body
      }

      function pruneThumbs(items) {
        const ids = new Set(items.map((item) => item.id))
        let removed = false
        for (const id of Object.keys(thumbUrls)) {
          if (ids.has(id)) continue
          const url = thumbUrls[id]
          delete thumbUrls[id]
          if (url) URL.revokeObjectURL(url)
          removed = true
        }
        if (removed) set({ thumbs: Object.assign({}, thumbUrls) })
      }

      async function uploadThumb(id, blob) {
        try {
          await request('/ui-background/thumbnail?id=' + encodeURIComponent(id), {
            method: 'POST',
            headers: { 'content-type': blob.type || 'image/webp' },
            body: blob,
          })
        } catch {
          /* a missing stored thumbnail is not fatal */
        }
      }

      async function ensureThumb(item) {
        const id = item && item.id
        if (!id || thumbUrls[id] || loadingThumbs.has(id)) return
        loadingThumbs.add(id)
        try {
          if (item.thumb) {
            const response = await fetch(api('/ui-background/thumb') + '?id=' + encodeURIComponent(id), {
              credentials: 'same-origin',
            })
            if (response.ok) {
              const blob = await response.blob()
              if (!state.items.some((entry) => entry.id === id)) return
              thumbUrls[id] = URL.createObjectURL(blob)
              set({ thumbs: Object.assign({}, thumbUrls) })
              return
            }
          }
          // No stored thumbnail: download the original once, downscale it, and
          // upload the small copy so later loads only fetch that.
          const response = await fetch(api('/ui-background/image') + '?id=' + encodeURIComponent(id), {
            credentials: 'same-origin',
          })
          if (!response.ok) return
          const full = await response.blob()
          if (!state.items.some((entry) => entry.id === id)) return
          const small = await makeThumbnail(full)
          if (!state.items.some((entry) => entry.id === id)) return
          if (small) {
            thumbUrls[id] = URL.createObjectURL(small)
            set({ thumbs: Object.assign({}, thumbUrls) })
            void uploadThumb(id, small)
          } else {
            thumbUrls[id] = URL.createObjectURL(full)
            set({ thumbs: Object.assign({}, thumbUrls) })
          }
        } catch {
          /* keep the placeholder */
        } finally {
          loadingThumbs.delete(id)
        }
      }

      function ensureGallery() {
        for (const item of state.items) void ensureThumb(item)
      }

      async function ensureFull(id) {
        if (!id) {
          const previous = state.fullUrl
          if (previous) URL.revokeObjectURL(previous)
          set({ fullId: null, fullUrl: null })
          return
        }
        if (state.fullId === id && state.fullUrl) return
        fullSeq += 1
        const sequence = fullSeq
        try {
          const response = await fetch(api('/ui-background/image') + '?id=' + encodeURIComponent(id), {
            credentials: 'same-origin',
          })
          if (!response.ok) throw new Error('HTTP ' + response.status)
          const blob = await response.blob()
          if (sequence !== fullSeq) return
          const previous = state.fullUrl
          set({ fullId: id, fullUrl: URL.createObjectURL(blob) })
          if (previous) URL.revokeObjectURL(previous)
        } catch {
          /* the background stays hidden until the next load */
        }
      }

      function apply(view) {
        if (!view || typeof view !== 'object') return
        const items = Array.isArray(view.items)
          ? view.items.filter((item) => item && typeof item.id === 'string')
          : []
        set({
          enabled: view.enabled === true,
          mode: view.mode === 'overlay' ? 'overlay' : 'wallpaper',
          opacity: typeof view.opacity === 'number' ? view.opacity : state.opacity,
          overlayOpacity: typeof view.overlayOpacity === 'number' ? view.overlayOpacity : state.overlayOpacity,
          dim: typeof view.dim === 'number' ? view.dim : state.dim,
          rotateSeconds: typeof view.rotateSeconds === 'number'
            ? clampRotateSeconds(view.rotateSeconds)
            : state.rotateSeconds,
          rotateOrder: view.rotateOrder === 'random'
            ? 'random'
            : (view.rotateOrder === 'sequential' ? 'sequential' : state.rotateOrder),
          shortcut: typeof view.shortcut === 'string' ? view.shortcut : state.shortcut,
          currentId: typeof view.currentId === 'string' ? view.currentId : null,
          updatedAt: typeof view.updatedAt === 'number' ? view.updatedAt : 0,
          items,
        })
        pruneThumbs(items)
        if (state.currentId) void ensureFull(state.currentId)
        else void ensureFull(null)
        scheduleRotation()
      }

      async function load() {
        try {
          apply(await request('/ui-background/state'))
          if (resetPending) {
            // A rescue shortcut fired before the initial snapshot landed;
            // let the reset win over that stale state.
            resetPending = false
            set({ opacity: 0, overlayOpacity: 0 })
            void persist({ opacity: 0, overlayOpacity: 0 })
          }
          set({ ready: true, error: null })
          scheduleRotation()
        } catch {
          set({ ready: true, error: t('loadFailed') })
        }
      }

      async function persist(patch) {
        try {
          apply(await request('/ui-background/state', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(patch),
          }))
        } catch {
          set({ error: t('saveFailed') })
        }
      }

      function clamp01(value) {
        return Math.min(1, Math.max(0, Number(value) || 0))
      }

      /** Debounce slider/mode writes into one PATCH per gesture. */
      function queuePatch(patch) {
        Object.assign(pendingPatch, patch)
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
          saveTimer = 0
          const body = pendingPatch
          pendingPatch = {}
          void persist(body)
        }, 240)
      }

      function setOpacity(value) {
        const next = clamp01(value)
        set({ opacity: next, error: null, notice: null })
        queuePatch({ opacity: next })
      }

      function setOverlayOpacity(value) {
        const next = clamp01(value)
        set({ overlayOpacity: next, error: null, notice: null })
        queuePatch({ overlayOpacity: next })
      }

      function setDim(value) {
        const next = clamp01(value)
        set({ dim: next, error: null, notice: null })
        queuePatch({ dim: next })
      }

      function setMode(mode) {
        const next = mode === 'overlay' ? 'overlay' : 'wallpaper'
        set({ mode: next, error: null, notice: null })
        queuePatch({ mode: next })
      }

      function setEnabled(enabled) {
        const next = enabled === true
        set({ enabled: next, error: null, notice: null })
        queuePatch({ enabled: next })
        scheduleRotation()
      }

      function setRotateSeconds(value) {
        const next = clampRotateSeconds(value)
        set({ rotateSeconds: next, error: null, notice: null })
        queuePatch({ rotateSeconds: next })
        scheduleRotation()
      }

      function setRotateOrder(value) {
        const next = value === 'random' ? 'random' : 'sequential'
        set({ rotateOrder: next, error: null, notice: null })
        queuePatch({ rotateOrder: next })
        scheduleRotation()
      }

      /**
       * Rescue shortcut (Alt+C): zero both modes immediately and persist
       * without the slider debounce, so a fully opaque overlay cannot trap
       * the interface.
       */
      function clearBackground() {
        if (saveTimer) {
          clearTimeout(saveTimer)
          saveTimer = 0
        }
        pendingPatch = {}
        if (!state.ready) resetPending = true
        set({ opacity: 0, overlayOpacity: 0, error: null, notice: null })
        void persist({ opacity: 0, overlayOpacity: 0 })
      }

      function clearNotice() {
        if (!state.notice) return
        set({ notice: null })
      }

      let rotationTimer = 0

      function clearRotationTimer() {
        if (rotationTimer) {
          clearTimeout(rotationTimer)
          rotationTimer = 0
        }
      }

      function canRotate() {
        return state.ready
          && state.enabled
          && state.rotateSeconds >= 10
          && state.items.length >= 2
          && (typeof document === 'undefined' || document.visibilityState !== 'hidden')
      }

      function scheduleRotation() {
        clearRotationTimer()
        if (!canRotate()) return
        rotationTimer = setTimeout(() => {
          rotationTimer = 0
          void rotateNext()
        }, state.rotateSeconds * 1000)
      }

      async function rotateNext() {
        if (!canRotate()) return
        const items = state.items
        const currentIndex = items.findIndex((item) => item.id === state.currentId)
        let nextIndex = 0
        if (state.rotateOrder === 'random') {
          if (items.length <= 1) return
          do {
            nextIndex = Math.floor(Math.random() * items.length)
          } while (nextIndex === currentIndex)
        } else {
          nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length
        }
        const next = items[nextIndex]
        if (next) await selectItem(next.id)
      }

      const onVisibilityChange = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          clearRotationTimer()
        } else {
          scheduleRotation()
        }
      }
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibilityChange)
      }

      function setShortcut(value) {
        const next = typeof value === 'string' ? value.slice(0, 64) : ''
        set({ shortcut: next, recording: false, error: null, notice: null })
        void persist({ shortcut: next })
      }

      function startRecording() {
        set({ recording: true, error: null, notice: null })
      }

      function cancelRecording() {
        if (!state.recording) return
        set({ recording: false })
      }

      async function selectItem(id) {
        if (!id || id === state.currentId || !state.items.some((item) => item.id === id)) {
          scheduleRotation()
          return
        }
        set({ error: null, notice: null })
        try {
          apply(await request('/ui-background/state', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ currentId: id }),
          }))
        } catch {
          set({ error: t('saveFailed') })
          scheduleRotation()
        }
      }

      async function reorder(ids) {
        if (!Array.isArray(ids) || ids.length !== state.items.length) return
        if (new Set(ids).size !== ids.length) return
        const byId = new Map(state.items.map((item) => [item.id, item]))
        const next = []
        for (const id of ids) {
          const item = byId.get(id)
          if (!item) return
          next.push(item)
        }
        const previous = state.items
        set({ items: next, error: null, notice: null })
        try {
          apply(await request('/ui-background/reorder', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ids }),
          }))
        } catch {
          set({ items: previous, error: t('saveFailed') })
        }
      }

      async function deleteItem(id) {
        if (!id) return
        set({ error: null, notice: null })
        try {
          apply(await request('/ui-background/image/' + encodeURIComponent(id), { method: 'DELETE' }))
        } catch {
          set({ error: t('saveFailed') })
        }
      }

      function refreshNotice(report) {
        const base = t('refreshOk')
          .replace('{total}', String(report && typeof report.total === 'number' ? report.total : state.items.length))
          .replace('{added}', String(report && typeof report.added === 'number' ? report.added : 0))
          .replace('{removed}', String(report && typeof report.removed === 'number' ? report.removed : 0))
        if (report && report.overflow > 0) {
          return base + ' ' + t('refreshOverflow').replace('{overflow}', String(report.overflow))
        }
        return base
      }

      async function refresh() {
        if (state.busy) return
        set({ busy: true, error: null, notice: null })
        try {
          const view = await request('/ui-background/rescan', { method: 'POST' })
          apply(view)
          set({ busy: false, notice: refreshNotice(view && view.rescan) })
        } catch {
          set({ busy: false, error: t('refreshFailed') })
        }
      }

      async function upload(file) {
        if (!file) return
        const type = String(file.type || '').toLowerCase()
        if (!ALLOWED.has(type)) {
          set({ error: t('badType'), notice: null })
          return
        }
        if (file.size > MAX_BYTES) {
          set({ error: t('tooLarge'), notice: null })
          return
        }
        if (state.items.length >= MAX_ITEMS) {
          set({ error: t('limitReached'), notice: null })
          return
        }
        set({ busy: true, error: null, notice: null })
        const thumb = await makeThumbnail(file)
        try {
          const view = await request('/ui-background/image', {
            method: 'POST',
            headers: {
              'content-type': type,
              'x-image-name': encodeURIComponent(file.name || ''),
            },
            body: file,
          })
          const id = view && typeof view.currentId === 'string' ? view.currentId : null
          if (thumb && id) {
            try {
              await request('/ui-background/thumbnail?id=' + encodeURIComponent(id), {
                method: 'POST',
                headers: { 'content-type': thumb.type || 'image/webp' },
                body: thumb,
              })
              const previous = thumbUrls[id]
              thumbUrls[id] = URL.createObjectURL(thumb)
              if (previous) URL.revokeObjectURL(previous)
              set({ thumbs: Object.assign({}, thumbUrls) })
            } catch {
              /* the gallery will lazily generate the thumbnail instead */
            }
          }
          apply(view)
          set({ busy: false, notice: view && view.duplicate ? t('uploadDuplicate') : t('uploadOk') })
        } catch (error) {
          const code = error && error.message
          set({ busy: false, error: code === 'limit-reached' ? t('limitReached') : t('uploadFailed') })
        }
      }

      function dispose() {
        clearRotationTimer()
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', onVisibilityChange)
        }
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = 0
        pendingPatch = {}
        loadingThumbs.clear()
        fullSeq += 1
        if (state.fullUrl) URL.revokeObjectURL(state.fullUrl)
        for (const id of Object.keys(thumbUrls)) {
          const url = thumbUrls[id]
          delete thumbUrls[id]
          if (url) URL.revokeObjectURL(url)
        }
        listeners.clear()
      }

      return {
        getSnapshot: () => state,
        subscribe,
        load,
        setOpacity,
        setOverlayOpacity,
        setDim,
        setRotateSeconds,
        setRotateOrder,
        setMode,
        setEnabled,
        clearBackground,
        clearNotice,
        setShortcut,
        startRecording,
        cancelRecording,
        upload,
        selectItem,
        reorder,
        deleteItem,
        refresh,
        ensureGallery,
        dispose,
      }
    }

    function createLocaleTicker(ctx) {
      let version = 0
      const listeners = new Set()
      ctx.effect(() => ctx.locale.subscribe(() => {
        version += 1
        for (const listener of [...listeners]) listener()
      }), 'ui-background: locale ticks')
      return {
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        getSnapshot() {
          return version
        },
      }
    }

    function createComponents(ctx, store, ticker) {
      function useStore() {
        return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
      }

      /** Follow the slider without re-composing the theme on every pixel. */
      function useThrottled(value, ms) {
        const [throttled, setThrottled] = React.useState(value)
        const last = React.useRef(0)
        React.useEffect(() => {
          const now = Date.now()
          const elapsed = now - last.current
          if (elapsed >= ms) {
            last.current = now
            setThrottled(value)
            return undefined
          }
          const timer = setTimeout(() => {
            last.current = Date.now()
            setThrottled(value)
          }, ms - elapsed)
          return () => clearTimeout(timer)
        }, [value, ms])
        return throttled
      }

      function Section() {
        const state = useStore()
        useSyncExternalStore(ticker.subscribe, ticker.getSnapshot, ticker.getSnapshot)
        const t = ctx.locale.bind(NS)
        const inputRef = useRef(null)
        const [rotateUnit, setRotateUnit] = React.useState('seconds')
        const [rotateDraft, setRotateDraft] = React.useState('0')
        const rotateUnitRef = React.useRef('seconds')
        const rotateEditing = React.useRef(false)
        const rotateUnitSynced = React.useRef(false)
        const dragIdRef = React.useRef(null)
        const [dragId, setDragId] = React.useState(null)
        const [dragOverId, setDragOverId] = React.useState(null)
        const items = Array.isArray(state.items) ? state.items : []
        const currentUrl = state.currentId
          ? (state.thumbs[state.currentId] || (state.fullId === state.currentId ? state.fullUrl : '') || '')
          : ''
        const hasCurrent = Boolean(state.currentId)
        const atLimit = items.length >= MAX_ITEMS
        const disabledStyle = state.busy ? { opacity: 0.6, cursor: 'default' } : null
        const wallpaper = state.mode !== 'overlay'
        const sliderValue = wallpaper ? state.opacity : state.overlayOpacity
        const sliderTitle = wallpaper ? t('opacityWallpaperTitle') : t('opacityOverlayTitle')
        const sliderHint = wallpaper ? t('opacityWallpaperHint') : t('opacityOverlayHint')
        const shortcutText = state.shortcut ? shortcutLabel(state.shortcut) : t('shortcutNone')

        React.useEffect(() => {
          if (!state.ready) return
          if (!rotateUnitSynced.current) {
            rotateUnitSynced.current = true
            const unit = state.rotateSeconds >= 60 && state.rotateSeconds % 60 === 0 ? 'minutes' : 'seconds'
            rotateUnitRef.current = unit
            setRotateUnit(unit)
            setRotateDraft(formatRotateValue(state.rotateSeconds, unit))
            return
          }
          if (rotateEditing.current) return
          setRotateDraft(formatRotateValue(state.rotateSeconds, rotateUnitRef.current))
        }, [state.ready, state.rotateSeconds])

        function commitRotateDraft() {
          const seconds = normalizeRotateSeconds(rotateDraft, rotateUnitRef.current)
          const next = seconds === null ? state.rotateSeconds : seconds
          if (next !== state.rotateSeconds) store.setRotateSeconds(next)
          setRotateDraft(formatRotateValue(next, rotateUnitRef.current))
          return next
        }

        function onRotateUnitChange(nextUnit) {
          if (nextUnit !== 'minutes' && nextUnit !== 'seconds') return
          if (nextUnit === rotateUnitRef.current) return
          const current = commitRotateDraft()
          rotateUnitRef.current = nextUnit
          rotateEditing.current = false
          let nextSeconds = current
          if (nextUnit === 'minutes' && current > 0) {
            const minutes = Math.max(1, Math.round(current / 60))
            nextSeconds = minutes * 60
            if (nextSeconds !== current) store.setRotateSeconds(nextSeconds)
          }
          setRotateUnit(nextUnit)
          setRotateDraft(formatRotateValue(nextSeconds, nextUnit))
        }

        function onRotateDraftChange(event) {
          rotateEditing.current = true
          const raw = String(event.target.value)
          if (!/^\d*$/.test(raw)) return
          setRotateDraft(raw.replace(/^0+(?=\d)/, ''))
        }

        function onRotateDraftBlur() {
          rotateEditing.current = false
          commitRotateDraft()
        }

        function onRotateDraftKeyDown(event) {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
            return
          }
          if (event.key === 'Escape') {
            rotateEditing.current = false
            setRotateDraft(formatRotateValue(state.rotateSeconds, rotateUnitRef.current))
            event.currentTarget.blur()
          }
        }

        React.useEffect(() => {
          if (!state.recording) return undefined
          const onKeyDown = (event) => {
            event.preventDefault()
            event.stopPropagation()
            if (event.key === 'Escape') {
              store.cancelRecording()
              return
            }
            if (event.repeat) return
            if (!event.code || MODIFIER_CODES.has(event.code)) return
            const next = canonicalShortcut(event)
            if (!next) return
            store.setShortcut(next)
          }
          window.addEventListener('keydown', onKeyDown, true)
          return () => {
            window.removeEventListener('keydown', onKeyDown, true)
            store.cancelRecording()
          }
        }, [state.recording])

        React.useEffect(() => {
          void store.ensureGallery()
        }, [state.items])

        React.useLayoutEffect(() => {
          store.clearNotice()
          return () => store.clearNotice()
        }, [])

        function onThumbDragStart(event, item) {
          event.stopPropagation()
          dragIdRef.current = item.id
          setDragId(item.id)
          setDragOverId(null)
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('application/x-dsh-ui-background', item.id)
        }

        function onThumbDragEnd() {
          dragIdRef.current = null
          setDragId(null)
          setDragOverId(null)
        }

        function onThumbDragOver(event, item) {
          const source = dragIdRef.current
          if (!source || source === item.id) return
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = 'move'
          if (dragOverId !== item.id) setDragOverId(item.id)
        }

        function onThumbDragLeave(event, item) {
          if (event.currentTarget.contains(event.relatedTarget)) return
          if (dragOverId === item.id) setDragOverId(null)
        }

        function onThumbDrop(event, item) {
          event.preventDefault()
          event.stopPropagation()
          const source = dragIdRef.current
          dragIdRef.current = null
          setDragId(null)
          setDragOverId(null)
          if (!source || source === item.id) return
          const list = state.items.slice()
          const from = list.findIndex((entry) => entry.id === source)
          const target = list.findIndex((entry) => entry.id === item.id)
          if (from < 0 || target < 0) return
          const [moved] = list.splice(from, 1)
          const targetAfterRemoval = target - (from < target ? 1 : 0)
          const rect = event.currentTarget.getBoundingClientRect()
          const after = event.clientX > rect.left + rect.width / 2
          list.splice(targetAfterRemoval + (after ? 1 : 0), 0, moved)
          void store.reorder(list.map((entry) => entry.id))
        }

        function onPick(event) {
          const file = event.target.files && event.target.files[0]
          if (file) void store.upload(file)
          event.target.value = ''
        }

        function modeButton(mode, label) {
          const selected = (state.mode === 'overlay') === (mode === 'overlay')
          return h('button', {
            type: 'button',
            'aria-pressed': selected,
            onClick: () => store.setMode(mode),
            style: {
              height: 28,
              padding: '0 12px',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              background: selected
                ? 'var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary))'
                : 'transparent',
              color: selected
                ? 'var(--dsw-alias-label-primary-foreground, var(--dsw-alias-bg-base))'
                : 'var(--dsw-alias-label-secondary)',
            },
          }, label)
        }

        return h('div', { style: S.page },
          h('div', { style: S.header },
            h('h2', { style: S.heading }, t('heading')),
            h('p', { style: S.intro }, t('intro')),
            !state.ready ? h('p', { style: S.hint }, t('loading')) : null
          ),

          h('div', { style: S.card },
            h('div', { style: S.cardText },
              h('div', { style: S.label }, t('imageTitle')),
              h('div', { style: S.hint }, t('imageHint'))
            ),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 14 } },
              h('div', {
                role: 'img',
                'aria-label': t('imageTitle'),
                style: currentUrl
                  ? Object.assign({}, S.preview, { backgroundImage: 'url("' + currentUrl + '")' })
                  : S.emptyBox,
              }, currentUrl ? null : (items.length > 0 ? t('loading') : t('empty'))),
              h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' } },
                h('button', {
                  type: 'button',
                  onClick: () => { if (inputRef.current) inputRef.current.click() },
                  disabled: state.busy || atLimit,
                  style: Object.assign({}, S.primaryButton, (state.busy || atLimit) ? disabledStyle || { opacity: 0.6, cursor: 'default' } : null),
                }, t('add')),
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap' } },
                  h('button', {
                    type: 'button',
                    onClick: () => { void store.refresh() },
                    disabled: state.busy,
                    style: Object.assign({}, S.secondaryButton, disabledStyle),
                  }, t('refresh')),
                  state.notice
                    ? h('span', {
                        role: 'status',
                        'aria-live': 'polite',
                        style: S.notice,
                      }, state.notice)
                    : null
                )
              )
            ),
            h('div', { style: S.galleryFoot },
              items.length > 0
                ? h('div', { style: S.gallery }, items.map((item) => {
                    const thumb = state.thumbs[item.id]
                    const selected = item.id === state.currentId
                    return h('div', {
                      key: item.id,
                      style: Object.assign({}, S.thumbWrap,
                        dragId === item.id ? { opacity: 0.35 } : {},
                        dragOverId === item.id ? { outline: '2px dashed var(--dsw-alias-brand-primary)', outlineOffset: 2 } : {}),
                      onDragOver: (event) => onThumbDragOver(event, item),
                      onDragLeave: (event) => onThumbDragLeave(event, item),
                      onDrop: (event) => onThumbDrop(event, item),
                    },
                      h('button', {
                        type: 'button',
                        draggable: true,
                        title: item.name || '',
                        'aria-label': item.name || item.id,
                        'aria-pressed': selected,
                        onClick: () => { void store.selectItem(item.id) },
                        onDragStart: (event) => onThumbDragStart(event, item),
                        onDragEnd: onThumbDragEnd,
                        style: Object.assign({}, S.thumb, {
                          border: selected
                            ? '2px solid var(--dsw-alias-brand-primary)'
                            : '1px solid var(--dsw-alias-border-l1)',
                          cursor: 'grab',
                        }),
                      }, thumb ? h('img', { src: thumb, alt: '', draggable: false, style: S.thumbImg }) : null),
                      h('button', {
                        type: 'button',
                        draggable: false,
                        'aria-label': t('remove'),
                        title: t('remove'),
                        onDragStart: (event) => event.stopPropagation(),
                        onClick: () => { void store.deleteItem(item.id) },
                        style: S.thumbRemove,
                      }, '×')
                    )
                  }))
                : null,
              h('div', { style: S.hint },
                (atLimit ? t('limitReached') : t('galleryHint')) + '  ·  ' + items.length + ' / ' + MAX_ITEMS)
            )
          ),

          h('input', {
            ref: inputRef,
            type: 'file',
            accept: ACCEPT,
            style: { display: 'none' },
            onChange: onPick,
          }),

          h('div', { style: S.card },
            h('div', { style: S.cardText },
              h('div', { style: S.label }, t('modeTitle')),
              h('div', { style: S.hint }, t('modeHint'))
            ),
            h('div', {
              role: 'group',
              'aria-label': t('modeTitle'),
              style: {
                display: 'flex',
                gap: 4,
                padding: 3,
                borderRadius: 8,
                background: 'var(--dsw-alias-bg-layer-2)',
              },
            },
              modeButton('wallpaper', t('modeWallpaper')),
              modeButton('overlay', t('modeOverlay'))
            )
          ),

          h('div', { style: S.card },
            h('div', { style: S.cardText },
              h('div', { style: S.label }, sliderTitle),
              h('div', { style: S.hint }, sliderHint)
            ),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
              h('input', {
                type: 'range',
                min: 0,
                max: 100,
                step: 1,
                value: Math.round(sliderValue * 100),
                disabled: !hasCurrent,
                'aria-label': sliderTitle,
                onChange: (event) => {
                  const next = Number(event.target.value) / 100
                  if (wallpaper) store.setOpacity(next)
                  else store.setOverlayOpacity(next)
                },
                style: hasCurrent ? S.slider : Object.assign({}, S.slider, { opacity: 0.5, cursor: 'default' }),
              }),
              h('span', { style: S.opacityValue }, Math.round(sliderValue * 100) + '%')
            )
          ),

          wallpaper ? h('div', { style: S.card },
            h('div', { style: S.cardText },
              h('div', { style: S.label }, t('dimTitle')),
              h('div', { style: S.hint }, t('dimHint'))
            ),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
              h('input', {
                type: 'range',
                min: 0,
                max: 100,
                step: 1,
                value: Math.round(state.dim * 100),
                disabled: !hasCurrent,
                'aria-label': t('dimTitle'),
                onChange: (event) => store.setDim(Number(event.target.value) / 100),
                style: hasCurrent ? S.slider : Object.assign({}, S.slider, { opacity: 0.5, cursor: 'default' }),
              }),
              h('span', { style: S.opacityValue }, Math.round(state.dim * 100) + '%')
            )
          ) : null,

          h('div', { style: S.card },
            h('div', { style: S.cardText },
              h('div', { style: S.label }, t('rotateTitle')),
              h('div', { style: S.hint }, t('rotateHint'))
            ),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                h('span', { style: S.hint }, t('rotateIntervalLabel')),
                h('input', {
                  type: 'text',
                  inputMode: 'numeric',
                  pattern: '[0-9]*',
                  autoComplete: 'off',
                  value: rotateDraft,
                  'aria-label': t('rotateIntervalLabel'),
                  onFocus: () => { rotateEditing.current = true },
                  onChange: onRotateDraftChange,
                  onBlur: onRotateDraftBlur,
                  onKeyDown: onRotateDraftKeyDown,
                  style: S.input,
                }),
                h('select', {
                  value: rotateUnit,
                  'aria-label': t('rotateIntervalLabel'),
                  onChange: (event) => onRotateUnitChange(event.target.value),
                  style: S.select,
                },
                  h('option', { value: 'seconds' }, t('rotateUnitSeconds')),
                  h('option', { value: 'minutes' }, t('rotateUnitMinutes'))
                )
              ),
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                h('span', { style: S.hint }, t('rotateOrderLabel')),
                h('select', {
                  value: state.rotateOrder,
                  'aria-label': t('rotateOrderLabel'),
                  onChange: (event) => store.setRotateOrder(event.target.value),
                  style: S.select,
                },
                  h('option', { value: 'sequential' }, t('rotateSequential')),
                  h('option', { value: 'random' }, t('rotateRandom'))
                )
              )
            )
          ),

          h('div', { style: S.card },
            h('div', { style: S.cardText },
              h('div', { style: S.label }, t('enabledTitle')),
              h('div', { style: S.hint }, t('enabledHint'))
            ),
            h('button', {
              type: 'button',
              role: 'switch',
              'aria-checked': state.enabled,
              'aria-label': t('enabledTitle'),
              onClick: () => store.setEnabled(!state.enabled),
              style: {
                position: 'relative',
                width: 36,
                height: 20,
                padding: 0,
                border: 'none',
                borderRadius: 999,
                cursor: 'pointer',
                background: state.enabled
                  ? 'var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary))'
                  : 'var(--dsw-alias-border-l2)',
                transition: 'background 120ms ease',
              },
            }, h('span', {
              style: {
                position: 'absolute',
                top: 2,
                left: state.enabled ? 18 : 2,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: 'var(--dsw-alias-label-primary-foreground, var(--dsw-alias-bg-base))',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.25)',
                transition: 'left 120ms ease',
              },
            }))
          ),

          h('div', { style: S.card },
            h('div', { style: S.cardText },
              h('div', { style: S.label }, t('shortcutTitle')),
              h('div', { style: S.hint }, state.recording ? t('shortcutRecording') : t('shortcutHint'))
            ),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
              h('span', { style: S.shortcutValue }, shortcutText),
              state.recording
                ? h('button', {
                    type: 'button',
                    onClick: () => store.cancelRecording(),
                    style: S.secondaryButton,
                  }, t('shortcutCancel'))
                : h('button', {
                    type: 'button',
                    onClick: () => store.startRecording(),
                    disabled: state.busy,
                    style: Object.assign({}, S.secondaryButton, disabledStyle),
                  }, t('shortcutChange')),
              state.recording ? null : h('button', {
                type: 'button',
                onClick: () => store.setShortcut(''),
                disabled: state.busy || !state.shortcut,
                style: Object.assign({}, S.secondaryButton, (state.busy || !state.shortcut) ? { opacity: 0.6, cursor: 'default' } : null),
              }, t('shortcutClear'))
            )
          ),

          state.error ? h('div', { role: 'alert', style: S.error }, state.error) : null
        )
      }

      /**
       * Two render paths share one image:
       *  - wallpaper: the image paints on `body,#root` behind the app, and the
       *    surface tokens turn translucent so it shows through the panels;
       *  - overlay: a fixed, click-through div above the interface.
       * The effect must run before the early return: hooks cannot be skipped.
       */
      function Layer() {
        const state = useStore()
        const wallpaper = state.mode !== 'overlay'
        const currentUrl = state.fullId === state.currentId ? state.fullUrl : null
        const amount = wallpaper ? state.opacity : state.overlayOpacity
        const active = state.ready && state.enabled && Boolean(currentUrl) && amount > 0
        const throttled = useThrottled(amount, 80)

        React.useEffect(() => {
          if (!active || !wallpaper) return undefined
          if (!ctx.theme || typeof ctx.theme.overrideTokens !== 'function') return undefined
          let dispose = null
          try {
            dispose = ctx.theme.overrideTokens('ui-background', glassTokens(throttled))
          } catch (error) {
            if (typeof console !== 'undefined') console.warn('[ui-background] token override failed', error)
          }
          return () => {
            if (typeof dispose === 'function') {
              try {
                dispose()
              } catch {
                /* the layer is already gone */
              }
            }
          }
        }, [active, wallpaper, throttled])

        if (!active) return null
        if (wallpaper) {
          return h('style', {
            'data-ui-background': 'wallpaper',
            dangerouslySetInnerHTML: { __html: wallpaperCss(currentUrl, state.dim) },
          })
        }
        return h('div', {
          'aria-hidden': 'true',
          style: {
            position: 'fixed',
            inset: 0,
            pointerEvents: 'none',
            backgroundImage: 'url("' + currentUrl + '")',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            opacity: state.overlayOpacity,
            transition: 'opacity 160ms ease',
          },
        })
      }

      return { Section, Layer }
    }

    return {
      inject: ['slots', 'locale', 'theme'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'ui-background: dictionaries')
        const store = createStore(ctx)
        const ticker = createLocaleTicker(ctx)
        const { Section, Layer } = createComponents(ctx, store, ticker)

        ctx.effect(() => {
          void store.load()
          return () => store.dispose()
        }, 'ui-background: state')

        ctx.effect(() => {
          if (typeof window === 'undefined') return undefined
          const onKeyDown = (event) => {
            const snapshot = store.getSnapshot()
            if (snapshot.recording) return
            if (event.repeat || event.isComposing) return
            if (!matchesShortcut(event, parseShortcut(snapshot.shortcut))) return
            event.preventDefault()
            store.clearBackground()
          }
          window.addEventListener('keydown', onKeyDown, true)
          return () => window.removeEventListener('keydown', onKeyDown, true)
        }, 'ui-background: clear-background shortcut')

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'ui-background',
          order: 30,
          label: () => ctx.locale.bind(NS)('nav'),
        }, Section))

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'ui-background-layer',
          order: -100,
        }, Layer))
      },
    }
  },
})
