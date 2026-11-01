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

  return new Response(stream, { ...init, headers })
}
