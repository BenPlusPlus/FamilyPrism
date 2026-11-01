import type { Handle, RemixNode } from 'remix/component'
import { ImportMap } from 'remix/component/server'

import { scriptEntry } from '../assets.ts'
import { routes } from '../routes.ts'

export interface DocumentProps {
  children?: RemixNode
  title?: string
}

const DEFAULT_TITLE = 'FamilyPrism'

export function Document(handle: Handle<DocumentProps>) {
  return () => {
    let title = handle.props.title
    return (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          <meta name="theme-color" content="#1e2b2f" />
          <title>{title ? `${title} · ${DEFAULT_TITLE}` : DEFAULT_TITLE}</title>
          <link
            rel="preload"
            href={routes.fonts.href({ file: 'archivo-latin.woff2' })}
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
          <link rel="stylesheet" href={routes.assets.href({ path: 'app/assets/app.css' })} />
          <ImportMap value={scriptEntry.importMap} />
          {scriptEntry.preloads.map((preload) => (
            <link rel="modulepreload" href={preload} />
          ))}
          <script type="module" src={scriptEntry.href}></script>
        </head>
        <body>
          {handle.props.children}
        </body>
      </html>
    )
  }
}
