/**
 * A stand-in Router bridge for trying the Devices console without a router or the .NET bridge.
 * It keeps a pretend MAC filter table in memory and reconciles it the way ADR 0008 describes.
 *
 *   pnpm exec tsx test/fake-bridge.ts register "Fake bridge"   # once; saves .fake-bridge.json
 *   pnpm exec tsx test/fake-bridge.ts run [--seed AA-BB-CC-DD-EE-FF=Old_Entry,...] [--fail login-failed]
 *
 * PRISM_URL (default http://localhost:44100) and REGISTRATION_PASSWORD come from the environment.
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'node:fs'

import { WebSocket } from 'ws'

import type { DesiredDevice, DesiredStatePayload, RouterEntry } from '../app/data/device-access.ts'

const STATE_FILE = '.fake-bridge.json'
const baseUrl = process.env.PRISM_URL ?? 'http://localhost:44100'
const [command, ...rest] = process.argv.slice(2)

function option(name: string) {
  let index = rest.indexOf(`--${name}`)
  return index === -1 ? null : rest[index + 1] ?? null
}

async function register(name: string) {
  let response = await fetch(new URL('/api/bridges/register', baseUrl), {
    body: JSON.stringify({ bridgeName: name, registrationPassword: process.env.REGISTRATION_PASSWORD }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  let body = await response.json()
  if (!response.ok) {
    throw new Error(`Registration failed (${response.status}): ${JSON.stringify(body)}`)
  }
  writeFileSync(STATE_FILE, JSON.stringify(body, null, 2))
  console.log(`Registered ${body.bridgeName}; saved ${STATE_FILE}.`)
}

function run() {
  let saved = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as {
    bridgeId: string
    credential: string
    websocketPath: string
  }
  let failure = option('fail')
  let table: RouterEntry[] = (option('seed') ?? '')
    .split(',')
    .filter(Boolean)
    .map((pair) => {
      let [mac, name] = pair.split('=')
      return { mac: mac.toUpperCase(), name: name ?? 'Seeded' }
    })
  let desired: DesiredDevice[] = []
  let clockOffsetMs = 0
  let expiryTimer: NodeJS.Timeout | undefined

  let url = new URL(saved.websocketPath, baseUrl.replace(/^http/, 'ws'))
  let socket = new WebSocket(url, {
    headers: { authorization: `Bearer ${saved.credential}`, 'x-bridge-id': saved.bridgeId },
  })

  let serverNow = () => Date.now() + clockOffsetMs

  function accessNow(device: DesiredDevice) {
    return device.timed && Date.parse(device.timed.expiresAt) > serverNow()
      ? device.timed.access
      : device.standing
  }

  /** Managed MACs follow desired state; entries for MACs FamilyPrism doesn't manage are left alone. */
  function reconcile() {
    if (failure) {
      socket.send(JSON.stringify({ error: { code: failure }, type: 'reconcile-report' }))
      console.log(`Reported failure: ${failure}`)
      return
    }

    for (let device of desired) {
      let blocked = accessNow(device) === 'blocked'
      for (let mac of device.macs) {
        let present = table.some((entry) => entry.mac === mac)
        if (blocked && !present) {
          table.push({ mac, name: device.name.replace(/[^A-Za-z0-9_]+/g, '_').slice(0, 50) })
        } else if (!blocked && present) {
          table = table.filter((entry) => entry.mac !== mac)
        }
      }
    }

    socket.send(JSON.stringify({ entries: table, type: 'reconcile-report' }))
    console.log(`Reconciled; table now ${table.map((entry) => `${entry.name} ${entry.mac}`).join(', ') || '(empty)'}`)
    scheduleNextExpiry()
  }

  function scheduleNextExpiry() {
    clearTimeout(expiryTimer)
    let deadlines = desired
      .map((device) => (device.timed ? Date.parse(device.timed.expiresAt) - serverNow() : Infinity))
      .filter((ms) => ms > 0 && Number.isFinite(ms))
    if (deadlines.length > 0) {
      expiryTimer = setTimeout(reconcile, Math.min(...deadlines) + 250)
    }
  }

  socket.on('open', () => {
    console.log(`Connected to ${url.href}`)
    socket.send(JSON.stringify({ routerModel: 'Fake router', type: 'identify', version: '0.0.1' }))
  })
  socket.on('message', (data) => {
    let message = JSON.parse(data.toString()) as Partial<Omit<DesiredStatePayload, 'type'>> & { type: string }
    if (message.type === 'desired-state' && message.devices && message.serverTime) {
      desired = message.devices
      clockOffsetMs = Date.parse(message.serverTime) - Date.now()
      reconcile()
    } else if (message.type === 'reconcile-now') {
      reconcile()
    }
  })
  socket.on('close', (code, reason) => {
    console.log(`Disconnected (${code}) ${reason.toString()}`)
    process.exit(0)
  })
  socket.on('error', (error) => console.error(error.message))
}

if (command === 'register') {
  await register(rest[0] ?? 'Fake bridge')
} else if (command === 'run') {
  run()
} else {
  console.log('Usage: tsx test/fake-bridge.ts register "<name>" | run [--seed MAC=Name,...] [--fail <code>]')
}
