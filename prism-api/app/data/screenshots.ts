import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { Database } from 'remix/data-table'

import { updateClientScreenshotTime } from './clients.ts'
import { db } from './database.ts'

function getScreenshotDirectory() {
  return path.resolve(process.cwd(), 'screenshots')
}

function getScreenshotFileName(clientId: string) {
  return `${encodeURIComponent(clientId)}.png`
}

export function getScreenshotPath(clientId: string) {
  return path.join(getScreenshotDirectory(), getScreenshotFileName(clientId))
}

export async function saveClientScreenshot(
  clientId: string,
  screenshot: Uint8Array,
  database: Database = db,
) {
  let takenAt = new Date().toISOString()

  await fs.mkdir(getScreenshotDirectory(), { recursive: true })
  await fs.writeFile(getScreenshotPath(clientId), screenshot)
  await updateClientScreenshotTime(clientId, takenAt, database)

  return takenAt
}

export async function readClientScreenshot(clientId: string) {
  try {
    return await fs.readFile(getScreenshotPath(clientId))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }

    throw error
  }
}

export async function deleteClientScreenshot(clientId: string) {
  try {
    await fs.unlink(getScreenshotPath(clientId))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }

    throw error
  }
}
