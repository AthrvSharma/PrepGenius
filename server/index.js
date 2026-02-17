import 'dotenv/config'
import express from 'express'
import cors from 'cors'

const app = express()

const port = Number(process.env.AI_PORT || 8787)
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 90_000)
const allowedOrigins = process.env.AI_ALLOWED_ORIGINS
  ? process.env.AI_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
  : ['http://localhost:3000']

app.use(cors({ origin: allowedOrigins, credentials: true }))
app.use(express.json({ limit: '2mb' }))

const requestLogs = []
const REQUEST_LOG_LIMIT = Number(process.env.AI_LOG_BUFFER || 200)

function logEvent(level, message, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...meta,
  }
  requestLogs.push(entry)
  if (requestLogs.length > REQUEST_LOG_LIMIT) requestLogs.shift()
  if (level === 'error') {
    console.error(`[AI] ${message}`, meta)
  } else if (process.env.AI_LOG_LEVEL !== 'silent') {
    console.log(`[AI] ${message}`, meta)
  }
}

const rateState = new Map()
const RATE_LIMIT = Number(process.env.AI_RATE_LIMIT || 30)
const RATE_WINDOW_MS = Number(process.env.AI_RATE_WINDOW_MS || 60_000)

function rateLimit(req, res, next) {
  const now = Date.now()
  const actionKey = req.body?.action || req.path
  const key = `${req.ip || 'unknown'}:${actionKey}`
  const entry = rateState.get(key) || { count: 0, start: now }

  if (now - entry.start > RATE_WINDOW_MS) {
    entry.start = now
    entry.count = 0
  }

  entry.count += 1
  rateState.set(key, entry)

  if (entry.count > RATE_LIMIT) {
    return res.status(429).json({ error: 'Rate limit exceeded' })
  }

  return next()
}

function createRequestId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || createRequestId()
  res.setHeader('x-request-id', req.requestId)
  next()
})

app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    logEvent('info', 'request', {
      requestId: req.requestId,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
      action: req.body?.action,
    })
  })
  next()
})

function sanitize(text = '') {
  return String(text).replace(/<[^>]*>/g, '').trim().slice(0, 4000)
}

function sanitizeArray(values = []) {
  return Array.isArray(values)
    ? values.map((value) => sanitize(value)).filter(Boolean)
    : []
}

function sanitizeCoverage(values = []) {
  if (!Array.isArray(values)) return []
  return values
    .map((item) => ({
      concept: sanitize(item?.concept || ''),
      covered: Boolean(item?.covered),
      evidence: sanitize(item?.evidence || ''),
      gap: sanitize(item?.gap || ''),
    }))
    .filter((item) => item.concept)
}

const responseCache = new Map()
const CACHE_TTL_MS = Number(process.env.AI_CACHE_TTL_MS || 15 * 60_000)

function hashKey(input = '') {
  let hash = 5381
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i)
  }
  return `h${(hash >>> 0).toString(36)}`
}

function getCache(key) {
  const entry = responseCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key)
    return null
  }
  return entry.value
}

function setCache(key, value, ttl = CACHE_TTL_MS) {
  responseCache.set(key, { value, expiresAt: Date.now() + ttl })
}

function withTimeout(promise, timeoutMs, errorMessage) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const wrapped = Promise.resolve(promise(controller.signal))
  return wrapped.finally(() => clearTimeout(timer))
    .catch((err) => {
      if (err?.name === 'AbortError') {
        throw new Error(errorMessage || 'Request timed out')
      }
      throw err
    })
}

const CODE_RUNNER_URL = process.env.CODE_RUNNER_URL || 'https://emkc.org/api/v2/piston/execute'
const CODE_TIMEOUT_MS = Number(process.env.CODE_TIMEOUT_MS || 20000)
const CODE_MAX_SIZE = Number(process.env.CODE_MAX_SIZE || 120_000)
const CODE_MAX_TESTS = Number(process.env.CODE_MAX_TESTS || 30)
const CODE_LANGUAGES = {
  javascript: { language: 'javascript', version: '18.15.0' },
  python: { language: 'python', version: '3.10.0' },
  java: { language: 'java', version: '15.0.2' },
  cpp: { language: 'c++', version: '10.2.0' },
}
const CODE_FILE_NAMES = {
  javascript: 'main.js',
  python: 'main.py',
  java: 'Main.java',
  cpp: 'main.cpp',
}

async function runCode(language, code, tests) {
  const runtime = CODE_LANGUAGES[language]
  if (!runtime) {
    return { error: `Language ${language} is not supported.` }
  }
  if (typeof code !== 'string' || code.length > CODE_MAX_SIZE) {
    return { error: 'Code payload too large or invalid.' }
  }
  if (!Array.isArray(tests)) {
    return { error: 'Tests must be an array.' }
  }
  if (tests.length > CODE_MAX_TESTS) {
    return { error: 'Too many test cases.' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CODE_TIMEOUT_MS)
  try {
    const response = await fetch(CODE_RUNNER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: runtime.language,
        version: runtime.version,
        files: [
          {
            name: CODE_FILE_NAMES[language] || 'main.txt',
            content: code,
          },
        ],
        stdin: JSON.stringify(tests || []),
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text()
      return { error: text || 'Code runner failed.' }
    }

    const data = await response.json()
    const compileErr = data?.compile?.stderr || ''
    const compileCode = data?.compile?.code ?? 0
    if (compileCode !== 0) {
      return { error: compileErr || 'Compilation failed.' }
    }

    const output = data?.run?.stdout || ''
    const stderr = data?.run?.stderr || ''
    const exitCode = data?.run?.code ?? 0
    if (exitCode !== 0) {
      return { error: stderr || output || 'Execution failed.' }
    }

    const parsed = parseJson(output)
    if (!Array.isArray(parsed)) {
      const extra = stderr || output
      return { error: extra ? extra.slice(0, 600) : 'Runner did not return a JSON array.' }
    }
    return { outputs: parsed }
  } catch (err) {
    const message = err?.name === 'AbortError' ? 'Execution timed out.' : 'Execution failed.'
    return { error: message }
  } finally {
    clearTimeout(timeout)
  }
}

async function callOpenAI(messages, options = {}) {
  const apiKey = process.env.OPENAI_API_KEY || ''
  const model =
    options.model ||
    process.env.OPENAI_MODEL_FAST ||
    process.env.OPENAI_MODEL ||
    'gpt-4o'
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com'
  const isLocal = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')
  const isCloudflare = baseUrl.includes('api.cloudflare.com')
  const responseFormatMode = (
    process.env.OPENAI_RESPONSE_FORMAT ||
    (isCloudflare ? 'off' : '')
  ).trim().toLowerCase()
  const wantsStructuredOutput = options.forceJson || responseFormatMode === 'json'
  const shouldDisableStructuredOutput = responseFormatMode === 'off'
  const useResponseFormat =
    !isLocal &&
    wantsStructuredOutput &&
    !shouldDisableStructuredOutput

  if (!apiKey && !isLocal) {
    throw new Error('OPENAI_API_KEY is not set')
  }

  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const body = {
    model,
    messages,
    temperature: options.temperature ?? 0.2,
  }
  const maxTokens = Number(
    options.maxTokens ??
    process.env.OPENAI_MAX_TOKENS ??
    0
  )
  if (Number.isFinite(maxTokens) && maxTokens > 0) {
    body.max_tokens = Math.floor(maxTokens)
  }
  if (useResponseFormat) {
    if (isCloudflare) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'structured_output',
          schema: {
            type: 'object',
            additionalProperties: true,
          },
        },
      }
    } else {
      body.response_format = { type: 'json_object' }
    }
  }

  const maxRetries = Number(options.retries ?? 1)
  let lastError
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await withTimeout(
        (signal) =>
          fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal,
          }),
        AI_TIMEOUT_MS,
        'AI request timed out.'
      )

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error || 'OpenAI request failed')
      }

      const data = await response.json()
      const message = data?.choices?.[0]?.message || {}
      if (message?.parsed && typeof message.parsed === 'object') {
        return JSON.stringify(message.parsed)
      }

      const content = message?.content
      if (typeof content === 'string') {
        return content
      }
      if (Array.isArray(content)) {
        const text = content
          .map((part) => {
            if (typeof part === 'string') return part
            if (typeof part?.text === 'string') return part.text
            if (typeof part?.content === 'string') return part.content
            return ''
          })
          .filter(Boolean)
          .join('\n')
          .trim()
        if (text) return text
      }
      if (content && typeof content === 'object') {
        return JSON.stringify(content)
      }
      if (data?.response && typeof data.response === 'object') {
        return JSON.stringify(data.response)
      }
      if (typeof data?.response === 'string') {
        return data.response
      }
      return '{}'
    } catch (err) {
      lastError = err
      const message = isLocal
        ? `AI provider not reachable at ${baseUrl}. Start Ollama with \"ollama serve\" and ensure the model is pulled.`
        : 'Failed to reach the AI provider.'
      const isNetwork = err?.message?.includes('fetch') || err?.message?.includes('Failed to reach')
      if (isNetwork && attempt === maxRetries) {
        throw new Error(message)
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
        continue
      }
      throw err
    }
  }
  throw lastError || new Error('OpenAI request failed')
}

