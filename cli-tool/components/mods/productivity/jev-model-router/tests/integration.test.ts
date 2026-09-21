/**
 * Live contract tests for the OpenRouter decisions surface.
 *
 * Every case here is an error a unit test cannot see: the request is well-typed
 * TypeScript and still rejected, because the backend's schema is stricter than the
 * mod's types. Each was found by a real call failing in a real session.
 *
 * Skipped without a key. Run: bun test tests/integration.test.ts
 */
import { expect, test } from 'bun:test'
import { DEFAULT_BASE_URL, DEFAULT_MODEL, endpoint, questions, requestHeaders } from '../hooks/policy.ts'

const KEY_FILE = `${process.env.HOME}/.claude/.openrouter-key`
const key = await Bun.file(KEY_FILE)
  .text()
  .then((t) => t.trim())
  .catch(() => '')
const live = key ? test : test.skip
const URL = endpoint('openrouter', DEFAULT_BASE_URL.openrouter)
const MODEL = DEFAULT_MODEL.openrouter

async function post(body: unknown) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: requestHeaders('openrouter', key, MODEL),
    body: JSON.stringify(body),
  })
  return { status: res.status, text: await res.text() }
}

const STATE = { task: 'Rename a local variable and update its three uses.' }

live('the happy path answers every question and reports confidence', async () => {
  const { status, text } = await post({ model: MODEL, state: STATE, questions: questions('openrouter') })
  expect(status).toBe(200)
  const answers = JSON.parse(text).answers
  expect(Object.keys(answers).sort()).toEqual(['effort', 'risky', 'tier'])
  expect(typeof answers.tier.confidence).toBe('number')
  expect(typeof answers.risky.noul).toBe('number')
})

live('omitting the model is rejected: the decisions API takes it in the body', async () => {
  const { status } = await post({ state: STATE, questions: questions('openrouter') })
  expect(status).toBe(400)
})

live("the SDK's `boolean` type is rejected; the decision APIs want `noul`", async () => {
  const { status, text } = await post({
    model: MODEL,
    state: STATE,
    questions: { risky: { type: 'boolean', instructions: 'Is this risky?' } },
  })
  expect(status).toBe(400)
  expect(text).toContain('noul')
})

live('a Choice question is capped at 255 options', async () => {
  const criteria: Record<string, string> = {}
  for (let i = 0; i < 256; i++) criteria[`s${i}`] = `skill number ${i}`
  const { status } = await post({
    model: MODEL,
    state: STATE,
    questions: { which: { type: 'choice', instructions: 'Which one?', criteria } },
  })
  expect(status).toBe(400)

  const under: Record<string, string> = {}
  for (let i = 0; i < 255; i++) under[`s${i}`] = `skill number ${i}`
  const ok = await post({
    model: MODEL,
    state: STATE,
    questions: { which: { type: 'choice', instructions: 'Which one?', criteria: under } },
  })
  expect(ok.status).toBe(200)
})
