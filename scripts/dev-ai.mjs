import { spawn } from 'node:child_process'
import { getAiEnvVisibility, loadEnvLocal } from './ai-env.mjs'

const { exists } = loadEnvLocal()
const visibility = getAiEnvVisibility()

console.log('Starting Vercel local backend for live AI testing.')
console.log(`ENV_LOCAL_EXISTS: ${exists}`)
console.log(`GROQ_API_KEY_VISIBLE: ${visibility.GROQ_API_KEY_VISIBLE}`)
console.log(`GROQ_MODEL_VISIBLE: ${visibility.GROQ_MODEL_VISIBLE}`)
console.log('Opening target: http://127.0.0.1:3000')

const child = spawn('npx', ['vercel', 'dev', '--listen', '127.0.0.1:3000'], {
  env: process.env,
  shell: process.platform === 'win32',
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(1)
  }

  process.exit(code ?? 0)
})

child.on('error', (error) => {
  console.error(`Failed to start Vercel dev: ${error.message}`)
  process.exit(1)
})