function normalizeJsonString(raw) {
  if (!raw || typeof raw !== 'string') return ''
  let text = raw.trim()
  text = text.replace(/```json|```/gi, '')
  text = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
  // Remove trailing commas before closing brackets
  text = text.replace(/,\s*([}\]])/g, '$1')
  return text.trim()
}

function tryParseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function closeOpenJsonStructures(text) {
  if (typeof text !== 'string' || !text) return text
  const stack = []
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') {
      stack.push('}')
      continue
    }
    if (ch === '[') {
      stack.push(']')
      continue
    }
    if (ch === '}' || ch === ']') {
      if (!stack.length) continue
      if (stack[stack.length - 1] === ch) {
        stack.pop()
      }
    }
  }

  let output = text
  if (inString) output += '"'
  while (stack.length) {
    output += stack.pop()
  }
  return output
}

function parseJson(content) {
  if (content && typeof content === 'object') {
    return content
  }
  if (typeof content !== 'string') {
    return null
  }
  const normalized = normalizeJsonString(content)
  let parsed = tryParseJson(normalized)
  if (parsed) return parsed

  const closed = closeOpenJsonStructures(normalized)
  if (closed && closed !== normalized) {
    parsed = tryParseJson(closed)
    if (parsed) return parsed
  }

  // Try to extract the first JSON object/array
  const arrayMatch = normalized.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    parsed = tryParseJson(arrayMatch[0])
    if (parsed) return parsed
  }

  const objMatch = normalized.match(/\{[\s\S]*\}/)
  if (objMatch) {
    parsed = tryParseJson(objMatch[0])
    if (parsed) return parsed
  }

  // Last-resort: attempt to convert single quotes to double quotes for JSON-ish outputs
  const singleQuoteNormalized = normalized
    .replace(/:\s*'([^']*)'/g, ': "$1"')
    .replace(/'([^']*)'\s*:/g, '"$1":')
    .replace(/,\s*([}\]])/g, '$1')

  parsed = tryParseJson(singleQuoteNormalized)
  if (parsed) return parsed

  if (objMatch) {
    parsed = tryParseJson(
      objMatch[0]
        .replace(/:\s*'([^']*)'/g, ': "$1"')
        .replace(/'([^']*)'\s*:/g, '"$1":')
        .replace(/,\s*([}\]])/g, '$1')
    )
    if (parsed) return parsed
  }

  if (arrayMatch) {
    parsed = tryParseJson(
      arrayMatch[0]
        .replace(/:\s*'([^']*)'/g, ': "$1"')
        .replace(/'([^']*)'\s*:/g, '"$1":')
        .replace(/,\s*([}\]])/g, '$1')
    )
    if (parsed) return parsed
  }

  return null
}

async function repairJson(raw, schemaHint = '') {
  const rawText = String(raw || '').slice(0, 12000)
  const system = `You are a JSON repair tool. Return ONLY valid JSON.`
  const user = `Fix this into valid JSON${schemaHint ? ` for schema: ${schemaHint}` : ''}:\n${rawText}`
  const repaired = await callOpenAI(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { temperature: 0, forceJson: true, retries: 2, maxTokens: 1400 }
  )
  return parseJson(repaired)
}

async function parseOrRepair(raw, schemaHint = '') {
  const parsed = parseJson(raw)
  if (parsed) return parsed
  return repairJson(raw, schemaHint)
}

const ALLOWED_ACTIONS = new Set([
  'generateText',
  'generateHint',
  'explainConcept',
  'generateInterviewQuestion',
  'evaluateAnswer',
  'finalReport',
  'resumeAnalysis',
  'jobMatchAnalysis',
  'dashboardInsights',
  'generateRoadmap',
  'updateRoadmap',
  'coachSummary',
  'learningTopicExpansion',
  'learningAnswerReview',
])

const CACHEABLE_ACTIONS = new Set([
  'resumeAnalysis',
  'jobMatchAnalysis',
  'dashboardInsights',
  'generateRoadmap',
  'updateRoadmap',
  'learningTopicExpansion',
])

function clampScore(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return Math.max(0, Math.min(100, number))
}

function computeWeightedScore(source, weights) {
  let sum = 0
  let totalWeight = 0
  Object.entries(weights).forEach(([key, weight]) => {
    const value = clampScore(source?.[key])
    if (value === null) return
    sum += value * weight
    totalWeight += weight
  })
  if (!totalWeight) return null
  return Math.round(sum / totalWeight)
}

function normalizeEvaluation(raw = {}) {
  const breakdown = raw.breakdown || {}
  const normalizedBreakdown = {
    correctness: Number(breakdown.correctness || 0),
    conceptCoverage: Number(breakdown.conceptCoverage || 0),
    clarity: Number(breakdown.clarity || 0),
    depth: Number(breakdown.depth || 0),
    communication: Number(breakdown.communication || 0),
    total: 0,
  }
  normalizedBreakdown.total =
    normalizedBreakdown.correctness +
    normalizedBreakdown.conceptCoverage +
    normalizedBreakdown.clarity +
    normalizedBreakdown.depth +
    normalizedBreakdown.communication

  let score = Number(raw.score ?? normalizedBreakdown.total)
  if (!Number.isFinite(score)) score = normalizedBreakdown.total
  score = Math.max(0, Math.min(100, score))
  let confidence = Number(raw.confidence ?? 0)
  if (!Number.isFinite(confidence)) confidence = 0
  confidence = Math.max(0, Math.min(100, confidence))
  const scoreRationale = raw.scoreRationale || {}
  return {
    score,
    breakdown: normalizedBreakdown,
    confidence,
    strengths: sanitizeArray(raw.strengths || []),
    weaknesses: sanitizeArray(raw.weaknesses || []),
    mistakesFound: sanitizeArray(raw.mistakesFound || []),
    missingConcepts: sanitizeArray(raw.missingConcepts || []),
    coverage: sanitizeCoverage(raw.coverage || []),
    improvements: sanitizeArray(raw.improvements || []),
    idealAnswer: sanitize(raw.idealAnswer || ''),
    nextSteps: sanitizeArray(raw.nextSteps || []),
    followUp: sanitize(raw.followUp || ''),
    scoreRationale: {
      correctness: sanitize(scoreRationale.correctness || ''),
      conceptCoverage: sanitize(scoreRationale.conceptCoverage || ''),
      clarity: sanitize(scoreRationale.clarity || ''),
      depth: sanitize(scoreRationale.depth || ''),
      communication: sanitize(scoreRationale.communication || ''),
    },
    isUncertain: Boolean(raw.isUncertain),
  }
}

