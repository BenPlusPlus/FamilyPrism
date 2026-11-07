export function formatDnsRemaining(ms: number) {
  if (ms <= 0) {
    return '0 min left'
  }

  let totalSeconds = Math.ceil(ms / 1000)
  let hours = Math.floor(totalSeconds / 3600)
  let minutes = Math.floor((totalSeconds % 3600) / 60)
  let seconds = totalSeconds % 60

  if (hours > 0) {
    return minutes > 0 ? `${hours} hr ${minutes} min left` : `${hours} hr left`
  }

  if (minutes > 0 && seconds > 0) {
    return `${minutes} min ${seconds} sec left`
  }

  if (minutes > 0) {
    return `${minutes} min left`
  }

  return `${seconds} sec left`
}
