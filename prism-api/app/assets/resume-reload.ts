// Installed to the home screen, the console has no reload button or pull-to-refresh,
// and iOS keeps it suspended in the background for hours. Pages show state as of their
// load, so coming back to the app after a while reloads instead of showing stale state.
const STALE_AFTER_MS = 60_000

function isInstalledApp() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** Something typed or picked that a reload would throw away. */
function hasUnsavedInput() {
  for (let field of document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    'input, select, textarea',
  )) {
    if (field instanceof HTMLSelectElement) {
      let options = Array.from(field.options)
      let initial = options.findIndex((option) => option.defaultSelected)
      if (field.selectedIndex !== (initial === -1 ? 0 : initial)) {
        return true
      }
    } else if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) {
      if (field.checked !== field.defaultChecked) {
        return true
      }
    } else if (field.type !== 'hidden' && field.value !== field.defaultValue) {
      return true
    }
  }
  return false
}

export function startResumeReload() {
  let hiddenAt: number | null = null

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      return
    }

    let awayMs = hiddenAt === null ? 0 : Date.now() - hiddenAt
    hiddenAt = null
    if (awayMs >= STALE_AFTER_MS && isInstalledApp() && !hasUnsavedInput()) {
      window.location.reload()
    }
  })

  // "Refresh" buttons in hints, for when the browser's own reload isn't there.
  document.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('[data-reload]')) {
      window.location.reload()
    }
  })
}
