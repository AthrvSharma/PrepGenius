import seedDb from '../data/db.json'
import { getAuthSnapshot, login as authLogin, logout as authLogout } from './localAuth'
import { evaluateAnswer, summarizeSession, QuestionBankEntry } from './interviewEngine'
import { logError } from './logger'
import { sanitizeText } from './validation'

type DbValue = Record<string, any>

type Database = typeof seedDb

type ListOptions = {
  where?: Record<string, any>
  orderBy?: Record<string, 'asc' | 'desc'>
}

const DB_STORAGE_KEY = 'prepgenius.db'
const DB_VERSION_KEY = 'prepgenius.db.version'
const DB_VERSION = 6
const AI_RATE_KEY = 'prepgenius.ai.rate'
const AI_STATS_KEY = 'prepgenius.ai.stats'
const AI_BASE_URL = (
  import.meta.env.VITE_AI_BASE_URL ||
  (typeof window !== 'undefined' ? window.location.origin : '')
).replace(/\/$/, '')
const AI_STRICT = import.meta.env.VITE_AI_STRICT === 'true'
const AI_TIMEOUT_MS = Number(import.meta.env.VITE_AI_TIMEOUT_MS || 20000)

let dbCache: Database | null = null

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function loadDb(): Database {
  if (dbCache) return dbCache
  if (typeof window !== 'undefined') {
    const storedVersion = Number(window.localStorage.getItem(DB_VERSION_KEY) || '0')
    if (storedVersion !== DB_VERSION) {
      window.localStorage.setItem(DB_VERSION_KEY, String(DB_VERSION))
      window.localStorage.removeItem(DB_STORAGE_KEY)
    }
    const raw = window.localStorage.getItem(DB_STORAGE_KEY)
    if (raw) {
      try {
        dbCache = JSON.parse(raw) as Database
        return dbCache
      } catch {
        // Fall back to seed data
      }
    }
  }
  dbCache = clone(seedDb)
  return dbCache
}

function saveDb(db: Database) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(db))
}

function applyDefaults(table: keyof Database, record: DbValue) {
  const now = new Date().toISOString()
  if (!record.createdAt && ['userProfiles', 'feedbackReports', 'resumes', 'interviewQuestions', 'jobMatches', 'practiceAttempts', 'roadmaps', 'codingSubmissions'].includes(table)) {
    record.createdAt = now
  }
  if (table === 'interviewSessions') {
    if (!record.startedAt) record.startedAt = now
    record.lastActiveAt = now
  }
  record.updatedAt = now
  return record
}

function createCollection(table: keyof Database, idField = 'id') {
  return {
    async list(options: ListOptions = {}) {
      const db = loadDb()
      let rows = db[table].map((row: DbValue) => ({ ...row }))
      if (options.where) {
        rows = rows.filter((row) => {
          return Object.entries(options.where as Record<string, any>).every(([key, value]) => {
            return row[key] === value
          })
        })
      }
      if (options.orderBy) {
        const [orderKey] = Object.keys(options.orderBy)
        if (orderKey) {
          const direction = options.orderBy[orderKey]
          rows.sort((a, b) => {
            const aVal = a[orderKey]
            const bVal = b[orderKey]
            const aDate = typeof aVal === 'string' ? Date.parse(aVal) : NaN
            const bDate = typeof bVal === 'string' ? Date.parse(bVal) : NaN
            let compare = 0
            if (!Number.isNaN(aDate) && !Number.isNaN(bDate)) {
              compare = aDate - bDate
            } else if (typeof aVal === 'number' && typeof bVal === 'number') {
              compare = aVal - bVal
            } else {
              compare = String(aVal ?? '').localeCompare(String(bVal ?? ''))
            }
            return direction === 'desc' ? -compare : compare
          })
        }
      }
      return clone(rows)
    },
    async get(id: string) {
      const db = loadDb()
      const row = db[table].find((item: DbValue) => item[idField] === id || item.userId === id)
      return row ? clone(row) : null
    },
    async create(data: DbValue) {
      const db = loadDb()
      const record = applyDefaults(table, { ...data })
      if (!record[idField]) {
        record[idField] = `${table}_${Date.now()}`
      }
      if (table === 'userProfiles' && !record.id && record.userId) {
        record.id = record.userId
      }
      db[table].push(record)
      saveDb(db)
      return clone(record)
    },
    async update(id: string, updates: DbValue) {
      const db = loadDb()
      const index = db[table].findIndex((item: DbValue) => item[idField] === id || item.userId === id)
      if (index === -1) return null
      const updated = applyDefaults(table, { ...db[table][index], ...updates })
      db[table][index] = updated
      saveDb(db)
      return clone(updated)
    },
    async delete(id: string) {
      const db = loadDb()
      const index = db[table].findIndex((item: DbValue) => item[idField] === id || item.userId === id)
      if (index === -1) return null
      const [removed] = db[table].splice(index, 1)
      saveDb(db)
      return clone(removed)
    },
  }
}

