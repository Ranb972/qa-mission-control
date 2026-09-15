import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function parseDotEnv(content) {
  const entries = {}

  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = index === 0 ? rawLine.replace(/^\uFEFF/, '') : rawLine
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/)

    if (!match) {
      continue
    }

    const [, key, rawValue = ''] = match
    entries[key] = normalizeDotEnvValue(rawValue)
  }

  return entries
}

export function loadEnvLocal({ cwd = process.cwd(), override = true } = {}) {
  const envPath = resolve(cwd, '.env.local')

  if (!existsSync(envPath)) {
    return {
      envPath,
      exists: false,
      loadedKeys: [],
    }
  }

  const entries = parseDotEnv(readFileSync(envPath, 'utf8'))
  const loadedKeys = []

  for (const [key, value] of Object.entries(entries)) {
    if (!override && process.env[key] !== undefined) {
      continue
    }

    process.env[key] = value
    loadedKeys.push(key)
  }

  return {
    envPath,
    exists: true,
    loadedKeys,
  }
}

export function getAiEnvVisibility(env = process.env) {
  return {
    GROQ_API_KEY_VISIBLE: isNonEmptyEnvValue(env.GROQ_API_KEY),
    GROQ_MODEL_VISIBLE: isNonEmptyEnvValue(env.GROQ_MODEL),
  }
}

function isNonEmptyEnvValue(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeDotEnvValue(rawValue) {
  const trimmed = rawValue.trim()

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}