function normalizeResumeAnalysis(raw = {}) {
  const normalized = { ...raw }
  const scoreFields = [
    'atsScore',
    'keywordMatchScore',
    'formattingScore',
    'readabilityScore',
    'impactScore',
    'roleFitScore',
    'atsCompatibilityScore',
    'sectionCompletenessScore',
    'impactDensity',
  ]

  scoreFields.forEach((field) => {
    const value = clampScore(raw[field])
    if (value !== null) {
      normalized[field] = value
    }
  })

  const computedAts = computeWeightedScore(normalized, {
    keywordMatchScore: 30,
    roleFitScore: 20,
    impactScore: 15,
    formattingScore: 10,
    readabilityScore: 10,
    atsCompatibilityScore: 10,
    sectionCompletenessScore: 5,
  })

  if (computedAts !== null) {
    normalized.atsScore = computedAts
  }

  return normalized
}

function normalizeJobMatch(raw = {}) {
  const normalized = { ...raw }
  const scoreFields = ['matchScore', 'keywordCoverage', 'roleFitScore', 'experienceScore']
  scoreFields.forEach((field) => {
    const value = clampScore(raw[field])
    if (value !== null) {
      normalized[field] = value
    }
  })

  const computedMatch = computeWeightedScore(normalized, {
    keywordCoverage: 40,
    roleFitScore: 35,
    experienceScore: 25,
  })

  if (computedMatch !== null) {
    normalized.matchScore = computedMatch
  }

  return normalized
}

function normalizeDifficulty(value, fallback = 'Medium') {
  const v = sanitize(value || '').toLowerCase()
  if (v === 'easy') return 'Easy'
  if (v === 'hard') return 'Hard'
  if (v === 'medium') return 'Medium'
  return fallback
}

function normalizeQuestionType(value, fallback = 'theory') {
  const v = sanitize(value || '').toLowerCase()
  if (['theory', 'coding', 'system', 'behavioral'].includes(v)) return v
  return fallback
}

function normalizeScoringWeights(raw = {}) {
  const defaults = {
    correctness: 40,
    conceptCoverage: 25,
    clarity: 15,
    depth: 10,
    communication: 10,
  }
  const fields = Object.keys(defaults)
  const sanitizedWeights = {}
  let total = 0

  fields.forEach((field) => {
    const value = Number(raw?.[field])
    const normalized = Number.isFinite(value) && value > 0 ? value : defaults[field]
    sanitizedWeights[field] = normalized
    total += normalized
  })

  if (total <= 0) return defaults
  if (total === 100) return sanitizedWeights

  const ratio = 100 / total
  const adjusted = {}
  fields.forEach((field, index) => {
    if (index === fields.length - 1) {
      const used = fields
        .slice(0, index)
        .reduce((sum, current) => sum + adjusted[current], 0)
      adjusted[field] = Math.max(0, 100 - used)
      return
    }
    adjusted[field] = Math.max(1, Math.round(sanitizedWeights[field] * ratio))
  })
  return adjusted
}

function normalizeRubric(raw = {}) {
  return {
    expectedConcepts: sanitizeArray(raw.expectedConcepts || []).slice(0, 10),
    keyPoints: sanitizeArray(raw.keyPoints || []).slice(0, 12),
    commonMistakes: sanitizeArray(raw.commonMistakes || []).slice(0, 8),
    edgeCases: sanitizeArray(raw.edgeCases || []).slice(0, 8),
    scoringWeights: normalizeScoringWeights(raw.scoringWeights || {}),
    idealAnswer: sanitize(raw.idealAnswer || ''),
    explanation: sanitize(raw.explanation || ''),
  }
}

function normalizeInterviewQuestion(raw = {}, payload = {}) {
  const preferredDomains = sanitizeArray(payload?.preferredDomains || [])
  const fallbackDomain = preferredDomains[0] || 'General'
  const fallbackDifficulty = normalizeDifficulty(payload?.desiredDifficulty, 'Medium')
  const questionText = sanitize(raw.question || raw.prompt || raw.questionText || '')
  const rubric = normalizeRubric(raw.rubric || raw)
  const fallbackKeyPoint = rubric.keyPoints[0] || rubric.expectedConcepts[0] || 'core concept'

  return {
    questionId: sanitize(raw.questionId || `ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`),
    question: questionText || `Explain ${fallbackKeyPoint} and its trade-offs.`,
    difficulty: normalizeDifficulty(raw.difficulty, fallbackDifficulty),
    domain: sanitize(raw.domain || fallbackDomain),
    tags: sanitizeArray(raw.tags || []).slice(0, 8),
    type: normalizeQuestionType(raw.type, 'theory'),
    timeEstimateMin: Math.max(5, Math.min(35, Number(raw.timeEstimateMin || 8))),
    rubric,
    interviewerNote: sanitize(raw.interviewerNote || ''),
    starterCode: sanitize(raw.starterCode || ''),
  }
}

function normalizeFlashcards(raw = []) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => ({
      front: sanitize(item?.front || item?.question || ''),
      back: sanitize(item?.back || item?.answer || ''),
    }))
    .filter((item) => item.front && item.back)
    .slice(0, 8)
}

function normalizeTopicQuiz(raw = []) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => ({
      question: sanitize(item?.question || item?.prompt || ''),
      expectedPoints: sanitizeArray(item?.expectedPoints || item?.keyPoints || []).slice(0, 6),
      difficulty: normalizeDifficulty(item?.difficulty, 'Medium'),
    }))
    .filter((item) => item.question)
    .slice(0, 6)
}

function normalizeLearningTopicExpansion(raw = {}, payload = {}) {
  const topic = payload?.topic || {}
  const title = sanitize(topic.title || payload?.topicTitle || '')
  const fallbackQuestion = sanitizeArray(topic.practiceQuestions || [])[0] || `How would you apply ${title || 'this concept'} in a real project?`

  return {
    title: sanitize(raw.title || title),
    summary: sanitize(raw.summary || topic.explanation || topic.definition || ''),
    keyIdeas: sanitizeArray(raw.keyIdeas || topic?.rubric?.expectedConcepts || []).slice(0, 8),
    realWorldUseCases: sanitizeArray(raw.realWorldUseCases || []).slice(0, 8),
    pitfalls: sanitizeArray(raw.pitfalls || topic.commonMistakes || []).slice(0, 8),
    memoryTips: sanitizeArray(raw.memoryTips || []).slice(0, 6),
    flashcards: normalizeFlashcards(raw.flashcards || []),
    quiz: normalizeTopicQuiz(raw.quiz || []),
    challenge: sanitize(raw.challenge || ''),
    nextTopics: sanitizeArray(raw.nextTopics || []).slice(0, 6),
    fallbackQuestion,
  }
}

function normalizeLearningAnswerReview(raw = {}, payload = {}) {
  const verdictRaw = sanitize(raw.verdict || '').toLowerCase()
  const verdict = verdictRaw === 'strong'
    ? 'Strong'
    : verdictRaw === 'incorrect'
      ? 'Incorrect'
      : 'Needs Improvement'

  return {
    score: clampScore(raw.score) ?? 0,
    verdict,
    feedback: sanitize(raw.feedback || ''),
    strengths: sanitizeArray(raw.strengths || []).slice(0, 6),
    improvements: sanitizeArray(raw.improvements || []).slice(0, 8),
    missingPoints: sanitizeArray(raw.missingPoints || []).slice(0, 8),
    modelAnswer: sanitize(raw.modelAnswer || ''),
    nextStep: sanitize(raw.nextStep || ''),
    isInvalid: Boolean(raw.isInvalid),
    invalidReason: sanitize(raw.invalidReason || ''),
    question: sanitize(payload?.question || ''),
  }
}

