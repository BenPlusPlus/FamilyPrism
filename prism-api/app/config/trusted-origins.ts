const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'] as const

function originFor(protocol: string, hostname: string, port: string) {
  let url = new URL(`${protocol}//${hostname}`)
  if (port) {
    url.port = port
  }
  return url.origin
}

export function expandLoopbackTrustedOrigins(origin: string) {
  let url = new URL(origin)
  let hostname = url.hostname === '::1' ? '[::1]' : url.hostname
  if (!LOOPBACK_HOSTS.includes(hostname as (typeof LOOPBACK_HOSTS)[number])) {
    return [url.origin]
  }

  return LOOPBACK_HOSTS.map((host) => originFor(url.protocol, host, url.port))
}
