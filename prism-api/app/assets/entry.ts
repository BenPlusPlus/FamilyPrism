import {
  detectMultipleImportMapSupport,
  importModule,
  preloadShim,
} from 'remix/multiple-import-maps-polyfill'
import { run } from 'remix/component'

import { formatDnsRemaining } from './dns-remaining.ts'

function tickDnsOverlays() {
  for (let root of document.querySelectorAll<HTMLElement>('[data-dns-overlay]')) {
    let remaining = root.querySelector<HTMLElement>('[data-dns-remaining]')
    let deadline = remaining?.getAttribute('data-deadline')
    if (!remaining || !deadline) {
      continue
    }

    let ms = Date.parse(deadline) - Date.now()
    let hint = root.querySelector<HTMLElement>('[data-dns-restore-hint]')
    if (!Number.isFinite(ms) || ms <= 0) {
      remaining.hidden = true
      let actions = root.querySelector('form')
      if (actions) {
        actions.hidden = true
      }
      if (hint) {
        hint.hidden = false
      }
      continue
    }

    remaining.hidden = false
    remaining.textContent = formatDnsRemaining(ms)
    if (hint) {
      hint.hidden = true
    }
  }
}

tickDnsOverlays()
setInterval(tickDnsOverlays, 1000)

let app = run({
  async loadModule(moduleUrl, exportName) {
    let module = await importModule(moduleUrl)
    let Component = module[exportName]
    if (typeof Component !== 'function') {
      throw new Error(`Unknown component: ${moduleUrl}#${exportName}`)
    }
    return Component
  },
  async processClientEntryPreloads(preloads) {
    if (await detectMultipleImportMapSupport()) return preloads
    preloadShim(preloads)
    return []
  },
})

await app.ready()
