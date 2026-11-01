export interface Notice {
  text: string
  type: 'error' | 'success'
}

export function getNotice(url: URL): Notice | null {
  let text = url.searchParams.get('notice')
  if (!text) {
    return null
  }

  return {
    text,
    type: url.searchParams.get('noticeType') === 'error' ? 'error' : 'success',
  }
}

export function withNotice(request: Request, href: string, notice: Notice) {
  let url = new URL(href, request.url)
  url.searchParams.set('notice', notice.text)
  url.searchParams.set('noticeType', notice.type)
  return `${url.pathname}${url.search}`
}


/** Accepts only same-origin admin paths so form `returnTo` fields can't redirect elsewhere. */
export function safeAdminReturnTo(value: FormDataEntryValue | null, fallback: string) {
  return typeof value === 'string' && /^\/admin(?:[/?]|$)/.test(value) && !value.includes('\\')
    ? value
    : fallback
}
