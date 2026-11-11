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
    const UNDO_MS = 10 * 1000
    /** Cross-fade length when the background image changes (rotation/manual). */
    const CROSSFADE_MS = 480
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
      deleteTitle: '删除这张图片？',
      deleteBody: '删除后 10 秒内可以撤销；撤销会恢复图片和它在图库中的位置。',
      deleteCurrentWarn: '这是当前背景，删除后会自动切换到其他图片。',
      deleteCancel: '取消',
      deleteConfirm: '删除',
      deleteUndoToast: '已删除「{name}」',
      deleteUndoAction: '撤销',
      deleteUndoFailed: '撤销失败，请重新添加图片。',
      deleteUndoLimit: '撤销失败：图库已满 10 张。',
      deleteNoUndo: '已删除「{name}」（原图过大或读取失败，无法撤销）。',
      unnamed: '未命名图片',
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
      widgetTitle: '小挂件',
      widgetHint: '在界面右上角显示当前工作时长，可拖动到任意位置。',
      widgetEnable: '显示小挂件',
      widgetEnableHint: '关闭后计时清零，下次启动 DSH 不显示。',
      widgetStyle: '样式',
      widgetStyleHint: '10 套样式，深浅主题自动适配。',
      widgetHideLabel: '隐藏文字',
      widgetHideLabelHint: '隐藏后只显示时间，挂件变成紧凑胶囊。',
      widgetLabel: '文字',
      widgetLabelHint: '最多 5 个字，留空不保存。',
      widgetLabelEmpty: '文字不能为空。',
      widgetLabelTooLong: '最多 5 个字。',
      widgetStyleAria: '选择小挂件样式',
      widgetPicked: '已选样式：{name}',
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
      deleteTitle: 'Delete this image?',
      deleteBody: 'You can undo for 10 seconds; undo restores the image and its place in the gallery.',
      deleteCurrentWarn: 'This is the current background; another image will be selected after deleting it.',
      deleteCancel: 'Cancel',
      deleteConfirm: 'Delete',
      deleteUndoToast: 'Deleted “{name}”',
      deleteUndoAction: 'Undo',
      deleteUndoFailed: 'Undo failed. Please add the image again.',
      deleteUndoLimit: 'Undo failed: the gallery is full (10 images).',
      deleteNoUndo: 'Deleted “{name}” (the original could not be kept for undo).',
      unnamed: 'Untitled image',
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
      widgetTitle: 'Work widget',
      widgetHint: 'Shows the current work time at the top-right of the interface; drag it anywhere.',
      widgetEnable: 'Show widget',
      widgetEnableHint: 'Turning it off resets the clock, and the next DSH start keeps it hidden.',
      widgetStyle: 'Style',
      widgetStyleHint: '10 styles; dark and light themes adapt automatically.',
      widgetHideLabel: 'Hide caption',
      widgetHideLabelHint: 'Shows the time only, as a compact pill.',
      widgetLabel: 'Caption',
      widgetLabelHint: 'Up to 5 characters; empty is not saved.',
      widgetLabelEmpty: 'The caption cannot be empty.',
      widgetLabelTooLong: 'Up to 5 characters.',
      widgetStyleAria: 'Pick a widget style',
      widgetPicked: 'Selected style: {name}',
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
      backdrop: {
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(8, 8, 10, 0.45)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        animation: 'ui-bg-fade-in 140ms ease-out',
      },
      dialog: {
        boxSizing: 'border-box',
        width: 424,
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 22,
        borderRadius: 16,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1))',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.38), 0 2px 10px rgba(0, 0, 0, 0.18)',
        animation: 'ui-bg-pop-in 170ms cubic-bezier(0.2, 0.9, 0.3, 1.15)',
      },
      dialogTitle: { margin: 0, fontSize: 16, fontWeight: 600, lineHeight: '24px' },
      dialogBody: { display: 'flex', alignItems: 'center', gap: 12 },
      dialogThumb: {
        flex: '0 0 auto',
        width: 56,
        height: 56,
        borderRadius: 10,
        border: '1px solid var(--dsw-alias-border-l1)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: 'var(--dsw-alias-bg-layer-2)',
      },
      dialogInfo: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
      dialogName: {
        fontSize: 13,
        fontWeight: 500,
        lineHeight: '19px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      dialogMeta: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' },
      dialogWarn: {
        margin: 0,
        boxSizing: 'border-box',
        padding: '9px 12px',
        borderRadius: 9,
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 12,
        lineHeight: '18px',
      },
      dialogFooter: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 },
      dangerButton: {
        height: 32,
        padding: '0 16px',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        background: 'var(--dsw-alias-state-error-primary, #d9534f)',
        color: '#fff',
        fontSize: 13,
        fontWeight: 500,
      },
      toast: {
        position: 'fixed',
        left: '50%',
        bottom: 28,
        zIndex: 1000,
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        maxWidth: 'calc(100vw - 48px)',
        padding: '10px 8px 10px 16px',
        overflow: 'hidden',
        borderRadius: 12,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1))',
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.3)',
        animation: 'ui-bg-toast-in 200ms cubic-bezier(0.2, 0.9, 0.3, 1.1)',
      },
      toastText: {
        fontSize: 13,
        lineHeight: '20px',
        color: 'var(--dsw-alias-label-primary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      toastAction: {
        flex: '0 0 auto',
        height: 28,
        padding: '0 10px',
        border: 'none',
        borderRadius: 7,
        cursor: 'pointer',
        background: 'transparent',
        color: 'var(--dsw-alias-brand-primary)',
        fontSize: 13,
        fontWeight: 600,
      },
      toastProgress: {
        position: 'absolute',
        left: 0,
        bottom: 0,
        height: 2,
        width: '100%',
        background: 'var(--dsw-alias-brand-primary)',
        transformOrigin: 'left center',
        animation: 'ui-bg-shrink 10s linear forwards',
      },
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

    /** Dim scrim + image, used by the canvas and by the cross-fade layer. */
    function imageLayers(url, dim) {
      const alpha = Math.max(0, Math.min(1, Number(dim) || 0))
      const image = 'url("' + url + '")'
      return alpha > 0
        ? 'linear-gradient(rgba(0,0,0,' + alpha.toFixed(3) + '),rgba(0,0,0,' + alpha.toFixed(3) + ')),' + image
        : image
    }

    /**
     * The wallpaper is the document canvas: `body` carries the image, so the
     * translucent surfaces above it reveal the wallpaper. `#root` must not
     * paint its own copy: the cross-fade layer sits between the two, so it
     * would be hidden by an opaque root background.
     */
    function wallpaperCss(url, dim) {
      return 'body{background-image:' + imageLayers(url, dim) + ' !important;'
        + 'background-size:cover !important;background-position:center !important;'
        + 'background-repeat:no-repeat !important;background-attachment:fixed !important}'
        + '#root{background-image:none !important;background-color:transparent !important}'
        + CROSSFADE_CSS
    }

    /** One fade layer: the previous image fading out over the new one. */
    const CROSSFADE_CSS = '@keyframes ui-bg-crossfade{from{opacity:var(--ui-bg-fade-from,1)}to{opacity:0}}'
      + '.ui-bg-crossfade{animation:ui-bg-crossfade 480ms ease-out forwards}'
      + '@media (prefers-reduced-motion: reduce){.ui-bg-crossfade{animation:none;opacity:0}}'

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

    /**
     * Dialogs must cover the whole window, including the sidebar, so they are
     * portalled to <body> when react-dom is available. Inline `position:fixed`
     * stays as the fallback: it still renders, only the stacking context of a
     * transformed ancestor could clip it.
     */
    let ReactDOM = null
    try {
      ReactDOM = require('react-dom')
    } catch {
      ReactDOM = null
    }

    function inBody(node) {
      if (typeof document === 'undefined' || !document.body) return node
      if (ReactDOM && typeof ReactDOM.createPortal === 'function') {
        return ReactDOM.createPortal(node, document.body)
      }
      return node
    }

    function formatBytes(bytes) {
      const value = Number(bytes)
      if (!Number.isFinite(value) || value <= 0) return ''
      if (value >= 1024 * 1024) {
        const mb = value / (1024 * 1024)
        return (mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)) + ' MB'
      }
      if (value >= 1024) return Math.round(value / 1024) + ' KB'
      return Math.round(value) + ' B'
    }

    // ---------------------------------------------------------------- widget
    /** 99 days, 23:59:59 — the clock freezes here. */
    const WIDGET_MAX_SECONDS = 99 * 86400 + 23 * 3600 + 59 * 60 + 59
    const WIDGET_LABEL_MAX = 5
    const WIDGET_STYLE_IDS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
    const WIDGET_STYLE_NAMES = {
      1: '石墨玻璃', 2: '纸感 / 墨', 3: '深空蓝', 4: '琥珀仪表', 5: '薄荷玻璃',
      6: '单色线框', 7: '纯色卡片', 8: '贴纸卡', 9: '极光环', 10: '柔光浮雕',
    }

    function pad2(value) {
      return String(Math.max(0, Math.floor(value))).padStart(2, '0')
    }

    /** `天:时:分:秒`, days capped at 99. */
    function formatWorkTime(seconds) {
      const total = Math.max(0, Math.min(WIDGET_MAX_SECONDS, Math.floor(Number(seconds) || 0)))
      return pad2(total / 86400 | 0) + ':' + pad2((total % 86400) / 3600 | 0)
        + ':' + pad2((total % 3600) / 60 | 0) + ':' + pad2(total % 60)
    }

    function normalizeWidgetLabel(value, fallback) {
      const base = typeof fallback === 'string' && fallback ? fallback : '工作时长'
      if (typeof value !== 'string') return base
      const chars = Array.from(value.trim())
      if (!chars.length) return base
      return chars.slice(0, WIDGET_LABEL_MAX).join('')
    }

    function normalizeWidgetStyle(value) {
      const id = typeof value === 'number' ? String(value) : String(value || '')
      return WIDGET_STYLE_IDS.indexOf(id) >= 0 ? id : '1'
    }

    /**
     * The ten skins. Each skin
     * has a dark and a light palette; the component picks one from the theme.
     */
    function widgetSkin(styleId, dark) {
      const id = normalizeWidgetStyle(styleId)
      if (id === '2') {
        return dark
          ? { box: { background: '#1B1E24', color: '#F2F4F8', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, boxShadow: '0 6px 18px rgba(0,0,0,.35)' }, labelOpacity: 0.55 }
          : { box: { background: '#FDFCF8', color: '#21262E', border: '1px solid #E4E0D6', borderRadius: 14, boxShadow: '0 6px 16px rgba(33,38,46,.08)' }, labelOpacity: 0.55 }
      }
      if (id === '3') {
        return dark
          ? { box: { background: '#0B1220', color: '#DCEBFA', border: '1px solid rgba(125,211,252,.20)', borderRadius: 14, boxShadow: '0 0 24px rgba(56,132,255,.16), inset 0 0 22px rgba(56,132,255,.05)' }, timeColor: '#7DD3FC' }
          : { box: { background: '#EAF2FF', color: '#123A5A', border: '1px solid #C9DDF7', borderRadius: 14, boxShadow: '0 8px 20px rgba(30,80,160,.10)' }, timeColor: '#0B5C8A' }
      }
      if (id === '4') {
        return dark
          ? { box: { background: '#17140F', color: '#F3E9DA', border: '1px solid rgba(245,199,126,.20)', borderRadius: 12 }, timeColor: '#F5C77E' }
          : { box: { background: '#FFF9EE', color: '#4A3418', border: '1px solid #F0DFC2', borderRadius: 12, boxShadow: '0 8px 20px rgba(120,80,20,.08)' }, timeColor: '#8A5410' }
      }
      if (id === '5') {
        return dark
          ? { box: { background: 'rgba(17,64,55,.56)', color: '#D9FBF0', border: '1px solid rgba(180,255,230,.16)', borderRadius: 18, backdropFilter: 'blur(14px) saturate(130%)', WebkitBackdropFilter: 'blur(14px) saturate(130%)', boxShadow: '0 12px 30px rgba(0,0,0,.30), inset 0 1px 0 rgba(255,255,255,.10)' }, timeColor: '#A7F3D0' }
          : { box: { background: 'rgba(255,255,255,.72)', color: '#0F3D36', border: '1px solid rgba(15,61,54,.10)', borderRadius: 18, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 12px 26px rgba(15,61,54,.10), inset 0 1px 0 #fff' }, timeColor: '#0F766E' }
      }
      if (id === '6') {
        return dark
          ? { box: { background: 'transparent', color: '#EDF1F7', border: '1px solid rgba(255,255,255,.22)', borderRadius: 10 }, labelOpacity: 0.5, labelSpacing: '0.26em', timeWeight: 400 }
          : { box: { background: 'transparent', color: '#101828', border: '1px solid rgba(16,24,40,.20)', borderRadius: 10 }, labelOpacity: 0.5, labelSpacing: '0.26em', timeWeight: 400 }
      }
      if (id === '7') {
        return dark
          ? { box: { background: '#15171C', color: '#F1F4F9', border: '1px solid rgba(255,255,255,.07)', borderRadius: 12 } }
          : { box: { background: '#FFFFFF', color: '#141A22', border: '1px solid #E6E9EE', borderRadius: 12, boxShadow: '0 8px 18px rgba(16,24,40,.07)' } }
      }
      if (id === '8') {
        return dark
          ? { box: { background: '#24272E', color: '#F7F9FC', border: '1px solid rgba(255,255,255,.10)', borderRadius: 16, boxShadow: '0 10px 22px rgba(0,0,0,.40), 0 1px 0 rgba(255,255,255,.08) inset' } }
          : { box: { background: '#FFFFFF', color: '#171C24', border: '1px solid #E7EAF0', borderRadius: 16, boxShadow: '0 10px 22px rgba(17,24,39,.12), 0 1px 0 #fff inset' } }
      }
      if (id === '9') {
        const ring = 'conic-gradient(from 210deg, #6FD3FF, #8B7CFF, #59E3B0, #FFD37A, #6FD3FF)'
        return dark
          ? { box: { background: 'linear-gradient(#0E1015,#0E1015) padding-box, ' + ring + ' border-box', color: '#EDF2F9', border: '1px solid transparent', borderRadius: 16, boxShadow: '0 12px 30px rgba(0,0,0,.34)' }, timeColor: '#DCEBFF' }
          : { box: { background: 'linear-gradient(#FFFFFF,#FFFFFF) padding-box, ' + ring + ' border-box', color: '#16202C', border: '1px solid transparent', borderRadius: 16, boxShadow: '0 12px 26px rgba(16,24,40,.10)' } }
      }
      if (id === '10') {
        return dark
          ? { box: { background: '#24272D', color: '#EDF1F7', borderRadius: 16, boxShadow: '6px 6px 14px rgba(0,0,0,.45), -4px -4px 12px rgba(255,255,255,.045), inset 0 1px 0 rgba(255,255,255,.04)' }, timeColor: '#C7D6EC' }
          : { box: { background: '#EEF1F6', color: '#1B2330', borderRadius: 16, boxShadow: '6px 6px 14px rgba(163,177,198,.45), -5px -5px 12px #FFFFFF' }, timeColor: '#2B4C77' }
      }
      return dark
        ? { box: { background: 'rgba(30,33,40,.74)', color: '#E7EBF2', border: '1px solid rgba(255,255,255,.10)', borderRadius: 16, backdropFilter: 'blur(12px) saturate(120%)', WebkitBackdropFilter: 'blur(12px) saturate(120%)', boxShadow: '0 10px 28px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.07)' } }
        : { box: { background: 'rgba(255,255,255,.78)', color: '#1B2430', border: '1px solid rgba(17,24,39,.09)', borderRadius: 16, backdropFilter: 'blur(12px) saturate(120%)', WebkitBackdropFilter: 'blur(12px) saturate(120%)', boxShadow: '0 10px 24px rgba(15,23,42,.10), inset 0 1px 0 #fff' } }
    }

    function widgetBoxStyle(skin, hide) {
      return Object.assign({
        boxSizing: 'border-box',
        width: hide ? 132 : 180,
        height: hide ? 48 : 72,
        padding: hide ? '0 10px' : '10px 13px',
        display: 'flex',
        flexDirection: hide ? 'row' : 'column',
        alignItems: hide ? 'center' : 'flex-start',
        justifyContent: 'center',
        gap: hide ? 0 : 3,
        textAlign: 'left',
        overflow: 'hidden',
        fontVariantNumeric: 'tabular-nums',
      }, skin.box)
    }

    function widgetLabelStyle(skin) {
      return {
        fontSize: 11,
        lineHeight: 1,
        letterSpacing: skin.labelSpacing || '0.16em',
        opacity: skin.labelOpacity === undefined ? 0.66 : skin.labelOpacity,
      }
    }

    function widgetTimeStyle(skin, hide) {
      return {
        fontFamily: 'ui-monospace, "Cascadia Mono", Consolas, monospace',
        fontSize: hide ? 17 : 23,
        lineHeight: 1.04,
        fontWeight: skin.timeWeight || 500,
        color: skin.timeColor || undefined,
      }
    }

    /** Theme detection: token colour first, then body background, then dark. */
    function readThemeDark() {
      if (typeof document === 'undefined') return true
      const root = document.documentElement
      const attr = String(root.getAttribute('data-theme') || root.getAttribute('data-color-mode') || '').toLowerCase()
      if (attr.indexOf('dark') >= 0) return true
      if (attr.indexOf('light') >= 0) return false
      const luminance = (value) => {
        const match = String(value || '').match(/rgba?\(([^)]+)\)/i)
        if (!match) return null
        const parts = match[1].split(',').map((part) => Number(part.trim()))
        if (parts.length < 3 || parts.some((part) => !Number.isFinite(part))) return null
        if (parts.length > 3 && parts[3] === 0) return null
        return (0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]) / 255 < 0.5
      }
      try {
        const token = getComputedStyle(root).getPropertyValue('--dsw-alias-bg-base')
        const byToken = luminance(token)
        if (byToken !== null) return byToken
        const byBody = luminance(getComputedStyle(document.body).backgroundColor)
        if (byBody !== null) return byBody
      } catch {
        /* fall through */
      }
      return true
    }

    function useDarkTheme() {
      const [dark, setDark] = React.useState(readThemeDark)
      React.useEffect(() => {
        const update = () => {
          const next = readThemeDark()
          setDark((prev) => (prev === next ? prev : next))
        }
        let observer = null
        if (typeof MutationObserver === "function" && typeof document !== "undefined") {
          // documentElement attributes only: never body, never subtree, so
          // the widget/preview styles we write cannot feed this observer back.
          observer = new MutationObserver((records) => {
            if (!records.length) return
            if (typeof requestAnimationFrame === "function") requestAnimationFrame(update)
            else setTimeout(update, 150)
          })
          observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class", "style", "data-theme", "data-color-mode"],
          })
        }
        const media = typeof window !== "undefined" && window.matchMedia
          ? window.matchMedia("(prefers-color-scheme: dark)")
          : null
        if (media && media.addEventListener) media.addEventListener("change", update)
        return () => {
          if (observer) observer.disconnect()
          if (media && media.removeEventListener) media.removeEventListener("change", update)
        }
      }, [])
      return dark
    }

    /**
     * Default anchor: just below the window's close button (or, when the
     * controls are native and therefore absent from the DOM, below a typical
     * titlebar), aligned near the right edge.
     *
     * `elementFromPoint` at the top-right corner tells us whether the harness
     * draws its own controls: if it hits a button-ish node we measure it,
     * otherwise we fall back to fixed offsets.
     */
    function measureWidgetAnchor() {
      // Matches the agreed default look: inside the content column, just
      // below the conversation header row, ~56px in from the right edge.
      const fallback = { top: 64, right: 56 }
      if (typeof window === 'undefined' || typeof document === 'undefined') return fallback
      const inset = 56
      try {
        // 1) The conversation header (对话 / 轨迹 / 上下文 / 编排 …) is the
        //    most stable anchor: sit 10px under it.
        let top = 0
        const header = document.querySelector('[role="tablist"]')
        if (header) {
          const rect = header.getBoundingClientRect()
          if (rect.height >= 8 && rect.bottom < 260) top = rect.bottom + 10
        }
        // 2) Fall back to the window buttons: 10px under the close button.
        if (!top) {
          const corner = window.innerWidth
          const probes = [[corner - 18, 18], [corner - 52, 18], [corner - 86, 18]]
          for (const probe of probes) {
            const hit = document.elementFromPoint(probe[0], probe[1])
            if (!hit || typeof hit.closest !== 'function') continue
            const button = hit.closest('button, [role="button"]')
            if (!button) continue
            const rect = button.getBoundingClientRect()
            if (rect.width < 8 || rect.height < 8 || rect.bottom > 120) continue
            top = rect.bottom + 10
            break
          }
        }
        if (top) return { top: Math.round(top), right: inset }
      } catch {
        /* fall back */
      }
      return fallback
    }

    /** Rendered size of the widget (with / without the caption row). */
    function widgetSize(hide) {
      return hide ? { width: 132, height: 48 } : { width: 180, height: 72 }
    }

    function clampWidgetPos(left, top, size) {
      if (typeof window === 'undefined') return { left: Math.max(0, left), top: Math.max(0, top) }
      const maxLeft = Math.max(8, window.innerWidth - size.width - 8)
      const maxTop = Math.max(8, window.innerHeight - size.height - 8)
      return {
        left: Math.min(maxLeft, Math.max(8, Math.round(left))),
        top: Math.min(maxTop, Math.max(8, Math.round(top))),
      }
    }

    /**
     * Stored drag position wins; otherwise anchor under the window controls.
     * Always clamped so a shrunken window cannot push the card off-screen.
     */
    function resolveWidgetPos(state, hide) {
      const size = widgetSize(hide)
      if (Number.isFinite(state.widgetX) && Number.isFinite(state.widgetY)) {
        return clampWidgetPos(state.widgetX, state.widgetY, size)
      }
      const anchor = measureWidgetAnchor()
      const width = typeof window === 'undefined' ? size.width : window.innerWidth
      return clampWidgetPos(width - anchor.right - size.width, anchor.top, size)
    }


    const UNITLESS_STYLES = new Set([
      'fontWeight', 'opacity', 'lineHeight', 'zIndex', 'flex', 'flexGrow', 'flexShrink',
      'order', 'zoom', 'gridRow', 'gridColumn', 'fontVariantNumeric', 'pointerEvents',
    ])

    function assignStyles(element, style) {
      for (const key of Object.keys(style)) {
        const value = style[key]
        if (value === undefined || value === null) continue
        if (typeof value === 'number') {
          element.style[key] = UNITLESS_STYLES.has(key) ? String(value) : value + 'px'
        } else {
          element.style[key] = String(value)
        }
      }
    }

    /**
     * The floating widget is plain DOM appended to `document.body` — same
     * approach as the whale widget. Rendering it inside a client Slot made
     * `position: fixed` resolve against a transformed ancestor, so the card
     * landed in the wrong corner and could only slide horizontally. Owning the
     * node also makes dragging and hit-testing straightforward.
     */
    function createWidgetController(store) {
      let node = null
      let labelNode = null
      let timeNode = null
      let timer = 0
      let startedAt = 0
      let running = false
      let drag = null
      let unsubscribe = null
      let observer = null
      let resizeHandler = null
      let defaultPos = null
      let rafId = 0
      let lastSkinKey = ''
      let lastLabel = null
      let lastText = ''
      let lastLeft = null
      let lastTop = null
      let lastDark = null

      function elapsed() {
        return running ? Math.floor((Date.now() - startedAt) / 1000) : 0
      }

      function updateTime() {
        if (!timeNode) return
        const text = formatWorkTime(elapsed())
        if (text === lastText) return
        lastText = text
        timeNode.textContent = text
      }

      function startClock() {
        if (running) return
        running = true
        startedAt = Date.now()
        if (timer) clearInterval(timer)
        timer = setInterval(updateTime, 1000)
      }

      function stopClock() {
        if (timer) {
          clearInterval(timer)
          timer = 0
        }
        running = false
        startedAt = 0
      }

      /**
       * Node and children are created exactly once. Later syncs only touch
       * textContent / style / left+top, so a quiet widget produces zero DOM
       * mutations per tick — the old full rebuild fed the host's body-wide
       * MutationObserver forever and froze the window.
       */
      function buildNode() {
        if (node || typeof document === 'undefined' || !document.body) return
        node = document.createElement('div')
        node.setAttribute('data-ui-background', 'widget')
        node.setAttribute('role', 'status')
        node.title = '拖动可移动小挂件'
        node.style.position = 'fixed'
        node.style.zIndex = '30'
        node.style.pointerEvents = 'auto'
        node.style.cursor = 'grab'
        node.style.touchAction = 'none'
        node.style.userSelect = 'none'
        node.addEventListener('pointerdown', onPointerDown)
        node.addEventListener('pointermove', onPointerMove)
        node.addEventListener('pointerup', endDrag)
        node.addEventListener('pointercancel', endDrag)

        labelNode = document.createElement('div')
        labelNode.textContent = ''
        node.appendChild(labelNode)
        timeNode = document.createElement('div')
        timeNode.textContent = ''
        node.appendChild(timeNode)

        lastSkinKey = ''
        lastLabel = null
        lastText = ''
        lastLeft = null
        lastTop = null
        document.body.appendChild(node)
      }

      function removeNode() {
        if (!node) return
        node.removeEventListener('pointerdown', onPointerDown)
        node.removeEventListener('pointermove', onPointerMove)
        node.removeEventListener('pointerup', endDrag)
        node.removeEventListener('pointercancel', endDrag)
        if (node.parentNode) node.parentNode.removeChild(node)
        node = null
        labelNode = null
        timeNode = null
        lastSkinKey = ''
        lastLabel = null
        lastText = ''
        lastLeft = null
        lastTop = null
        drag = null
      }

      function applySkin(skin, hide) {
        assignStyles(node, widgetBoxStyle(skin, hide))
        // Layout/stacking is owned by ensureNode(), not by the skin.
        node.style.position = 'fixed'
        node.style.pointerEvents = 'auto'
        node.style.cursor = drag ? 'grabbing' : 'grab'
        assignStyles(labelNode, widgetLabelStyle(skin))
        assignStyles(timeNode, widgetTimeStyle(skin, hide))
        labelNode.style.display = hide ? 'none' : ''
      }

      function widgetPosition(state, hide) {
        const size = widgetSize(hide)
        if (Number.isFinite(state.widgetX) && Number.isFinite(state.widgetY)) {
          return clampWidgetPos(state.widgetX, state.widgetY, size)
        }
        if (!defaultPos) defaultPos = resolveWidgetPos({ widgetX: null, widgetY: null }, hide)
        return clampWidgetPos(defaultPos.left, defaultPos.top, size)
      }

      function sync() {
        const state = store.getSnapshot()
        if (!state.ready || !state.widgetEnabled) {
          stopClock()
          removeNode()
          return
        }
        buildNode()
        if (!node) return

        const hide = state.widgetHideLabel === true
        const dark = readThemeDark()
        lastDark = dark
        const skinKey = state.widgetStyle + '|' + (hide ? '1' : '0') + '|' + (dark ? 'd' : 'l')
        if (skinKey !== lastSkinKey) {
          lastSkinKey = skinKey
          applySkin(widgetSkin(state.widgetStyle, dark), hide)
        }

        const label = state.widgetLabel
        if (label !== lastLabel) {
          lastLabel = label
          labelNode.textContent = label
        }

        const position = widgetPosition(state, hide)
        if (position.left !== lastLeft) {
          lastLeft = position.left
          node.style.left = position.left + 'px'
        }
        if (position.top !== lastTop) {
          lastTop = position.top
          node.style.top = position.top + 'px'
        }

        startClock()
        updateTime()
      }

      function onPointerDown(event) {
        if (!node) return
        if (event.button !== undefined && event.button !== 0) return
        const left = parseFloat(node.style.left) || 0
        const top = parseFloat(node.style.top) || 0
        drag = {
          offsetX: event.clientX - left,
          offsetY: event.clientY - top,
          pointerId: event.pointerId,
          left,
          top,
          moved: false,
        }
        node.style.cursor = 'grabbing'
        try { node.setPointerCapture(event.pointerId) } catch { /* ignore */ }
        event.preventDefault()
      }

      function onPointerMove(event) {
        if (!drag || !node) return
        if (event.pointerId !== undefined && event.pointerId !== drag.pointerId) return
        const hide = store.getSnapshot().widgetHideLabel === true
        const next = clampWidgetPos(
          event.clientX - drag.offsetX,
          event.clientY - drag.offsetY,
          widgetSize(hide),
        )
        if (next.left !== drag.left || next.top !== drag.top) drag.moved = true
        drag.left = next.left
        drag.top = next.top
        lastLeft = next.left
        lastTop = next.top
        node.style.left = next.left + 'px'
        node.style.top = next.top + 'px'
      }

      function endDrag() {
        if (!drag) return
        const finished = drag
        drag = null
        if (node) {
          node.style.cursor = 'grab'
          try { node.releasePointerCapture(finished.pointerId) } catch { /* ignore */ }
        }
        if (finished.moved) store.setWidgetPos(finished.left, finished.top)
      }

      /**
       * The only external trigger we watch is the theme. We observe
       * documentElement attributes ONLY (never body, never subtree), debounce
       * to one animation frame, and re-skin only when the resolved theme
       * actually flipped — so our own writes can never re-enter this.
       */
      function scheduleThemeCheck() {
        if (rafId) return
        const run = () => {
          rafId = 0
          const dark = readThemeDark()
          if (dark === lastDark) return
          lastDark = dark
          sync()
        }
        rafId = (typeof requestAnimationFrame === 'function')
          ? requestAnimationFrame(run)
          : setTimeout(run, 150)
      }

      function start() {
        if (typeof document === 'undefined' || !document.body) return
        unsubscribe = store.subscribe(sync)
        resizeHandler = () => { defaultPos = null; sync() }
        window.addEventListener('resize', resizeHandler)
        observer = new MutationObserver(scheduleThemeCheck)
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['class', 'style', 'data-theme', 'data-color-mode'],
        })
        sync()
      }

      function stop() {
        if (unsubscribe) unsubscribe()
        unsubscribe = null
        if (resizeHandler) window.removeEventListener('resize', resizeHandler)
        resizeHandler = null
        if (observer) observer.disconnect()
        observer = null
        if (rafId) {
          if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId)
          else clearTimeout(rafId)
          rafId = 0
        }
        stopClock()
        removeNode()
      }

      return { start, stop }
    }

    const MOTION_CSS = '@keyframes ui-bg-fade-in{from{opacity:0}to{opacity:1}}'
      + '@keyframes ui-bg-pop-in{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}'
      + '@keyframes ui-bg-toast-in{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}'
      + '@keyframes ui-bg-shrink{from{transform:scaleX(1)}to{transform:scaleX(0)}}'
      + '@media (prefers-reduced-motion: reduce){[data-ui-bg-motion]{animation:none !important}}'

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
        widgetEnabled: false,
        widgetStyle: '1',
        widgetLabel: '工作时长',
        widgetHideLabel: false,
        widgetX: null,
        widgetY: null,
        currentId: null,
        items: [],
        thumbs: {},
        fullId: null,
        fullUrl: null,
        fadeUrl: null,
        fadeKey: 0,
        updatedAt: 0,
        undo: null,
      }
      const listeners = new Set()
      const thumbUrls = {}
      const loadingThumbs = new Set()
      let saveTimer = 0
      let pendingPatch = {}
      let resetPending = false
      let fullSeq = 0
      let undoTimer = 0
      let fadeTimer = 0

      function set(patch) {
        state = Object.assign({}, state, patch)
        for (const listener of [...listeners]) {
          try {
            listener()
          } catch (error) {
            if (typeof console !== 'undefined') console.warn('[ui-background] listener failed', error)
          }
        }
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

      /**
       * Keep the outgoing image alive for one cross-fade, then revoke it. A
       * newer change revokes the still-fading URL immediately and takes over
       * the layer.
       */
      function beginCrossfade(url) {
        if (!url) return
        const stale = state.fadeUrl
        if (stale && stale !== url) URL.revokeObjectURL(stale)
        if (fadeTimer) clearTimeout(fadeTimer)
        fadeTimer = setTimeout(() => {
          fadeTimer = 0
          if (state.fadeUrl === url) set({ fadeUrl: null })
          URL.revokeObjectURL(url)
        }, CROSSFADE_MS + 160)
      }

      function clearCrossfade() {
        if (fadeTimer) {
          clearTimeout(fadeTimer)
          fadeTimer = 0
        }
        if (state.fadeUrl) {
          URL.revokeObjectURL(state.fadeUrl)
          set({ fadeUrl: null })
        }
      }

      async function ensureFull(id) {
        if (!id) {
          // Cancel in-flight loads: the wanted background is now "none".
          fullSeq += 1
          clearCrossfade()
          const previous = state.fullUrl
          if (previous) URL.revokeObjectURL(previous)
          set({ fullId: null, fullUrl: null, fadeUrl: null })
          return
        }
        if (state.fullId === id && state.fullUrl) {
          // Already showing the wanted image. Invalidate older in-flight loads
          // so a late response cannot replace it with another image (this is
          // what made "undo delete of a non-current image" hide the wallpaper).
          fullSeq += 1
          return
        }
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
          const nextUrl = URL.createObjectURL(blob)
          beginCrossfade(previous)
          set({
            fullId: id,
            fullUrl: nextUrl,
            fadeUrl: previous || null,
            fadeKey: state.fadeKey + 1,
          })
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
          widgetEnabled: view.widgetEnabled === true,
          widgetStyle: normalizeWidgetStyle(view.widgetStyle === undefined ? state.widgetStyle : view.widgetStyle),
          widgetLabel: normalizeWidgetLabel(view.widgetLabel, state.widgetLabel),
          widgetHideLabel: view.widgetHideLabel === true,
          widgetX: Number.isFinite(view.widgetX) ? Math.round(view.widgetX) : null,
          widgetY: Number.isFinite(view.widgetY) ? Math.round(view.widgetY) : null,
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
      let rotationDueAt = 0

      function clearRotationTimer() {
        if (rotationTimer) {
          clearTimeout(rotationTimer)
          rotationTimer = 0
        }
      }

      function canRotate() {
        // Deliberately no visibility check: a hidden/occluded window (Electron
        // may report the page as hidden) must still rotate, otherwise the first
        // interval after hiding never fires and the background looks stuck.
        return state.ready
          && state.enabled
          && state.rotateSeconds >= 10
          && state.items.length >= 2
      }

      /**
       * Wake at least every 30s instead of sleeping the whole interval: sleeps,
       * frozen pages and throttled timers then catch up instead of losing the
       * rotation entirely.
       */
      function armRotation() {
        if (!canRotate() || !rotationDueAt) return
        if (rotationTimer) clearTimeout(rotationTimer)
        const wait = Math.max(500, rotationDueAt - Date.now())
        rotationTimer = setTimeout(fireRotation, Math.min(wait, 30000))
      }

      function fireRotation() {
        rotationTimer = 0
        if (!canRotate()) return
        if (rotationDueAt && Date.now() < rotationDueAt) {
          armRotation()
          return
        }
        rotationDueAt = 0
        void rotateNext()
      }

      function scheduleRotation() {
        clearRotationTimer()
        rotationDueAt = 0
        if (!canRotate()) return
        rotationDueAt = Date.now() + state.rotateSeconds * 1000
        armRotation()
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
        if (typeof document === 'undefined') return
        if (document.visibilityState === 'hidden') {
          // Keep the timer running. It may be throttled while hidden, but the
          // due timestamp is authoritative and the next tick catches up.
          return
        }
        if (rotationDueAt && Date.now() >= rotationDueAt) {
          fireRotation()
          return
        }
        armRotation()
      }
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibilityChange)
      }

      function setShortcut(value) {
        const next = typeof value === 'string' ? value.slice(0, 64) : ''
        set({ shortcut: next, recording: false, error: null, notice: null })
        void persist({ shortcut: next })
      }

      function setWidgetEnabled(value) {
        const next = value === true
        set({ widgetEnabled: next, error: null, notice: null })
        void persist({ widgetEnabled: next })
      }

      function setWidgetStyle(value) {
        const next = normalizeWidgetStyle(value)
        set({ widgetStyle: next, error: null, notice: null })
        void persist({ widgetStyle: next })
      }

      function setWidgetLabel(value) {
        const next = normalizeWidgetLabel(value, state.widgetLabel)
        set({ widgetLabel: next, error: null, notice: null })
        void persist({ widgetLabel: next })
        return next
      }

      function setWidgetHideLabel(value) {
        const next = value === true
        set({ widgetHideLabel: next, error: null, notice: null })
        void persist({ widgetHideLabel: next })
      }

      /** Persist the dragged viewport position (shared by every window). */
      function setWidgetPos(left, top) {
        const x = Number.isFinite(left) ? Math.max(0, Math.round(left)) : null
        const y = Number.isFinite(top) ? Math.max(0, Math.round(top)) : null
        set({ widgetX: x, widgetY: y, error: null, notice: null })
        void persist({ widgetX: x, widgetY: y })
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

      /**
       * Delete is destructive on the Host, so keep the original bytes in memory
       * for a short undo window. Re-uploading identical bytes yields the same
       * content hash, which lets the image return to its old position.
       */
      async function deleteItem(id) {
        if (!id) return
        const index = state.items.findIndex((entry) => entry.id === id)
        const item = index >= 0 ? state.items[index] : null
        if (!item) return
        const previousCurrentId = state.currentId
        set({ busy: true, error: null, notice: null })
        let blob = null
        try {
          const response = await fetch(api('/ui-background/image') + '?id=' + encodeURIComponent(id), {
            credentials: 'same-origin',
          })
          if (response.ok) blob = await response.blob()
        } catch {
          /* undo simply stays unavailable */
        }
        try {
          apply(await request('/ui-background/image/' + encodeURIComponent(id), { method: 'DELETE' }))
          if (blob) {
            set({
              busy: false,
              undo: {
                item,
                index,
                blob,
                previousCurrentId,
                // What the Host picked after the delete; if the user selects
                // something else before undo, leave that choice alone.
                autoCurrentId: state.currentId,
                expiresAt: Date.now() + UNDO_MS,
              },
            })
            scheduleUndoExpiry()
          } else {
            set({ busy: false, notice: t('deleteNoUndo').replace('{name}', item.name || t('unnamed')) })
          }
        } catch {
          set({ busy: false, error: t('saveFailed') })
        }
      }

      function scheduleUndoExpiry() {
        clearUndoTimer()
        undoTimer = setTimeout(() => {
          undoTimer = 0
          if (state.undo) set({ undo: null })
        }, UNDO_MS)
      }

      function clearUndoTimer() {
        if (undoTimer) {
          clearTimeout(undoTimer)
          undoTimer = 0
        }
      }

      async function undoDelete() {
        const entry = state.undo
        if (!entry || state.busy) return
        clearUndoTimer()
        set({ undo: null, busy: true, error: null, notice: null })
        const wasCurrent = entry.previousCurrentId === entry.item.id
        try {
          // `select=0`: restore the bytes without re-pointing the background.
          // A non-current image therefore never steals the background (no
          // flash); a deleted current image is re-selected explicitly below.
          const view = await request('/ui-background/image?select=0', {
            method: 'POST',
            headers: {
              'content-type': entry.item.mime,
              'x-image-name': encodeURIComponent(entry.item.name || ''),
            },
            body: entry.blob,
          })
          apply(view)
          const restored = state.items.some((item) => item.id === entry.item.id)
          if (!restored) {
            set({ busy: false, error: t('deleteUndoFailed') })
            return
          }
          const ids = state.items.map((item) => item.id).filter((itemId) => itemId !== entry.item.id)
          ids.splice(Math.min(entry.index, ids.length), 0, entry.item.id)
          await reorder(ids)
          if (wasCurrent && state.currentId === entry.autoCurrentId
            && state.currentId !== entry.item.id) {
            apply(await request('/ui-background/state', {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ currentId: entry.item.id }),
            }))
          }
          set({ busy: false })
        } catch (error) {
          const full = error && error.message === 'limit-reached'
          set({ busy: false, error: full ? t('deleteUndoLimit') : t('deleteUndoFailed') })
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
        clearUndoTimer()
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', onVisibilityChange)
        }
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = 0
        pendingPatch = {}
        loadingThumbs.clear()
        fullSeq += 1
        if (fadeTimer) {
          clearTimeout(fadeTimer)
          fadeTimer = 0
        }
        if (state.fullUrl) URL.revokeObjectURL(state.fullUrl)
        if (state.fadeUrl && state.fadeUrl !== state.fullUrl) URL.revokeObjectURL(state.fadeUrl)
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
        setWidgetEnabled,
        setWidgetStyle,
        setWidgetLabel,
        setWidgetHideLabel,
        setWidgetPos,
        startRecording,
        cancelRecording,
        upload,
        selectItem,
        reorder,
        deleteItem,
        undoDelete,
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

      // ------------------------------------------------------------ widget
      /** The widget face at its real size; `WidgetPreview` scales it down. */
      function WidgetFace(props) {
        const skin = widgetSkin(props.styleId, props.dark)
        return h('div', { style: widgetBoxStyle(skin, props.hide) },
          props.hide ? null : h('div', { style: widgetLabelStyle(skin) }, props.label),
          h('div', { style: widgetTimeStyle(skin, props.hide) }, props.time),
        )
      }

      function WidgetPreview(props) {
        const hide = props.hide === true
        const width = (hide ? 132 : 180) * props.scale
        const height = (hide ? 48 : 72) * props.scale
        return h('div', {
          style: {
            width: Math.round(width),
            height: Math.round(height),
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 10,
            flex: '0 0 auto',
          },
        }, h('div', {
          style: {
            position: 'absolute',
            top: 0,
            left: 0,
            transform: 'scale(' + props.scale + ')',
            transformOrigin: 'top left',
            pointerEvents: 'none',
          },
        }, h(WidgetFace, {
          styleId: props.styleId,
          dark: props.themeDark,
          hide,
          label: props.label,
          time: '12:34:56:07',
        })))
      }

      /** Style picker: a mini-preview trigger and a grid of mini previews. */
      function WidgetStylePicker(props) {
        const dark = useDarkTheme()
        const [open, setOpen] = React.useState(false)
        const rootRef = React.useRef(null)
        const triggerRef = React.useRef(null)
        const listRef = React.useRef(null)
        const t = props.t

        React.useEffect(() => {
          if (!open) return undefined
          const onDown = (event) => {
            if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
          }
          const onKey = (event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            event.stopPropagation()
            setOpen(false)
            if (triggerRef.current) triggerRef.current.focus()
          }
          document.addEventListener('mousedown', onDown, true)
          document.addEventListener('keydown', onKey, true)
          const focusTimer = setTimeout(() => {
            if (!listRef.current) return
            const selected = listRef.current.querySelector('[aria-selected="true"]')
            if (selected) selected.focus()
          }, 0)
          return () => {
            document.removeEventListener('mousedown', onDown, true)
            document.removeEventListener('keydown', onKey, true)
            clearTimeout(focusTimer)
          }
        }, [open])

        function moveFocus(delta) {
          if (!listRef.current) return
          const buttons = Array.from(listRef.current.querySelectorAll('button'))
          if (!buttons.length) return
          const current = buttons.indexOf(document.activeElement)
          const next = Math.min(buttons.length - 1, Math.max(0, (current < 0 ? 0 : current) + delta))
          buttons[next].focus()
        }

        return h('div', { ref: rootRef, style: { position: 'relative' } },
          h('button', {
            ref: triggerRef,
            type: 'button',
            'aria-label': t('widgetStyleAria'),
            'aria-haspopup': 'listbox',
            'aria-expanded': open,
            onClick: () => setOpen(!open),
            onKeyDown: (event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setOpen(true)
              }
            },
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: 4,
              border: '1px solid var(--dsw-alias-border-l1)',
              borderRadius: 10,
              background: 'var(--dsw-alias-bg-layer-2)',
              cursor: 'pointer',
            },
          },
            h(WidgetPreview, {
              styleId: props.value,
              themeDark: dark,
              hide: false,
              label: props.label,
              scale: 0.6,
            }),
            h('span', {
              style: { fontSize: 9, color: 'var(--dsw-alias-label-secondary)', paddingRight: 4 },
            }, '▾')
          ),
          open ? h('div', {
            ref: listRef,
            role: 'listbox',
            'aria-label': t('widgetStyleAria'),
            onKeyDown: (event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                moveFocus(1)
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                moveFocus(-1)
              }
            },
            style: {
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              zIndex: 60,
              display: 'grid',
              gridTemplateColumns: 'repeat(4, max-content)',
              gap: 6,
              padding: 8,
              maxHeight: 192,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              scrollbarWidth: 'thin',
              borderRadius: 12,
              border: '1px solid var(--dsw-alias-border-l1)',
              background: 'var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1))',
              boxShadow: '0 16px 40px rgba(0,0,0,.28)',
            },
          }, WIDGET_STYLE_IDS.map((id) => h('button', {
            key: id,
            type: 'button',
            role: 'option',
            'aria-selected': id === props.value,
            'aria-label': WIDGET_STYLE_NAMES[id],
            onClick: () => {
              props.onChange(id)
              setOpen(false)
              if (triggerRef.current) triggerRef.current.focus()
            },
            style: {
              display: 'flex',
              padding: 3,
              border: id === props.value
                ? '2px solid var(--dsw-alias-brand-primary)'
                : '2px solid transparent',
              borderRadius: 10,
              background: 'transparent',
              cursor: 'pointer',
            },
          }, h(WidgetPreview, {
            styleId: id,
            themeDark: dark,
            hide: false,
            label: props.label,
            scale: 0.58,
          })))) : null
        )
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
        const [pendingDelete, setPendingDelete] = React.useState(null)
        const cancelRef = React.useRef(null)
        const deleteTriggerRef = React.useRef(null)
        const [widgetLabelDraft, setWidgetLabelDraft] = React.useState(state.widgetLabel)
        const [widgetLabelError, setWidgetLabelError] = React.useState(null)
        const widgetLabelEditing = React.useRef(false)
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

        React.useEffect(() => {
          if (widgetLabelEditing.current) return
          setWidgetLabelDraft(state.widgetLabel)
        }, [state.widgetLabel])

        function onWidgetLabelChange(event) {
          widgetLabelEditing.current = true
          const chars = Array.from(String(event.target.value))
          setWidgetLabelDraft(chars.slice(0, WIDGET_LABEL_MAX).join(''))
          setWidgetLabelError(null)
        }

        function commitWidgetLabel() {
          widgetLabelEditing.current = false
          const chars = Array.from(widgetLabelDraft.trim())
          if (!chars.length) {
            setWidgetLabelError(t('widgetLabelEmpty'))
            return
          }
          if (chars.length > WIDGET_LABEL_MAX) {
            setWidgetLabelError(t('widgetLabelTooLong'))
            return
          }
          setWidgetLabelError(null)
          store.setWidgetLabel(chars.join(''))
        }

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

        function openDeleteDialog(event, item, index) {
          if (state.busy) return
          deleteTriggerRef.current = event && event.currentTarget ? event.currentTarget : null
          setPendingDelete({ item, index })
        }

        function closeDeleteDialog() {
          setPendingDelete(null)
          const trigger = deleteTriggerRef.current
          deleteTriggerRef.current = null
          if (trigger && typeof trigger.focus === 'function') trigger.focus()
        }

        function confirmDelete() {
          const entry = pendingDelete
          setPendingDelete(null)
          if (entry) void store.deleteItem(entry.item.id)
        }

        function onDialogKeyDown(event) {
          if (event.key !== 'Tab') return
          const buttons = event.currentTarget.querySelectorAll('button')
          if (!buttons.length) return
          const first = buttons[0]
          const last = buttons[buttons.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }

        React.useEffect(() => {
          if (!pendingDelete) return undefined
          const onKeyDown = (event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            event.stopPropagation()
            closeDeleteDialog()
          }
          window.addEventListener('keydown', onKeyDown, true)
          const focusTimer = setTimeout(() => {
            if (cancelRef.current) cancelRef.current.focus()
          }, 0)
          return () => {
            window.removeEventListener('keydown', onKeyDown, true)
            clearTimeout(focusTimer)
          }
        }, [pendingDelete])

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

        const pendingItem = pendingDelete ? pendingDelete.item : null
        const pendingName = pendingItem ? (pendingItem.name || t('unnamed')) : ''
        const pendingThumb = pendingItem ? (state.thumbs[pendingItem.id] || '') : ''
        const pendingMeta = pendingItem
          ? [String(pendingItem.mime || '').split('/')[1], formatBytes(pendingItem.size)]
              .filter(Boolean).join(' · ').toUpperCase()
          : ''
        const pendingIsCurrent = Boolean(pendingItem && pendingItem.id === state.currentId)

        const dialogNode = pendingItem ? inBody(h('div', {
          style: S.backdrop,
          'data-ui-bg-motion': 'true',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) closeDeleteDialog()
          },
        },
          h('style', { dangerouslySetInnerHTML: { __html: MOTION_CSS } }),
          h('div', {
            role: 'alertdialog',
            'aria-modal': 'true',
            'data-ui-bg-motion': 'true',
            'aria-labelledby': 'ui-bg-delete-title',
            'aria-describedby': 'ui-bg-delete-desc',
            style: S.dialog,
            onKeyDown: onDialogKeyDown,
          },
            h('h3', { id: 'ui-bg-delete-title', style: S.dialogTitle }, t('deleteTitle')),
            h('div', { style: S.dialogBody },
              h('div', {
                'aria-hidden': 'true',
                style: Object.assign({}, S.dialogThumb,
                  pendingThumb ? { backgroundImage: 'url("' + pendingThumb + '")' } : null),
              }),
              h('div', { style: S.dialogInfo },
                h('div', { style: S.dialogName, title: pendingName }, pendingName),
                pendingMeta ? h('div', { style: S.dialogMeta }, pendingMeta) : null
              )
            ),
            h('p', { id: 'ui-bg-delete-desc', style: S.dialogWarn },
              t('deleteBody') + (pendingIsCurrent ? ' ' + t('deleteCurrentWarn') : '')
            ),
            h('div', { style: S.dialogFooter },
              h('button', {
                ref: cancelRef,
                type: 'button',
                onClick: closeDeleteDialog,
                style: S.secondaryButton,
              }, t('deleteCancel')),
              h('button', {
                type: 'button',
                onClick: confirmDelete,
                style: S.dangerButton,
              }, t('deleteConfirm'))
            )
          )
        )) : null

        const toastNode = state.undo ? inBody(h('div', {
          role: 'status',
          'aria-live': 'polite',
          'data-ui-bg-motion': 'true',
          style: S.toast,
        },
          h('style', { dangerouslySetInnerHTML: { __html: MOTION_CSS } }),
          h('span', { style: S.toastText },
            t('deleteUndoToast').replace('{name}', state.undo.item.name || t('unnamed'))),
          h('button', {
            type: 'button',
            disabled: state.busy,
            onClick: () => { void store.undoDelete() },
            style: state.busy
              ? Object.assign({}, S.toastAction, { opacity: 0.5, cursor: 'default' })
              : S.toastAction,
          }, t('deleteUndoAction')),
          h('span', { 'aria-hidden': 'true', 'data-ui-bg-motion': 'true', style: S.toastProgress })
        )) : null

        return h(React.Fragment, null,
          h('div', { style: S.page },
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
                ? h('div', { style: S.gallery }, items.map((item, index) => {
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
                        onClick: (event) => openDeleteDialog(event, item, index),
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

          h('div', {
            style: Object.assign({}, S.card, {
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: 12,
            }),
          },
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
              h('div', { style: S.label }, t('widgetTitle')),
              h('div', { style: S.hint }, t('widgetHint'))
            ),

            h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
              h('button', {
                type: 'button',
                role: 'switch',
                'aria-checked': state.widgetEnabled,
                'aria-label': t('widgetEnable'),
                onClick: () => store.setWidgetEnabled(!state.widgetEnabled),
                style: {
                  position: 'relative',
                  width: 36,
                  height: 20,
                  padding: 0,
                  border: 'none',
                  borderRadius: 999,
                  cursor: 'pointer',
                  flex: '0 0 auto',
                  background: state.widgetEnabled
                    ? 'var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary))'
                    : 'var(--dsw-alias-border-l2)',
                  transition: 'background 120ms ease',
                },
              }, h('span', {
                style: {
                  position: 'absolute',
                  top: 2,
                  left: state.widgetEnabled ? 18 : 2,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: 'var(--dsw-alias-label-primary-foreground, var(--dsw-alias-bg-base))',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.25)',
                  transition: 'left 120ms ease',
                },
              })),
              h('span', { style: { fontSize: 13 } }, t('widgetEnable')),
              h('span', { style: S.hint }, t('widgetEnableHint'))
            ),

            h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
              h('span', { style: { fontSize: 13, color: 'var(--dsw-alias-label-secondary)', minWidth: 40 } }, t('widgetStyle')),
              h(WidgetStylePicker, {
                value: state.widgetStyle,
                label: state.widgetLabel,
                t,
                onChange: (id) => store.setWidgetStyle(id),
              })
            ),

            h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
              h('span', { style: { fontSize: 13, color: 'var(--dsw-alias-label-secondary)', minWidth: 40 } }, t('widgetLabel')),
              h('input', {
                type: 'text',
                value: widgetLabelDraft,
                maxLength: WIDGET_LABEL_MAX,
                autoComplete: 'off',
                'aria-label': t('widgetLabel'),
                onChange: onWidgetLabelChange,
                onBlur: commitWidgetLabel,
                onKeyDown: (event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur()
                  } else if (event.key === 'Escape') {
                    widgetLabelEditing.current = false
                    setWidgetLabelDraft(state.widgetLabel)
                    setWidgetLabelError(null)
                    event.currentTarget.blur()
                  }
                },
                style: Object.assign({}, S.input, { width: 110 }),
              }),
              h('span', { style: S.hint }, '\uff08' + t('widgetLabelHint').replace(/\u3002$/, '') + '\uff09'),
              h('label', {
                style: {
                  marginLeft: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontSize: 13,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                },
              },
                h('input', {
                  type: 'checkbox',
                  checked: state.widgetHideLabel,
                  'aria-label': t('widgetHideLabel'),
                  onChange: (event) => store.setWidgetHideLabel(event.target.checked),
                  style: { width: 16, height: 16, margin: 0, cursor: 'pointer', accentColor: 'var(--dsw-alias-brand-primary)' },
                }),
                t('widgetHideLabel')
              )
            ),

            widgetLabelError ? h('div', { role: 'alert', style: S.error }, widgetLabelError) : null
          ),

          state.error ? h('div', { role: 'alert', style: S.error }, state.error) : null
        ),
          dialogNode,
          toastNode
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
        // Keep the previous image on screen until the next one has loaded, so
        // switching/rotation never drops the background to nothing; the fade
        // layer then blends old into new.
        const imageUrl = state.fullUrl
        const fadeUrl = state.fadeUrl
        const amount = wallpaper ? state.opacity : state.overlayOpacity
        const active = state.ready && state.enabled && Boolean(imageUrl) && amount > 0
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
          return h(React.Fragment, null,
            h('style', {
              key: 'wallpaper',
              'data-ui-background': 'wallpaper',
              dangerouslySetInnerHTML: { __html: wallpaperCss(imageUrl, state.dim) },
            }),
            fadeUrl ? inBody(h('div', {
              key: 'crossfade-' + state.fadeKey,
              'aria-hidden': 'true',
              className: 'ui-bg-crossfade',
              style: {
                position: 'fixed',
                inset: 0,
                zIndex: -1,
                pointerEvents: 'none',
                backgroundImage: imageLayers(fadeUrl, state.dim),
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              },
            })) : null
          )
        }
        return h(React.Fragment, null,
          h('style', {
            key: 'crossfade-css',
            dangerouslySetInnerHTML: { __html: CROSSFADE_CSS },
          }),
          h('div', {
            key: 'overlay',
            'aria-hidden': 'true',
            style: {
              position: 'fixed',
              inset: 0,
              pointerEvents: 'none',
              backgroundImage: 'url("' + imageUrl + '")',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              opacity: state.overlayOpacity,
              transition: 'opacity 160ms ease',
            },
          }),
          fadeUrl ? h('div', {
            key: 'crossfade-' + state.fadeKey,
            'aria-hidden': 'true',
            className: 'ui-bg-crossfade',
            style: {
              position: 'fixed',
              inset: 0,
              pointerEvents: 'none',
              backgroundImage: 'url("' + fadeUrl + '")',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              opacity: state.overlayOpacity,
              '--ui-bg-fade-from': state.overlayOpacity,
            },
          }) : null
        )
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

        const widgetController = createWidgetController(store)
        ctx.effect(() => {
          widgetController.start()
          return () => widgetController.stop()
        }, 'ui-background: widget')

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
