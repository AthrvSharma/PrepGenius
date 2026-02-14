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
  const responseFormatOverride = process.env.OPENAI_RESPONSE_FORMAT || ''
  const useResponseFormat =
    !isLocal &&
    (options.forceJson ||
      responseFormatOverride === 'json' ||
      responseFormatOverride !== 'off')

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
  if (useResponseFormat) {
    body.response_format = { type: 'json_object' }
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
      return data.choices?.[0]?.message?.content || '{}'
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

function parseJson(content) {
  const normalized = normalizeJsonString(content)
  let parsed = tryParseJson(normalized)
  if (parsed) return parsed

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
  const system = `You are a JSON repair tool. Return ONLY valid JSON.`
  const user = `Fix this into valid JSON${schemaHint ? ` for schema: ${schemaHint}` : ''}:\n${raw}`
  const repaired = await callOpenAI(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { temperature: 0, forceJson: true, retries: 1 }
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
  'evaluateAnswer',
  'finalReport',
  'resumeAnalysis',
  'jobMatchAnalysis',
  'dashboardInsights',
  'generateRoadmap',
  'updateRoadmap',
  'coachSummary',
])

const CACHEABLE_ACTIONS = new Set([
  'resumeAnalysis',
  'jobMatchAnalysis',
  'dashboardInsights',
  'generateRoadmap',
  'updateRoadmap',
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
      ], { temperature: 0.2, retries: 1 })

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
      ], { temperature: 0.1, forceJson: true, retries: 1 })

      const parsed = await parseOrRepair(content, 'hint')
      if (!parsed) {
        return res.status(500).json({ error: 'Failed to parse AI response' })
      }

      const normalized = normalizeEvaluation(parsed)
      return res.json({ data: normalized })
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
      ], { temperature: 0.1, forceJson: true, retries: 1 })

      const parsed = await parseOrRepair(content, 'explanation')
      if (!parsed) {
        return res.status(500).json({ error: 'Failed to parse AI response' })
      }

      return res.json({ data: normalizeResumeAnalysis(parsed) })
    }

    if (action === 'evaluateAnswer') {
      const question = payload?.question || {}
      const rubric = payload?.rubric || {}
      const answer = sanitize(payload?.answer || '')

      if (!answer) {
        return res.status(400).json({ error: 'Missing answer' })
      }
      if (!sanitize(question.text || '')) {
        return res.status(400).json({ error: 'Missing question' })
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
      ], { temperature: 0.1, forceJson: true, retries: 1 })

      const parsed = await parseOrRepair(content, 'evaluation')
      if (!parsed) {
        return res.status(500).json({ error: 'Failed to parse AI response' })
      }

      return res.json({ data: normalizeJobMatch(parsed) })
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
        { model: process.env.OPENAI_MODEL_ACCURATE || process.env.OPENAI_MODEL, forceJson: true, retries: 1 }
      )

      const parsed = await parseOrRepair(content, 'finalReport')
      if (!parsed) {
        return res.status(500).json({ error: 'Failed to parse AI response' })
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
      ], { forceJson: true, retries: 1 })

      const parsed = await parseOrRepair(content, 'resumeAnalysis')
      if (!parsed) {
        return res.status(500).json({ error: 'Failed to parse AI response' })
      }

      if (cacheKey) setCache(cacheKey, parsed)
      return res.json({ data: parsed })
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
      ], { forceJson: true, retries: 1 })

      const parsed = await parseOrRepair(content, 'jobMatchAnalysis')
      if (!parsed) {
        return res.status(500).json({ error: 'Failed to parse AI response' })
      }

      if (cacheKey) setCache(cacheKey, parsed)
      return res.json({ data: parsed })
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
      ], { forceJson: true, retries: 1 })

      const parsed = await parseOrRepair(content, 'dashboardInsights')
      if (!parsed) {
        return res.status(500).json({ error: 'Failed to parse AI response' })
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
      ], { temperature: 0.1, forceJson: true, retries: 1 })

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
      ], { temperature: 0.1, forceJson: true, retries: 1 })

      const parsed = await parseOrRepair(content, 'coachSummary')
      if (!parsed) {
        return res.json({
          data: {
            summary: 'Personalized roadmap is being refined. Please try updating once more.',
            currentLevel: payload?.experienceLevel || 'Intermediate',
            primaryGoal: payload?.targetRole || 'Interview readiness',
            phases: [
              {
                title: 'Foundation',
                duration: '2 weeks',
                objective: 'Strengthen core concepts and daily practice rhythm.',
                focusDomains: payload?.focusAreas || [],
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
                focusDomains: payload?.focusAreas || [],
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
                focusDomains: payload?.focusAreas || [],
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
                focus: payload?.focusAreas || [],
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

    logEvent('error', 'unsupported_action', { requestId, action })
    return res.status(400).json({ error: 'Unsupported action' })
  } catch (err) {
    logEvent('error', 'ai_error', { requestId, action, error: err.message || err })
    return res.status(500).json({ error: err.message || 'AI request failed' })
  }
})

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`AI server listening on http://localhost:${port}`)
  })
}

export default app
