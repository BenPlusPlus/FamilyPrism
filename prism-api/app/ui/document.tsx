import type { RemixNode } from 'remix/ui'

import { routes } from '../routes.ts'

export interface DocumentProps {
  children?: RemixNode
  title?: string
}

const DEFAULT_TITLE = decodeURIComponent('Prism%20Api')
const APP_STYLES = `
  :root {
    color-scheme: dark;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    background: #0f172a;
    color: #e2e8f0;
  }

  a {
    color: #7dd3fc;
  }

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  main,
  header {
    width: min(1100px, calc(100% - 2rem));
    margin: 0 auto;
  }

  header {
    padding: 1rem 0;
  }

  main {
    padding: 0 0 2rem;
  }

  nav {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  h1, h2, h3 {
    line-height: 1.2;
  }

  .card-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }

  .card,
  table,
  form,
  .notice {
    border: 1px solid #1e293b;
    border-radius: 0.75rem;
    background: #111827;
  }

  .card,
  form,
  .notice {
    padding: 1rem;
  }

  .stack {
    display: grid;
    gap: 0.75rem;
  }

  .compact {
    min-width: 260px;
  }

  .checkbox-grid {
    display: grid;
    gap: 0.5rem;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  input,
  select,
  textarea,
  button {
    width: 100%;
    padding: 0.7rem 0.8rem;
    border-radius: 0.5rem;
    border: 1px solid #334155;
    background: #020617;
    color: inherit;
    font: inherit;
  }

  button {
    cursor: pointer;
    background: #2563eb;
    border-color: #2563eb;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    overflow: hidden;
  }

  th,
  td {
    padding: 0.9rem;
    border-bottom: 1px solid #1e293b;
    vertical-align: top;
    text-align: left;
  }

  .notice.success {
    border-color: #166534;
    background: #052e16;
  }

  .notice.error {
    border-color: #991b1b;
    background: #450a0a;
  }
`

export function Document() {
  return ({ title = DEFAULT_TITLE, children }: DocumentProps) => (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <style>{APP_STYLES}</style>
      </head>
      <body>
        {children}
        <script type="module" src={routes.assets.href({ path: 'app/assets/entry.ts' })}></script>
      </body>
    </html>
  )
}