function enforceRateLimit(limit = 25, windowMs = 60_000) {
  if (typeof window === 'undefined') return
  const now = Date.now()
  const raw = window.localStorage.getItem(AI_RATE_KEY)
  const timestamps: number[] = raw ? JSON.parse(raw) : []
  const fresh = timestamps.filter((ts) => now - ts < windowMs)
  if (fresh.length >= limit) {
    throw new Error('Rate limit exceeded. Please wait a moment and try again.')
  }
  fresh.push(now)
  window.localStorage.setItem(AI_RATE_KEY, JSON.stringify(fresh))
}

function recordAiStat(durationMs: number, ok: boolean) {
  if (typeof window === 'undefined') return
  const raw = window.localStorage.getItem(AI_STATS_KEY)
  const stats = raw ? JSON.parse(raw) : { calls: 0, errors: 0, totalLatencyMs: 0 }
  stats.calls += 1
  stats.totalLatencyMs += durationMs
  if (!ok) stats.errors += 1
  window.localStorage.setItem(AI_STATS_KEY, JSON.stringify(stats))
}

function getAiStats() {
  if (typeof window === 'undefined') return { calls: 0, errors: 0, avgLatencyMs: 0 }
  const raw = window.localStorage.getItem(AI_STATS_KEY)
  const stats = raw ? JSON.parse(raw) : { calls: 0, errors: 0, totalLatencyMs: 0 }
  const avgLatencyMs = stats.calls ? Math.round(stats.totalLatencyMs / stats.calls) : 0
  return { calls: stats.calls, errors: stats.errors, avgLatencyMs }
}

async function callAiServer(action: string, payload: Record<string, any>) {
  if (typeof window === 'undefined') return null
  if (!AI_BASE_URL) {
    if (AI_STRICT) throw new Error('AI server is not configured')
    return null
  }
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), AI_TIMEOUT_MS)
  const endpoint = `${AI_BASE_URL}/api/ai`
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
      signal: controller.signal,
    })
    if (!response.ok) {
      const message = await response.text()
      throw new Error(message || 'AI server error')
    }
    const data = await response.json()
    return data?.data ?? null
  } finally {
    window.clearTimeout(timeout)
  }
}

function parsePayload(prompt: string) {
  const marker = 'PAYLOAD:'
  const index = prompt.indexOf(marker)
  if (index === -1) return null
  const jsonText = prompt.slice(index + marker.length).trim()
  try {
    return JSON.parse(jsonText)
  } catch {
    return null
  }
}

function pickQuestionFromBank(domain: string, index: number) {
  const db = loadDb()
  const pool = (db.questionBank as QuestionBankEntry[]).filter((question) => question.domain.toLowerCase() === domain.toLowerCase())
  if (!pool.length) return null
  return pool[index % pool.length]
}

