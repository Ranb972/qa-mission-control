import { getAiEnvVisibility, loadEnvLocal } from './ai-env.mjs'

const { exists } = loadEnvLocal()
const visibility = getAiEnvVisibility()

console.log(`ENV_LOCAL_EXISTS: ${exists}`)
console.log(`GROQ_API_KEY_VISIBLE: ${visibility.GROQ_API_KEY_VISIBLE}`)
console.log(`GROQ_MODEL_VISIBLE: ${visibility.GROQ_MODEL_VISIBLE}`)