function validateFreeformAnswer(input, options = {}) {
  const value = sanitize(input || '')
  const minChars = Number(options.minChars || 25)
  const minWords = Number(options.minWords || 6)
  const lowered = value.toLowerCase()
  const words = value.split(/\s+/).filter(Boolean)

  if (!value) {
    return { ok: false, reason: 'Please enter an answer before submitting.' }
  }
  if (value.length < minChars || words.length < minWords) {
    return {
      ok: false,
      reason: `Answer is too short. Write at least ${minWords} words with a clear explanation.`,
    }
  }

  const invalidMarkers = [
    'idk',
    "i don't know",
    'dont know',
    'no idea',
    'n/a',
    'none',
    'skip',
    'asdf',
    '???',
    '...',
  ]
  if (invalidMarkers.some((marker) => lowered.includes(marker))) {
    return {
      ok: false,
      reason: 'Answer looks invalid. Please provide a real explanation with key points.',
    }
  }

  if (/^(.)\1{6,}$/.test(lowered.replace(/\s+/g, ''))) {
    return {
      ok: false,
      reason: 'Answer looks invalid. Please write a meaningful response.',
    }
  }

  const uniqueWords = new Set(words.map((word) => word.toLowerCase()))
  if (uniqueWords.size <= Math.max(2, Math.floor(words.length / 6))) {
    return {
      ok: false,
      reason: 'Answer is too repetitive. Add clearer explanation and examples.',
    }
  }

  return { ok: true, reason: '' }
}

function buildFallbackEvaluation() {
  return normalizeEvaluation({
    score: 0,
    confidence: 0,
    breakdown: {
      correctness: 0,
      conceptCoverage: 0,
      clarity: 0,
      depth: 0,
      communication: 0,
      total: 0,
    },
    strengths: [],
    weaknesses: [],
    mistakesFound: [],
    missingConcepts: [],
    coverage: [],
    improvements: ['Answer with structure: assumptions, approach, edge cases, complexity.'],
    idealAnswer: '',
    nextSteps: [
      'State assumptions first.',
      'Walk through one concrete example.',
      'Call out complexity and trade-offs.',
    ],
    followUp: 'Can you explain your approach step-by-step?',
    isUncertain: true,
  })
}

function buildFallbackRoadmap(payload = {}) {
  const focusAreas = sanitizeArray(payload?.focusAreas || [])
  const experienceLevel = sanitize(payload?.experienceLevel || 'Intermediate')
  const targetRole = sanitize(payload?.targetRole || 'Interview readiness')

  return {
    summary: 'Personalized roadmap is temporarily unavailable. Using a safe starter plan.',
    currentLevel: experienceLevel || 'Intermediate',
    primaryGoal: targetRole || 'Interview readiness',
    phases: [
      {
        title: 'Foundation',
        duration: '2 weeks',
        objective: 'Build a daily interview-prep rhythm.',
        focusDomains: focusAreas,
        actions: [
          'Solve 3 easy problems daily.',
          'Do one mock interview per week.',
          'Review one weak concept every day.',
        ],
        progress: 20,
      },
      {
        title: 'Depth',
        duration: '3 weeks',
        objective: 'Improve explanation quality and medium-level solving.',
        focusDomains: focusAreas,
        actions: [
          'Solve 4 medium problems per week.',
          'Write short time/space analysis after each solution.',
          'Practice one system-design prompt weekly.',
        ],
        progress: 45,
      },
      {
        title: 'Readiness',
        duration: '2 weeks',
        objective: 'Simulate interviews and close final gaps.',
        focusDomains: focusAreas,
        actions: [
          'Complete 2 timed mocks per week.',
          'Retry failed questions with improved explanations.',
          'Refine resume/project impact bullets.',
        ],
        progress: 70,
      },
    ],
    weeklyPlan: [
      {
        week: 'Week 1',
        focus: focusAreas,
        tasks: ['Warm-up problems', 'Mock interview', 'Weak-area review'],
      },
    ],
    nextActions: [
      'Complete one timed mock interview.',
      'Solve 3 easy + 1 medium problem.',
      'Review one weak concept from your last report.',
    ],
  }
}

function buildFallbackFinalReport(evaluations = []) {
  const validScores = Array.isArray(evaluations)
    ? evaluations
      .map((item) => Number(item?.score))
      .filter((score) => Number.isFinite(score))
    : []
  const totalScore = validScores.length
    ? Math.round(validScores.reduce((sum, score) => sum + score, 0) / validScores.length)
    : 0

  return {
    totalScore,
    strengths: [],
    weaknesses: [],
    recommendations: [
      'Use a clear structure in answers.',
      'Explain trade-offs and complexity.',
      'Practice one timed mock session this week.',
    ],
  }
}

function buildFallbackInterviewQuestion(payload = {}) {
  const preferredDomains = sanitizeArray(payload?.preferredDomains || [])
  const domain = preferredDomains[0] || 'General'
  const difficulty = normalizeDifficulty(payload?.desiredDifficulty, 'Medium')
  return normalizeInterviewQuestion({
    question: `As a recruiter, explain a real scenario where ${domain} decisions affected system reliability.`,
    difficulty,
    domain,
    type: 'theory',
    tags: [domain, 'communication', 'trade-offs'],
    timeEstimateMin: 8,
    interviewerNote: 'I am evaluating clarity, trade-offs, and practical thinking.',
    rubric: {
      expectedConcepts: ['clear assumptions', 'step-by-step approach', 'trade-offs'],
      keyPoints: [
        'define context and constraints',
        'explain chosen approach',
        'mention one alternative and why not chosen',
        'state expected impact',
      ],
      commonMistakes: ['vague answer', 'no trade-off discussion', 'missing practical example'],
      edgeCases: ['failure mode', 'scale increase'],
    },
  }, payload)
}

function buildFallbackLearningTopicExpansion(payload = {}) {
  const topic = payload?.topic || {}
  const title = sanitize(topic?.title || payload?.topicTitle || 'Topic')
  const practice = sanitizeArray(topic?.practiceQuestions || [])
  return normalizeLearningTopicExpansion({
    title,
    summary: sanitize(topic?.explanation || topic?.definition || `Learn ${title} with concepts, examples, and revision drills.`),
    keyIdeas: [
      `Core definition of ${title}`,
      'How to apply it in interviews',
      'Common edge cases and pitfalls',
    ],
    realWorldUseCases: [
      `Use ${title} while designing maintainable systems.`,
      `Use ${title} to justify trade-offs in interview answers.`,
    ],
    pitfalls: sanitizeArray(topic?.commonMistakes || ['Skipping constraints', 'No concrete example']),
    memoryTips: [
      'Explain in three parts: what, why, when.',
      'Always give one real scenario.',
      'Compare with a related concept.',
    ],
    flashcards: [
      { front: `What is ${title}?`, back: sanitize(topic?.definition || `Define ${title} and why it matters.`) },
      { front: `When would you use ${title}?`, back: 'Use it when constraints and trade-offs matter.' },
    ],
    quiz: [
      {
        question: practice[0] || `How would you explain ${title} to an interviewer in under 90 seconds?`,
        expectedPoints: ['clear definition', 'one practical scenario', 'one trade-off'],
      },
      {
        question: practice[1] || `What common mistake should be avoided in ${title}?`,
        expectedPoints: ['name one pitfall', 'show correction'],
      },
    ],
    challenge: `Write a concise explanation of ${title} with one real-world example.`,
    nextTopics: practice.slice(0, 3),
  }, payload)
}

