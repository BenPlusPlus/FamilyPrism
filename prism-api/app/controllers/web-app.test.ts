import assert from 'node:assert/strict'
import test from 'node:test'

import { router } from '../router.ts'
import { routes } from '../routes.ts'
import { appUrl, jsonRequest } from '../../test/http.ts'
import { closeTestPersistence, installTestPersistence } from '../../test/persistence.ts'

test.after(async () => {
  await closeTestPersistence()
})

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Fetches an icon through the app and reads its pixel size from the PNG header. */
async function fetchPngSize(href: string) {
  let response = await router.fetch(jsonRequest(href))
  assert.equal(response.status, 200, href)
  assert.equal(response.headers.get('content-type'), 'image/png', href)

  let bytes = new Uint8Array(await response.arrayBuffer())
  assert.deepEqual(Array.from(bytes.subarray(0, 8)), PNG_SIGNATURE, `${href} is not a PNG`)
  let header = new DataView(bytes.buffer, bytes.byteOffset)
  return `${header.getUint32(16)}x${header.getUint32(20)}`
}

test('the manifest opens the console and every icon it lists is served at its declared size', async () => {
  await installTestPersistence()

  let response = await router.fetch(jsonRequest(routes.webAppManifest.href()))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/manifest+json')
  let manifest = await response.json()

  assert.equal(manifest.display, 'standalone')
  let start = appUrl(manifest.start_url)
  let scope = appUrl(manifest.scope)
  assert.ok(start.pathname.startsWith(scope.pathname), 'start_url must sit inside scope')

  // Signed out, opening the installed app lands on sign in rather than an error.
  let opened = await router.fetch(jsonRequest(start.pathname))
  assert.equal(opened.status, 302)
  assert.equal(opened.headers.get('location'), routes.auth.login.index.href())

  assert.ok(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable'))
  for (let icon of manifest.icons as Array<{ sizes: string; src: string }>) {
    assert.equal(await fetchPngSize(icon.src), icon.sizes)
  }
})

test('pages link the manifest and an iOS home screen icon that is served', async () => {
  await installTestPersistence()

  let html = await (await router.fetch(jsonRequest(routes.auth.login.index.href()))).text()

  let manifestHref = html.match(/<link rel="manifest" href="([^"]+)"/)?.[1]
  assert.ok(manifestHref, 'page links a manifest')
  assert.equal((await router.fetch(jsonRequest(manifestHref))).status, 200)

  let touchIconHref = html.match(/<link rel="apple-touch-icon" href="([^"]+)"/)?.[1]
  assert.ok(touchIconHref, 'page links an apple-touch-icon')
  assert.equal(await fetchPngSize(touchIconHref), '180x180')
})

test('the icon route serves only the bundled icons', async () => {
  await installTestPersistence()

  for (let file of ['missing.png', '..%2F..%2Fpackage.json', '..%2Ffonts%2Farchivo-latin.woff2']) {
    let response = await router.fetch(jsonRequest(`/icons/${file}`))
    assert.equal(response.status, 404, file)
  }
})
