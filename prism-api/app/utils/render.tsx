import type { RemixNode } from 'remix/component'
import { renderToStream } from 'remix/component/server'

import { assets } from '../assets.ts'
import { router } from '../router.ts'

export function render(node: RemixNode, request: Request, init?: ResponseInit) {
  let stream = renderToStream(node, {
    frameSrc: request.url,
    signal: request.signal,
    async resolveFrame(src, target) {
      let headers = new Headers({ accept: 'text/html' })
      let cookie = request.headers.get('cookie')
      if (cookie) headers.set('cookie', cookie)
      if (target) headers.set('x-remix-target', target)

      let response = await router.fetch(new Request(new URL(src, request.url), { headers }))
      return response.body ?? response.text()
    },
    async resolveClientEntry(entryId, component) {
      let { href, importMap, preloads } = await assets.getScriptEntry(entryId)
      return {
        href,
        importMap,
        exportName: entryId.split('#')[1] || component.name,
        preloads,
      }
    },
  })

  let headers = new Headers(init?.headers)
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'text/html; charset=utf-8')
  }

  // renderToStream starts at <html>; without a doctype every page renders in quirks mode.
  // Frame requests get a fragment, so they stay as they are.
  let body = request.headers.has('x-remix-target') ? stream : withDoctype(stream)
  return new Response(body, { ...init, headers })
}

const DOCTYPE = new TextEncoder().encode('<!DOCTYPE html>')

function withDoctype(stream: ReadableStream<Uint8Array>) {
  let reader = stream.getReader()
  let started = false
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!started) {
        started = true
        controller.enqueue(DOCTYPE)
        return
      }

      let chunk = await reader.read()
      if (chunk.done) {
        controller.close()
      } else {
        controller.enqueue(chunk.value)
      }
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}