function buildFallbackLearningAnswerReview(payload = {}, reason = '') {
  const invalidReason = sanitize(reason || '')
  if (invalidReason) {
    return normalizeLearningAnswerReview({
      score: 0,
      verdict: 'Incorrect',
      feedback: 'Your answer could not be evaluated.',
      strengths: [],
      improvements: ['Write a clearer and longer explanation.'],
      missingPoints: ['core idea', 'example', 'trade-off'],
      modelAnswer: '',
      nextStep: 'Retry with a structured response.',
      isInvalid: true,
      invalidReason,
    }, payload)
  }

  return normalizeLearningAnswerReview({
    score: 0,
    verdict: 'Needs Improvement',
    feedback: 'AI review is temporarily unavailable.',
    strengths: [],
    improvements: ['Use a structured format: definition, approach, example, trade-off.'],
    missingPoints: ['core explanation'],
    modelAnswer: '',
    nextStep: 'Retry with more detail.',
    isInvalid: false,
    invalidReason: '',
  }, payload)
}

function buildActionFallback(action, payload = {}) {
  const focusAreas = sanitizeArray(payload?.focusAreas || [])

  switch (action) {
    case 'generateText':
      return { text: 'AI response is temporarily unavailable. Please retry in a moment.' }
    case 'generateHint':
      return { hint: 'Start with assumptions, then explain approach and one edge case.' }
    case 'explainConcept':
      return { explanation: 'Define the concept, explain how it works, and mention one trade-off.' }
    case 'generateInterviewQuestion':
      return buildFallbackInterviewQuestion(payload)
    case 'evaluateAnswer':
      return buildFallbackEvaluation()
    case 'finalReport':
      return buildFallbackFinalReport(payload?.evaluations || [])
    case 'resumeAnalysis':
      return normalizeResumeAnalysis({
        atsScore: 0,
        keywordMatchScore: 0,
        formattingScore: 0,
        readabilityScore: 0,
        impactScore: 0,
        roleFitScore: 0,
        atsCompatibilityScore: 0,
        sectionCompletenessScore: 0,
        impactDensity: 0,
        summary: 'AI analysis is temporarily unavailable.',
        strengths: [],
        weaknesses: [],
        improvements: ['Add quantified impact and role-aligned keywords.'],
        recommendations: ['Retry analysis after a moment.'],
      })
    case 'jobMatchAnalysis':
      return normalizeJobMatch({
        matchScore: 0,
        keywordCoverage: 0,
        roleFitScore: 0,
        experienceScore: 0,
        summary: 'AI job match is temporarily unavailable.',
        matchedSkills: [],
        missingSkills: [],
        recommendedKeywords: [],
        nextSteps: ['Retry analysis after a moment.'],
      })
    case 'dashboardInsights':
      return {
        learningPlan: focusAreas.slice(0, 3).map((focus, index) => ({
          title: `Focus Block ${index + 1}`,
          focus,
          difficulty: 'Medium',
          duration: '30 min',
          progress: 0,
          why: 'Fallback plan while AI insights are temporarily unavailable.',
        })),
        dailyChallenge: {
          title: 'Structured Answer Drill',
          description: 'Answer one interview question using assumptions, approach, and edge cases.',
          difficulty: 'Medium',
          duration: '20 min',
          successCriteria: [
            'State assumptions clearly',
            'Explain approach step-by-step',
            'Mention complexity and one edge case',
          ],
        },
      }
    case 'generateRoadmap':
      return buildFallbackRoadmap(payload)
    case 'coachSummary':
      return {
        summary: 'AI coach summary is temporarily unavailable. Continue targeted practice.',
        focusAreas: sanitizeArray(payload?.weaknesses || []).slice(0, 3),
        nextSteps: [
          'Complete one timed mock interview.',
          'Review your top weak area for 30 minutes.',
          'Retry two previously missed questions.',
        ],
      }
    case 'learningTopicExpansion':
      return buildFallbackLearningTopicExpansion(payload)
    case 'learningAnswerReview':
      return buildFallbackLearningAnswerReview(payload)
    default:
      return null
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/code/execute', rateLimit, async (req, res) => {
  const { language, code, tests } = req.body || {}

  if (!language || !code) {
    return res.status(400).json({ error: 'Missing language or code.' })
  }
  if (!Array.isArray(tests)) {
    return res.status(400).json({ error: 'Tests must be an array.' })
  }

  const result = await runCode(String(language), String(code), tests)
  if (result.error) {
    return res.status(500).json({ error: result.error })
  }
  return res.json({ outputs: result.outputs })
})

