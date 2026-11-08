const POLL_MS = 1000
const WAIT_MS = 90_000

type ScreenshotMeta = {
  lastScreenshotAt: string | null
}

type PendingCapture = {
  appliedAt: number | null
  clientId: string
  seenAt: string
  startedAt: number
}

let pending: PendingCapture | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

// Match the server-rendered caption: the household zone, not this browser's.
function formatCapturedAt(value: string, timeZone: string | undefined) {
  let options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }
  try {
    return new Date(value).toLocaleString('en-US', { ...options, timeZone })
  } catch {
    return new Date(value).toLocaleString('en-US', options)
  }
}

function withCaptureQuery(src: string, capturedAt: string) {
  let url = new URL(src, window.location.origin)
  url.searchParams.set('t', capturedAt)
  return `${url.pathname}${url.search}`
}

function panelFor(clientId: string) {
  return document.querySelector<HTMLElement>(
    `[data-live-screenshot][data-client-id="${CSS.escape(clientId)}"]`,
  )
}

function setEmptyCopy(root: HTMLElement, waiting: boolean) {
  let empty = root.querySelector<HTMLElement>('[data-screenshot-empty]')
  if (!empty) {
    return
  }

  empty.textContent = waiting
    ? 'Waiting for the screenshot…'
    : (root.dataset.emptyCopy ?? empty.textContent)
}

function applyScreenshot(root: HTMLElement, capturedAt: string) {
  if (
    root.dataset.screenshotAt === capturedAt &&
    root.classList.contains('has-screenshot')
  ) {
    return
  }

  let srcBase = root.dataset.screenshotSrc
  if (!srcBase) {
    return
  }

  let src = withCaptureQuery(srcBase, capturedAt)
  let capturedLabel = formatCapturedAt(capturedAt, root.dataset.timeZone)
  let clientName = root.dataset.clientName ?? 'this PC'

  for (let image of root.querySelectorAll<HTMLImageElement>('[data-screenshot-image]')) {
    image.src = src
    image.alt = `Latest screenshot from ${clientName}`
  }

  for (let time of root.querySelectorAll<HTMLTimeElement>('[data-screenshot-time]')) {
    time.dateTime = capturedAt
    time.textContent = capturedLabel
  }

  let original = root.querySelector<HTMLAnchorElement>('[data-screenshot-original]')
  if (original) {
    original.href = src
  }

  root.dataset.screenshotAt = capturedAt
  root.classList.add('has-screenshot')
  setEmptyCopy(root, false)
}

async function readScreenshotMeta(url: string) {
  let response = await fetch(url, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    return null
  }

  let body = (await response.json()) as ScreenshotMeta
  return body.lastScreenshotAt
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function tickPendingCapture() {
  if (!pending) {
    stopPolling()
    return
  }

  if (Date.now() - pending.startedAt > WAIT_MS) {
    let stale = panelFor(pending.clientId)
    if (stale) {
      setEmptyCopy(stale, false)
    }
    pending = null
    stopPolling()
    return
  }

  let root = panelFor(pending.clientId)
  let metaUrl = root?.dataset.screenshotMeta
  if (!root || !metaUrl) {
    return
  }

  try {
    let capturedAt = await readScreenshotMeta(metaUrl)
    if (!capturedAt || capturedAt === pending.seenAt) {
      if (
        pending.appliedAt != null &&
        Date.now() - pending.appliedAt > 10_000
      ) {
        pending = null
        stopPolling()
      }
      return
    }

    applyScreenshot(root, capturedAt)
    pending.appliedAt = pending.appliedAt ?? Date.now()
    if (Date.now() - pending.appliedAt > 10_000) {
      pending = null
      stopPolling()
    }
  } catch {
    // Keep waiting; the next tick retries.
  }
}

function watchCapture(clientId: string, seenAt: string) {
  pending = {
    appliedAt: null,
    clientId,
    seenAt,
    startedAt: Date.now(),
  }

  let root = panelFor(clientId)
  if (root) {
    setEmptyCopy(root, true)
  }

  void tickPendingCapture()
  if (!pollTimer) {
    pollTimer = setInterval(() => {
      void tickPendingCapture()
    }, POLL_MS)
  }
}

function consumeAwaitScreenshotParam() {
  let url = new URL(window.location.href)
  if (!url.searchParams.has('awaitScreenshot')) {
    return
  }

  let root = document.querySelector<HTMLElement>('[data-live-screenshot]')
  if (root?.dataset.clientId) {
    watchCapture(root.dataset.clientId, root.dataset.screenshotAt ?? '')
  }

  url.searchParams.delete('awaitScreenshot')
  history.replaceState(null, '', `${url.pathname}${url.search}`)
}

export function startLiveScreenshots() {
  document.addEventListener(
    'submit',
    (event) => {
      let form = event.target
      if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-live-screenshot-form')) {
        return
      }

      let clientId = form.getAttribute('data-client-id')
      if (!clientId) {
        return
      }

      let root = panelFor(clientId)
      watchCapture(clientId, root?.dataset.screenshotAt ?? '')
    },
    true,
  )

  consumeAwaitScreenshotParam()
}