export const blink = {
  auth: {
    login: (redirectUrl?: string) => {
      const url = redirectUrl || (typeof window !== 'undefined' ? window.location.href : '')
      let role: 'user' | 'admin' = 'user'
      try {
        const parsed = new URL(url)
        if (parsed.searchParams.get('admin') === '1') role = 'admin'
      } catch {
        // Ignore malformed URLs
      }
      authLogin('scholar@prepgenius.local', role)
    },
    logout: () => {
      authLogout()
    },
    getUser: () => getAuthSnapshot(),
  },
  db: {
    careerPaths: createCollection('careerPaths'),
    questionBank: createCollection('questionBank'),
    userProfiles: createCollection('userProfiles', 'id'),
    interviewSessions: createCollection('interviewSessions'),
    interviewQuestions: createCollection('interviewQuestions'),
    feedbackReports: createCollection('feedbackReports'),
    resumes: createCollection('resumes'),
    jobMatches: createCollection('jobMatches'),
    practiceAttempts: createCollection('practiceAttempts'),
    roadmaps: createCollection('roadmaps'),
    codingChallenges: createCollection('codingChallenges'),
    codingSubmissions: createCollection('codingSubmissions'),
    learningSubjects: createCollection('learningSubjects'),
  },
  storage: {
    upload: async (file: File, _path: string) => {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(file)
      })
      return { publicUrl: dataUrl }
    },
  },
  ai: {
    isStrict: AI_STRICT,
    getStats: () => getAiStats(),
    generateText: async (input: { messages: Array<{ role: string; content: any }> }) => {
      const start = Date.now()
      try {
        enforceRateLimit()
        let ok = true
        let textResponse: string | null = null

        try {
          const remote = await callAiServer('generateText', { messages: input.messages })
          textResponse = remote?.text || null
        } catch (err) {
          ok = false
          logError('AI server generateText failed', { error: err })
          if (AI_STRICT) throw err
        }

        if (textResponse) {
          recordAiStat(Date.now() - start, ok)
          return { text: textResponse }
        }

        if (AI_STRICT) {
          throw new Error('AI server did not return a response')
        }

        const fallback = {
          text: 'Extracted skills: Java, React, System Design. Recommendations: practice system design, emphasize impact, quantify results.',
        }
        recordAiStat(Date.now() - start, ok)
        return fallback
      } catch (err) {
        recordAiStat(Date.now() - start, false)
        logError('AI generateText failed', { error: err })
        throw err
      }
    },
    generateObject: async (input: { prompt: string; schema: any }) => {
      const start = Date.now()
      try {
        enforceRateLimit()
        const { prompt, schema } = input
        const keys = schema?.properties ? Object.keys(schema.properties) : []
        const payload = parsePayload(prompt)

        if (payload?.action === 'generateHint') {
          let ok = true
          try {
            const remote = await callAiServer('generateHint', payload)
            if (remote) {
              recordAiStat(Date.now() - start, true)
              return { object: remote }
            }
            if (AI_STRICT) throw new Error('AI server did not return a hint')
          } catch (err) {
            ok = false
            logError('AI server generateHint failed', { error: err })
            if (AI_STRICT) throw err
          }
          recordAiStat(Date.now() - start, ok)
          return { object: { hint: 'Focus on the core concept and add one concrete example.' } }
        }

        if (payload?.action === 'explainConcept') {
          let ok = true
          try {
            const remote = await callAiServer('explainConcept', payload)
            if (remote) {
              recordAiStat(Date.now() - start, true)
              return { object: remote }
            }
            if (AI_STRICT) throw new Error('AI server did not return an explanation')
          } catch (err) {
            ok = false
            logError('AI server explainConcept failed', { error: err })
            if (AI_STRICT) throw err
          }
          recordAiStat(Date.now() - start, ok)
          return { object: { explanation: 'Explain the key idea, trade-offs, and a simple example.' } }
        }

        if (payload?.action === 'evaluateAnswer') {
          let ok = true
          try {
            const remote = await callAiServer('evaluateAnswer', payload)
            if (remote) {
              recordAiStat(Date.now() - start, true)
              return { object: remote }
            }
            if (AI_STRICT) throw new Error('AI server did not return an evaluation')
          } catch (err) {
            ok = false
            logError('AI server evaluateAnswer failed', { error: err })
            if (AI_STRICT) throw err
          }
          const evaluation = evaluateAnswer(sanitizeText(payload.answer || ''), payload.rubric)
          recordAiStat(Date.now() - start, ok)
          return { object: evaluation }
        }

        if (payload?.action === 'finalReport') {
          let ok = true
          try {
            const remote = await callAiServer('finalReport', payload)
            if (remote) {
              recordAiStat(Date.now() - start, true)
              return { object: remote }
            }
            if (AI_STRICT) throw new Error('AI server did not return a final report')
          } catch (err) {
            ok = false
            logError('AI server finalReport failed', { error: err })
            if (AI_STRICT) throw err
          }
          const summary = summarizeSession(payload.evaluations || [])
          recordAiStat(Date.now() - start, ok)
          return { object: summary }
        }

        if (payload?.action === 'resumeAnalysis') {
          let ok = true
          try {
            const remote = await callAiServer('resumeAnalysis', payload)
            if (remote) {
              recordAiStat(Date.now() - start, true)
              return { object: remote }
            }
            if (AI_STRICT) throw new Error('AI server did not return a resume analysis')
          } catch (err) {
            ok = false
            logError('AI server resumeAnalysis failed', { error: err })
            if (AI_STRICT) throw err
          }
          recordAiStat(Date.now() - start, ok)
          return {
            object: {
              skills: payload.skills || ['Java', 'React', 'System Design', 'API Development'],
              recommendations: payload.recommendations || [
                'Emphasize quantifiable impact in resume bullets.',
                'Highlight systems or scale-related projects.',
                'Prepare 2-3 STAR stories for behavioral rounds.',
              ],
            },
          }
        }

        if (payload?.action === 'jobMatchAnalysis') {
          let ok = true
          try {
            const remote = await callAiServer('jobMatchAnalysis', payload)
            if (remote) {
              recordAiStat(Date.now() - start, true)
              return { object: remote }
            }
            if (AI_STRICT) throw new Error('AI server did not return a job match analysis')
          } catch (err) {
            ok = false
            logError('AI server jobMatchAnalysis failed', { error: err })
            if (AI_STRICT) throw err
          }
          recordAiStat(Date.now() - start, ok)
          return {
            object: {
              matchScore: 0,
              keywordCoverage: 0,
              roleFitScore: 0,
              experienceScore: 0,
              summary: '',
              matchedSkills: [],
              missingSkills: [],
              recommendedKeywords: [],
              redFlags: [],
              resumeAdjustments: [],
              tailoredSummary: '',
              interviewTopics: [],
              nextSteps: [],
            },
          }
        }

        if (payload?.action === 'generateRoadmap') {
          let ok = true
          try {
            const remote = await callAiServer('generateRoadmap', payload)
            if (remote) {
              recordAiStat(Date.now() - start, true)
              return { object: remote }
            }
            if (AI_STRICT) throw new Error('AI server did not return a roadmap')
          } catch (err) {
            ok = false
            const message = err instanceof Error ? err.message : ''
            logError('AI server generateRoadmap failed', { error: err })
            if (message.includes('Failed to parse AI response')) {
              recordAiStat(Date.now() - start, false)
              return {
                object: {
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
              }
            }
            if (AI_STRICT) throw err
          }
          recordAiStat(Date.now() - start, ok)
          return { object: { summary: '', currentLevel: '', primaryGoal: '', phases: [], weeklyPlan: [], nextActions: [] } }
        }

        if (payload?.action === 'dashboardInsights') {
          let ok = true
          try {
            const remote = await callAiServer('dashboardInsights', payload)
            if (remote) {
              recordAiStat(Date.now() - start, true)
              return { object: remote }
            }
            if (AI_STRICT) throw new Error('AI server did not return dashboard insights')
          } catch (err) {
            ok = false
            logError('AI server dashboardInsights failed', { error: err })
            if (AI_STRICT) throw err
          }
          recordAiStat(Date.now() - start, ok)
          return { object: { learningPlan: [], dailyChallenge: null } }
        }

        if (payload?.action === 'coachSummary') {
          let ok = true
          try {
            const remote = await callAiServer('coachSummary', payload)
            if (remote) {
              recordAiStat(Date.now() - start, true)
              return { object: remote }
            }
            if (AI_STRICT) throw new Error('AI server did not return a coach summary')
          } catch (err) {
            ok = false
            logError('AI server coachSummary failed', { error: err })
            if (AI_STRICT) throw err
          }
          recordAiStat(Date.now() - start, ok)
          return { object: { summary: '', focusAreas: [], nextSteps: [] } }
        }

        if (keys.includes('question') && keys.includes('difficulty')) {
          const domainMatch = prompt.match(/domain:\s*([^\.\n]+)/i)
          const domain = domainMatch ? domainMatch[1].trim() : 'System Design'
          const historyCount = payload?.historyCount ?? 0
          const question = pickQuestionFromBank(domain, historyCount)
          if (question) {
            recordAiStat(Date.now() - start, true)
            return {
              object: {
                question: question.prompt,
                difficulty: question.difficulty,
                type: historyCount > 0 ? 'Follow-up' : 'New',
              },
            }
          }
        }

        if (keys.includes('skills') && keys.includes('recommendations')) {
          recordAiStat(Date.now() - start, true)
          return {
            object: {
              skills: ['Java', 'React', 'System Design', 'API Development', 'Problem Solving'],
              recommendations: [
                'Focus on system design fundamentals and trade-offs.',
                'Practice DSA problems with time complexity explanations.',
                'Prepare 2-3 STAR stories highlighting impact.',
              ],
            },
          }
        }

        recordAiStat(Date.now() - start, true)
        return { object: {} }
      } catch (err) {
        recordAiStat(Date.now() - start, false)
        logError('AI generateObject failed', { error: err })
        throw err
      }
    },
  },
}

export type { QuestionBankEntry }