app.post('/api/ai', rateLimit, async (req, res) => {
  const { action, payload } = req.body || {}
  const requestId = req.requestId
  const startTime = Date.now()

  try {
    if (!action) {
      return res.status(400).json({ error: 'Missing action' })
    }
    if (!ALLOWED_ACTIONS.has(action)) {
      return res.status(400).json({ error: 'Unknown action' })
    }
    if (payload && JSON.stringify(payload).length > 80_000) {
      return res.status(413).json({ error: 'Payload too large' })
    }

    const cacheKey = CACHEABLE_ACTIONS.has(action)
      ? hashKey(JSON.stringify({ action, payload: payload || {} }))
      : null
    if (cacheKey) {
      const cached = getCache(cacheKey)
      if (cached) {
        logEvent('info', 'cache_hit', { requestId, action })
        return res.json({ data: cached, cached: true })
      }
    }

    if (action === 'generateText') {
      const messages = Array.isArray(payload?.messages) ? payload.messages : []
      const sanitizedMessages = messages.map((message) => ({
        role: message.role || 'user',
        content: sanitize(message.content || ''),
      }))

      const content = await callOpenAI([
        { role: 'system', content: 'Return a concise plain-text response only.' },
        ...sanitizedMessages,
      ], { temperature: 0.2, retries: 1, maxTokens: 500 })

      return res.json({ data: { text: content.replace(/^"|"$/g, '') } })
    }

    if (action === 'generateHint') {
      const question = payload?.question || {}
      const rubric = payload?.rubric || {}
      const answer = sanitize(payload?.answer || '')
      if (!sanitize(question.text || '')) {
        return res.status(400).json({ error: 'Missing question' })
      }

      const system = `You are a technical interview coach. Provide a short, actionable hint. Respond with JSON only.`
      const user = `Question: ${sanitize(question.text || '')}
Domain: ${sanitize(question.domain || '')}
Difficulty: ${sanitize(question.difficulty || '')}

Current answer (if any): ${answer}

Rubric:
Expected Concepts: ${sanitizeArray(rubric.expectedConcepts).join(', ')}
Key Points: ${sanitizeArray(rubric.keyPoints).join(', ')}
Common Mistakes: ${sanitizeArray(rubric.commonMistakes).join(', ')}

Return JSON:
{
  "hint": "string"
}`

      const content = await callOpenAI([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ], { temperature: 0.1, forceJson: true, retries: 1, maxTokens: 260 })

      const parsed = await parseOrRepair(content, 'hint')
      if (!parsed) {
        throw new Error('Failed to parse AI response')
      }

      return res.json({
        data: {
          hint: sanitize(parsed?.hint || parsed?.text || parsed?.explanation || ''),
        },
      })
    }

    if (action === 'explainConcept') {
      const question = payload?.question || {}
      const rubric = payload?.rubric || {}
      if (!sanitize(question.text || '')) {
        return res.status(400).json({ error: 'Missing question' })
      }

      const system = `You are a concise technical interviewer. Explain the core concept in 3-5 sentences. Respond with JSON only.`
      const user = `Question: ${sanitize(question.text || '')}
Domain: ${sanitize(question.domain || '')}
Difficulty: ${sanitize(question.difficulty || '')}

Rubric:
Expected Concepts: ${sanitizeArray(rubric.expectedConcepts).join(', ')}
Key Points: ${sanitizeArray(rubric.keyPoints).join(', ')}

Return JSON:
{
  "explanation": "string"
}`

      const content = await callOpenAI([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ], { temperature: 0.1, forceJson: true, retries: 1, maxTokens: 320 })

      const parsed = await parseOrRepair(content, 'explanation')
      if (!parsed) {
        throw new Error('Failed to parse AI response')
      }

      return res.json({
        data: {
          explanation: sanitize(parsed?.explanation || parsed?.hint || parsed?.text || ''),
        },
      })
    }

    if (action === 'generateInterviewQuestion') {
      const preferredDomains = sanitizeArray(payload?.preferredDomains || [])
      const recentHistory = Array.isArray(payload?.history) ? payload.history.slice(-5) : []
      const askedQuestions = sanitizeArray(payload?.askedQuestions || []).slice(0, 25)
      const desiredDifficulty = normalizeDifficulty(payload?.desiredDifficulty, 'Medium')
      const targetDomain = sanitize(payload?.targetDomain || preferredDomains[0] || 'General')
      const sessionRole = sanitize(payload?.targetRole || payload?.careerPath || '')

      const system = `You are a senior technical recruiter conducting a realistic mock interview.
Rules:
- Ask one interview question only.
- Keep tone realistic and recruiter-like.
- Return JSON only.
- Include rubric fields so the answer can be evaluated strictly.
- Prefer fresh questions, avoid repeating prior prompts.`
      const user = `Target role: ${sessionRole}
Preferred domains: ${preferredDomains.join(', ')}
Primary domain for this question: ${targetDomain}
Desired difficulty: ${desiredDifficulty}
Asked questions (avoid repeats): ${askedQuestions.join(' | ')}
Recent history summary: ${JSON.stringify(recentHistory)}

Return JSON:
{
  "questionId": "string",
  "question": "string",
  "difficulty": "Easy|Medium|Hard",
  "domain": "string",
  "type": "theory|coding|system|behavioral",
  "tags": ["string"],
  "timeEstimateMin": number,
  "interviewerNote": "string",
  "starterCode": "string",
  "rubric": {
    "expectedConcepts": ["string"],
    "keyPoints": ["string"],
    "commonMistakes": ["string"],
    "edgeCases": ["string"],
    "scoringWeights": {
      "correctness": number,
      "conceptCoverage": number,
      "clarity": number,
      "depth": number,
      "communication": number
    },
    "idealAnswer": "string",
    "explanation": "string"
  }
}`

      const content = await callOpenAI([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ], {
        temperature: 0.3,
        forceJson: true,
        retries: 1,
        maxTokens: 1200,
      })

      const parsed = await parseOrRepair(content, 'generateInterviewQuestion')
      if (!parsed) {
        throw new Error('Failed to parse AI response')
      }

      return res.json({ data: normalizeInterviewQuestion(parsed, payload) })
    }

    if (action === 'evaluateAnswer') {
      const question = payload?.question || {}
      const rubric = payload?.rubric || {}
      const answer = sanitize(payload?.answer || '')

      if (!sanitize(question.text || '')) {
        return res.status(400).json({ error: 'Missing question' })
      }
      const answerValidation = validateFreeformAnswer(answer, { minChars: 25, minWords: 6 })
      if (!answerValidation.ok) {
        return res.status(400).json({ error: answerValidation.reason })
      }

      const system = `You are a strict technical interview evaluator. Use the rubric to score the answer.
Rules:
- Respond with JSON ONLY (no markdown).
- Use integers for all score fields.
- breakdown.total must equal the sum of breakdown parts.
- Respect scoring weights.
- If the answer is vague or missing details, set isUncertain=true and ask for clarification in followUp.
- Do not invent facts. If unsure, say so explicitly.
- Keep each string concise (under ~20 words).`

      const user = `Question: ${sanitize(question.text || '')}
Domain: ${sanitize(question.domain || '')}
Difficulty: ${sanitize(question.difficulty || '')}
Type: ${sanitize(question.type || '')}
Tags: ${(question.tags || []).join(', ')}
Time Estimate: ${question.timeEstimateMin || ''} minutes

Answer: ${answer}

Rubric:
Expected Concepts: ${sanitizeArray(rubric.expectedConcepts).join(', ')}
Key Points: ${sanitizeArray(rubric.keyPoints).join(', ')}
Common Mistakes: ${sanitizeArray(rubric.commonMistakes).join(', ')}
Edge Cases: ${sanitizeArray(rubric.edgeCases).join(', ')}
Scoring Weights: ${JSON.stringify(rubric.scoringWeights || {})}

Return JSON with this schema:
{
  "score": number,
  "confidence": number,
  "breakdown": {
    "correctness": number,
    "conceptCoverage": number,
    "clarity": number,
    "depth": number,
    "communication": number,
    "total": number
  },
  "strengths": ["string"],
  "weaknesses": ["string"],
  "mistakesFound": ["string"],
  "missingConcepts": ["string"],
  "coverage": [
    { "concept": "string", "covered": boolean, "evidence": "string", "gap": "string" }
  ],
  "scoreRationale": {
    "correctness": "string",
    "conceptCoverage": "string",
    "clarity": "string",
    "depth": "string",
    "communication": "string"
  },
  "improvements": ["string"],
  "idealAnswer": "string",
  "nextSteps": ["string"],
  "followUp": "string",
  "isUncertain": boolean
}`

      const content = await callOpenAI([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ], { temperature: 0.1, forceJson: true, retries: 1, maxTokens: 1200 })

      const parsed = await parseOrRepair(content, 'evaluation')
      if (!parsed) {
        throw new Error('Failed to parse AI response')
      }

      return res.json({ data: normalizeEvaluation(parsed) })
    }

    if (action === 'finalReport') {
      const evaluations = Array.isArray(payload?.evaluations) ? payload.evaluations : []
      if (!evaluations.length) {
        return res.status(400).json({ error: 'Missing evaluations' })
      }

      const system = `Summarize an interview session based on evaluations. Respond with JSON only.`
      const user = `Evaluations: ${JSON.stringify(evaluations)}
Return JSON:
{
  "totalScore": number,
  "strengths": ["string"],
  "weaknesses": ["string"],
  "recommendations": ["string"]
}`

      const content = await callOpenAI(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        {
          model: process.env.OPENAI_MODEL_ACCURATE || process.env.OPENAI_MODEL,
          forceJson: true,
          retries: 1,
          maxTokens: 800,
        }
      )

      const parsed = await parseOrRepair(content, 'finalReport')
      if (!parsed) {
        throw new Error('Failed to parse AI response')
      }

      if (cacheKey) setCache(cacheKey, parsed)
      return res.json({ data: parsed })
    }

    if (action === 'resumeAnalysis') {
      const resumeText = sanitize(payload?.resumeText || '')
      const filename = sanitize(payload?.filename || '')
      const careerPathId = sanitize(payload?.careerPathId || '')
      if (!resumeText) {
        return res.status(400).json({ error: 'Missing resume text' })
      }

      const system = `You are an ATS resume reviewer and hiring manager. Provide a detailed evaluation with metrics. Respond with JSON only. Keep outputs concise but specific.`
      const user = `Resume filename: ${filename}
Target career path: ${careerPathId}
Resume content (may be partial): ${resumeText}

Return JSON:
{
  "atsScore": number,
  "keywordMatchScore": number,
  "formattingScore": number,
  "readabilityScore": number,
  "impactScore": number,
  "roleFitScore": number,
  "atsCompatibilityScore": number,
  "sectionCompletenessScore": number,
  "impactDensity": number,
  "readabilityGrade": "string",
  "languageTone": "string",
  "summary": "string",
  "strengths": ["string"],
  "weaknesses": ["string"],
  "improvements": ["string"],
  "missingSections": ["string"],
  "redFlags": ["string"],
  "formatRisks": ["string"],
  "suggestedKeywords": ["string"],
  "skills": ["string"],
  "roleSuggestions": ["string"],
  "targetRoleFit": [
    { "role": "string", "fitScore": number, "notes": "string" }
  ],
  "recommendations": ["string"],
  "roleFitSummary": "string",
  "interviewReadiness": "string",
  "sectionsFound": ["string"],
  "sectionCoverage": [
    { "section": "string", "status": "present|missing", "notes": "string" }
  ],
  "atsIssues": ["string"],
  "topAchievements": ["string"],
  "bulletRewriteSuggestions": [
    { "original": "string", "rewritten": "string", "why": "string" }
  ],
  "metrics": {
    "quantifiedImpact": number,
    "actionVerbs": number,
    "projectsMentioned": number
  }
}`

      const content = await callOpenAI([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ], {
        model: process.env.OPENAI_MODEL_ACCURATE || process.env.OPENAI_MODEL,
        forceJson: true,
        retries: 1,
        maxTokens: 2600,
      })

      const parsed = await parseOrRepair(content, 'resumeAnalysis')
      if (!parsed) {
        throw new Error('Failed to parse AI response')
      }

      if (cacheKey) setCache(cacheKey, parsed)
      return res.json({ data: normalizeResumeAnalysis(parsed) })
    }

    if (action === 'jobMatchAnalysis') {
      const resumeText = sanitize(payload?.resumeText || '')
      const jobDescription = sanitize(payload?.jobDescription || '')
      const jobTitle = sanitize(payload?.jobTitle || '')
      const company = sanitize(payload?.company || '')
      const careerPathId = sanitize(payload?.careerPathId || '')

      if (!resumeText || !jobDescription) {
        return res.status(400).json({ error: 'Missing resume or job description text' })
      }

      const system = `You are an ATS analyst and hiring manager. Compare resume to job description and provide actionable match insights. Respond with JSON only.`
      const user = `Job title: ${jobTitle}
Company: ${company}
Target career path: ${careerPathId}
Job description: ${jobDescription}
Resume content: ${resumeText}

Return JSON:
{
  "matchScore": number,
  "keywordCoverage": number,
  "roleFitScore": number,
  "experienceScore": number,
  "summary": "string",
  "matchRationale": "string",
  "matchedSkills": ["string"],
  "missingSkills": ["string"],
  "priorityGaps": ["string"],
  "recommendedKeywords": ["string"],
  "redFlags": ["string"],
  "resumeAdjustments": ["string"],
  "tailoredSummary": "string",
  "interviewTopics": ["string"],
  "nextSteps": ["string"]
}`

      const content = await callOpenAI([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ], {
        model: process.env.OPENAI_MODEL_ACCURATE || process.env.OPENAI_MODEL,
        forceJson: true,
        retries: 1,
        maxTokens: 1600,
      })

      const parsed = await parseOrRepair(content, 'jobMatchAnalysis')
      if (!parsed) {
        throw new Error('Failed to parse AI response')
      }

      if (cacheKey) setCache(cacheKey, parsed)
      return res.json({ data: normalizeJobMatch(parsed) })
    }

    if (action === 'dashboardInsights') {
      const careerPathId = sanitize(payload?.careerPathId || '')
      const currentRole = sanitize(payload?.currentRole || '')
      const targetRole = sanitize(payload?.targetRole || '')
      const interviewTimeline = sanitize(payload?.interviewTimeline || '')
      const weeklyHours = sanitize(payload?.weeklyHours || '')
      const resumeStatus = sanitize(payload?.resumeStatus || '')
      const focusAreas = sanitizeArray(payload?.focusAreas || [])
      const challenges = sanitizeArray(payload?.challenges || [])
      const learningStyle = sanitize(payload?.learningStyle || '')
      const goalStatement = sanitize(payload?.goalStatement || '')
      const strengths = sanitizeArray(payload?.strengths || [])
      const weaknesses = sanitizeArray(payload?.weaknesses || [])
      const domainScores = Array.isArray(payload?.domainScores) ? payload.domainScores : []
      const recentScores = Array.isArray(payload?.recentScores) ? payload.recentScores : []
      const totalInterviews = Number(payload?.totalInterviews || 0)

      const system = `You are an interview coach. Create a concise, personalized learning plan and a daily challenge. Respond with JSON only.`
      const user = `Target career path: ${careerPathId}
Current role: ${currentRole}
Target role: ${targetRole}
Interview timeline: ${interviewTimeline}
Weekly prep hours: ${weeklyHours}
Resume status: ${resumeStatus}
Focus areas: ${focusAreas.join(', ')}
Challenges: ${challenges.join(', ')}
Learning style: ${learningStyle}
Goal statement: ${goalStatement}
Total interviews completed: ${totalInterviews}
Top strengths: ${strengths.join(', ')}
Top weaknesses: ${weaknesses.join(', ')}
Domain scores: ${JSON.stringify(domainScores.slice(0, 8))}
Recent scores: ${JSON.stringify(recentScores.slice(0, 6))}

Return JSON:
{
  "learningPlan": [
    {
      "title": "string",
      "focus": "string",
      "difficulty": "Easy|Medium|Hard",
      "duration": "string",
      "progress": number,
      "why": "string"
    }
  ],
  "dailyChallenge": {
    "title": "string",
    "description": "string",
    "difficulty": "Easy|Medium|Hard",
    "duration": "string",
    "successCriteria": ["string"]
  }
}`

      const content = await callOpenAI([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ], {
        model: process.env.OPENAI_MODEL_ACCURATE || process.env.OPENAI_MODEL,
        forceJson: true,
        retries: 1,
        maxTokens: 1200,
      })

      const parsed = await parseOrRepair(content, 'dashboardInsights')
      if (!parsed) {
        throw new Error('Failed to parse AI response')
      }

      if (cacheKey) setCache(cacheKey, parsed)
      return res.json({ data: parsed })
    }

    if (action === 'generateRoadmap') {
      const careerPathId = sanitize(payload?.careerPathId || '')
      const experienceLevel = sanitize(payload?.experienceLevel || '')
      const currentRole = sanitize(payload?.currentRole || '')
      const targetRole = sanitize(payload?.targetRole || '')
      const interviewTimeline = sanitize(payload?.interviewTimeline || '')
      const weeklyHours = sanitize(payload?.weeklyHours || '')
      const resumeStatus = sanitize(payload?.resumeStatus || '')
      const focusAreas = sanitizeArray(payload?.focusAreas || [])
      const challenges = sanitizeArray(payload?.challenges || [])
      const learningStyle = sanitize(payload?.learningStyle || '')
      const goalStatement = sanitize(payload?.goalStatement || '')
      const domainScores = Array.isArray(payload?.domainScores) ? payload.domainScores : []
      const recentScores = Array.isArray(payload?.recentScores) ? payload.recentScores : []
      const totalInterviews = Number(payload?.totalInterviews || 0)
      const practiceCount = Number(payload?.practiceCount || 0)
      const codingStats = payload?.codingStats || {}

      const system = `You are a senior interview coach. Generate a detailed, actionable roadmap based on the user's profile and progress. Respond with JSON only. Keep tasks specific, ordered, and practical (what to study, how to start, what to build).`
      const user = `Career path: ${careerPathId}
Experience level: ${experienceLevel}
Current role: ${currentRole}
Target role: ${targetRole}
Timeline: ${interviewTimeline}
Weekly prep hours: ${weeklyHours}
Resume status: ${resumeStatus}
Focus areas: ${focusAreas.join(', ')}
Challenges: ${challenges.join(', ')}
Learning style: ${learningStyle}
Goal statement: ${goalStatement}
Total interviews: ${totalInterviews}
Practice attempts: ${practiceCount}
Coding stats: ${JSON.stringify(codingStats)}
Domain scores: ${JSON.stringify(domainScores.slice(0, 8))}
Recent scores: ${JSON.stringify(recentScores.slice(0, 6))}

Return JSON:
{
  "summary": "string",
  "currentLevel": "string",
  "primaryGoal": "string",
  "phases": [
    {
      "title": "string",
      "duration": "string",
      "objective": "string",
      "focusDomains": ["string"],
      "actions": ["string"],
      "deliverables": ["string"],
      "mockInterviewPlan": "string",
      "codingPracticePlan": "string",
      "progress": number
    }
  ],
  "weeklyPlan": [
    {
      "week": "string",
      "focus": ["string"],
      "tasks": ["string"]
    }
  ],
  "nextActions": ["string"]
}`

      const content = await callOpenAI([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ], {
        model: process.env.OPENAI_MODEL_ACCURATE || process.env.OPENAI_MODEL,
        temperature: 0.1,
        forceJson: true,
        retries: 1,
        maxTokens: 2200,
      })

      let parsed = null
      try {
        parsed = await parseOrRepair(content, 'roadmap')
      } catch {
        parsed = null
      }
      if (!parsed) {
        return res.json({
          data: {
            summary: 'Personalized roadmap is being refined. Please try updating once more.',
            currentLevel: experienceLevel || 'Intermediate',
            primaryGoal: targetRole || 'Interview readiness',
            phases: [
              {
                title: 'Foundation',
                duration: '2 weeks',
                objective: 'Strengthen core concepts and daily practice rhythm.',
                focusDomains: focusAreas,
                actions: [
                  'Review fundamentals and solve 3 easy problems daily.',
                  'Run one mock interview per week.',
                  'Update resume bullet points with measurable impact.',
                ],
                progress: 20,
              },
              {
                title: 'Depth & Fluency',
                duration: '3 weeks',
                objective: 'Improve medium-level problem solving and explanation skills.',
                focusDomains: focusAreas,
                actions: [
                  'Solve 4 medium problems per week.',
                  'Write concise solutions with time/space analysis.',
                  'Schedule a weekly system design discussion.',
                ],
                progress: 40,
              },
              {
                title: 'Interview Readiness',
                duration: '2 weeks',
                objective: 'Polish performance with timed mocks and targeted revisions.',
                focusDomains: focusAreas,
                actions: [
                  'Do 2 timed mocks per week.',
                  'Review weaknesses and retry failed questions.',
                  'Finalize resume and role-specific projects.',
                ],
                progress: 60,
              },
            ],
            weeklyPlan: [
              {
                week: 'Week 1',
                focus: focusAreas,
                tasks: ['Warm-up problems', 'Resume review', 'Mock interview'],
              },
            ],
            nextActions: [
              'Complete one mock interview.',
              'Solve 3 easy + 1 medium problem.',
              'Update one resume section with metrics.',
            ],
          },
        })
      }

      if (cacheKey) setCache(cacheKey, parsed)
      return res.json({ data: parsed })
    }

    if (action === 'coachSummary') {
      const strengths = sanitizeArray(payload?.strengths || [])
      const weaknesses = sanitizeArray(payload?.weaknesses || [])
      const domainScores = Array.isArray(payload?.domainScores) ? payload.domainScores : []
      const totalReports = Number(payload?.totalReports || 0)

      const system = `You are a concise interview coach. Provide a short summary and actionable next steps. Respond with JSON only.`
      const user = `Total reports: ${totalReports}
Strengths: ${strengths.join(', ')}
Weaknesses: ${weaknesses.join(', ')}
Domain scores: ${JSON.stringify(domainScores.slice(0, 8))}

Return JSON:
{
  "summary": "string",
  "focusAreas": ["string"],
  "nextSteps": ["string"]
}`

      const content = await callOpenAI([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ], {
        model: process.env.OPENAI_MODEL_ACCURATE || process.env.OPENAI_MODEL,
        temperature: 0.1,
        forceJson: true,
        retries: 1,
        maxTokens: 700,
      })

      const parsed = await parseOrRepair(content, 'coachSummary')
      if (!parsed) {
        throw new Error('Failed to parse AI response')
      }

      if (cacheKey) setCache(cacheKey, parsed)
      return res.json({ data: parsed })
    }

    if (action === 'learningTopicExpansion') {
      const subjectName = sanitize(payload?.subjectName || '')
      const topic = payload?.topic || {}
      const topicTitle = sanitize(topic?.title || payload?.topicTitle || '')

      if (!topicTitle) {
        return res.status(400).json({ error: 'Missing topic title' })
      }

      const system = `You are an interactive interview prep tutor.
Generate concise but rich study content for one topic.
Return JSON only.`
      const user = `Subject: ${subjectName}
Topic title: ${topicTitle}
Definition: ${sanitize(topic?.definition || '')}
Explanation: ${sanitize(topic?.explanation || '')}
Practice prompts: ${sanitizeArray(topic?.practiceQuestions || []).join(' | ')}
Common mistakes: ${sanitizeArray(topic?.commonMistakes || []).join(' | ')}

Return JSON:
{
  "title": "string",
  "summary": "string",
  "keyIdeas": ["string"],
  "realWorldUseCases": ["string"],
  "pitfalls": ["string"],
  "memoryTips": ["string"],
  "flashcards": [
    { "front": "string", "back": "string" }
  ],
  "quiz": [
    {
      "question": "string",
      "expectedPoints": ["string"],
      "difficulty": "Easy|Medium|Hard"
    }
  ],
  "challenge": "string",
  "nextTopics": ["string"]
}`

      const content = await callOpenAI([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ], {
        model: process.env.OPENAI_MODEL_ACCURATE || process.env.OPENAI_MODEL,
        temperature: 0.2,
        forceJson: true,
        retries: 1,
        maxTokens: 1500,
      })

      const parsed = await parseOrRepair(content, 'learningTopicExpansion')
      if (!parsed) {
        throw new Error('Failed to parse AI response')
      }

      const normalized = normalizeLearningTopicExpansion(parsed, payload)
      if (cacheKey) setCache(cacheKey, normalized)
      return res.json({ data: normalized })
    }

    if (action === 'learningAnswerReview') {
      const topicTitle = sanitize(payload?.topicTitle || payload?.topic?.title || '')
      const question = sanitize(payload?.question || '')
      const expectedPoints = sanitizeArray(payload?.expectedPoints || [])
      const userAnswer = sanitize(payload?.answer || '')

      if (!topicTitle || !question) {
        return res.status(400).json({ error: 'Missing topic or question' })
      }

      const answerValidation = validateFreeformAnswer(userAnswer, { minChars: 20, minWords: 5 })
      if (!answerValidation.ok) {
        return res.status(400).json({ error: answerValidation.reason })
      }

      const system = `You are a strict learning coach.
Evaluate the user's answer with practical and accurate feedback.
Return JSON only.`
      const user = `Topic: ${topicTitle}
Question: ${question}
Expected points: ${expectedPoints.join(', ')}
User answer: ${userAnswer}

Return JSON:
{
  "score": number,
  "verdict": "Strong|Needs Improvement|Incorrect",
  "feedback": "string",
  "strengths": ["string"],
  "improvements": ["string"],
  "missingPoints": ["string"],
  "modelAnswer": "string",
  "nextStep": "string",
  "isInvalid": boolean,
  "invalidReason": "string"
}`

      const content = await callOpenAI([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ], {
        temperature: 0.1,
        forceJson: true,
        retries: 1,
        maxTokens: 900,
      })

      const parsed = await parseOrRepair(content, 'learningAnswerReview')
      if (!parsed) {
        throw new Error('Failed to parse AI response')
      }

      return res.json({ data: normalizeLearningAnswerReview(parsed, payload) })
    }

    logEvent('error', 'unsupported_action', { requestId, action })
    return res.status(400).json({ error: 'Unsupported action' })
  } catch (err) {
    const fallback = buildActionFallback(action, payload || {})
    const errorMessage = err?.message || String(err)
    if (fallback) {
      logEvent('info', 'ai_fallback_used', {
        requestId,
        action,
        error: errorMessage,
        durationMs: Date.now() - startTime,
      })
      return res.json({
        data: fallback,
        fallback: true,
      })
    }

    logEvent('error', 'ai_error', {
      requestId,
      action,
      error: errorMessage,
      durationMs: Date.now() - startTime,
    })
    return res.status(500).json({ error: errorMessage || 'AI request failed' })
  }
})

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`AI server listening on http://localhost:${port}`)
  })
}

export default app
