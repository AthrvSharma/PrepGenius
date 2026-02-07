import { sanitizeText } from './validation'

export type Difficulty = 'Easy' | 'Medium' | 'Hard'
export type QuestionType = 'theory' | 'coding' | 'system' | 'behavioral'

export interface ScoreWeights {
  correctness: number
  conceptCoverage: number
  clarity: number
  depth: number
  communication: number
}

export interface Rubric {
  expectedConcepts: string[]
  keyPoints: string[]
  commonMistakes: string[]
  edgeCases?: string[]
  scoringWeights?: ScoreWeights
  idealAnswer?: string
  explanation?: string
}

export interface QuestionBankEntry {
  id: string
  domain: string
  difficulty: string
  tags: string[]
  timeEstimateMin: number
  type: QuestionType
  prompt: string
  rubric: Rubric
  starterCode?: string
}

export interface ScoreBreakdown {
  correctness: number
  conceptCoverage: number
  clarity: number
  depth: number
  communication: number
  total: number
}

export interface EvaluationResult {
  score: number
  breakdown: ScoreBreakdown
  confidence?: number
  strengths: string[]
  weaknesses: string[]
  mistakesFound?: string[]
  missingConcepts: string[]
  coverage?: Array<{
    concept: string
    covered: boolean
    evidence?: string
    gap?: string
  }>
  scoreRationale?: {
    correctness?: string
    conceptCoverage?: string
    clarity?: string
    depth?: string
    communication?: string
  }
  improvements: string[]
  idealAnswer: string
  nextSteps: string[]
  followUp: string
  isUncertain: boolean
}

const defaultWeights: ScoreWeights = {
  correctness: 40,
  conceptCoverage: 25,
  clarity: 15,
  depth: 10,
  communication: 10,
}

const structureHints = ['first', 'second', 'third', 'overall', 'in summary', 'for example', 'step']
const depthHints = ['trade-off', 'edge case', 'complexity', 'latency', 'scalability', 'throughput']
const uncertaintyMarkers = ['not sure', 'unsure', "i don't know", 'maybe', 'guess']

function normalizeText(value: string) {
  return sanitizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(value: string) {
  return normalizeText(value).split(' ').filter(Boolean)
}

function normalizeWeights(weights?: ScoreWeights) {
  if (!weights) return defaultWeights
  const total = weights.correctness + weights.conceptCoverage + weights.clarity + weights.depth + weights.communication
  if (!total) return defaultWeights
  if (total === 100) return weights
  const factor = 100 / total
  return {
    correctness: weights.correctness * factor,
    conceptCoverage: weights.conceptCoverage * factor,
    clarity: weights.clarity * factor,
    depth: weights.depth * factor,
    communication: weights.communication * factor,
  }
}

function matchConcepts(answerTokens: string[], concepts: string[]) {
  const missing: string[] = []
  const matched: string[] = []
  concepts.forEach((concept) => {
    const conceptTokens = tokenize(concept)
    const found = conceptTokens.every((token) => answerTokens.includes(token))
    if (found) {
      matched.push(concept)
    } else {
      missing.push(concept)
    }
  })
  const coverage = concepts.length > 0 ? matched.length / concepts.length : 1
  return { matched, missing, coverage }
}

function detectMistakes(answerTokens: string[], mistakes: string[]) {
  const triggered: string[] = []
  mistakes.forEach((mistake) => {
    const tokens = tokenize(mistake)
    const found = tokens.every((token) => answerTokens.includes(token))
    if (found) triggered.push(mistake)
  })
  return triggered
}

function scoreClarity(answer: string) {
  const sentences = answer.split(/[.!?]/).map((sentence) => sentence.trim()).filter(Boolean)
  const words = tokenize(answer)
  const avgSentenceLength = sentences.length ? words.length / sentences.length : words.length
  let score = 0.6
  if (avgSentenceLength > 26) score -= 0.15
  if (avgSentenceLength > 35) score -= 0.15
  if (avgSentenceLength < 16) score += 0.1
  const normalized = normalizeText(answer)
  if (structureHints.some((hint) => normalized.includes(hint))) score += 0.2
  if (words.length < 25) score -= 0.15
  return Math.max(0.2, Math.min(1, score))
}

function scoreDepth(answer: string, rubric: Rubric) {
  const normalized = normalizeText(answer)
  let score = 0.4
  if (depthHints.some((hint) => normalized.includes(hint))) score += 0.2
  if (rubric.edgeCases && rubric.edgeCases.some((edge) => normalized.includes(normalizeText(edge)))) score += 0.2
  if (tokenize(answer).length > 70) score += 0.2
  return Math.max(0.2, Math.min(1, score))
}

function scoreCommunication(answer: string) {
  const normalized = normalizeText(answer)
  let score = 0.55
  if (structureHints.some((hint) => normalized.includes(hint))) score += 0.2
  if (normalized.includes('because') || normalized.includes('so that')) score += 0.1
  if (tokenize(answer).length < 20) score -= 0.2
  return Math.max(0.2, Math.min(1, score))
}

export function evaluateAnswer(answer: string, rubric: Rubric): EvaluationResult {
  const cleaned = sanitizeText(answer)
  const tokens = tokenize(cleaned)
  const weights = normalizeWeights(rubric.scoringWeights)

  const expected = rubric.expectedConcepts || []
  const keyPoints = rubric.keyPoints || []
  const commonMistakes = rubric.commonMistakes || []

  const expectedMatch = matchConcepts(tokens, expected)
  const keyPointMatch = matchConcepts(tokens, keyPoints)
  const mistakesFound = detectMistakes(tokens, commonMistakes)

  const clarityRatio = scoreClarity(cleaned)
  const depthRatio = scoreDepth(cleaned, rubric)
  const communicationRatio = scoreCommunication(cleaned)

  const conceptCoverageRatio = Math.min(1, 0.6 * expectedMatch.coverage + 0.4 * keyPointMatch.coverage)
  const mistakePenalty = commonMistakes.length ? mistakesFound.length / commonMistakes.length : 0
  const correctnessRatio = Math.max(0.2, Math.min(1, conceptCoverageRatio * 0.8 + (1 - mistakePenalty) * 0.2))

  const breakdown: ScoreBreakdown = {
    correctness: Math.round(weights.correctness * correctnessRatio),
    conceptCoverage: Math.round(weights.conceptCoverage * conceptCoverageRatio),
    clarity: Math.round(weights.clarity * clarityRatio),
    depth: Math.round(weights.depth * depthRatio),
    communication: Math.round(weights.communication * communicationRatio),
    total: 0,
  }
  breakdown.total = breakdown.correctness + breakdown.conceptCoverage + breakdown.clarity + breakdown.depth + breakdown.communication

  const isUncertain = uncertaintyMarkers.some((marker) => normalizeText(cleaned).includes(marker)) || tokens.length < 18

  const strengths = [
    expectedMatch.matched[0],
    keyPointMatch.matched[0],
    clarityRatio > 0.7 ? 'Structured explanation' : null,
  ].filter(Boolean) as string[]

  const missingConcepts = [...expectedMatch.missing, ...keyPointMatch.missing].slice(0, 4)
  const weaknesses = missingConcepts.length ? missingConcepts : ['Expand on trade-offs and edge cases']

  const improvements = [
    missingConcepts[0] ? `Add detail about ${missingConcepts[0]}.` : 'Add a concrete example.',
    depthRatio < 0.6 ? 'Include edge cases or trade-offs.' : 'Tighten your summary for impact.',
  ].filter(Boolean)

  const idealAnswer = rubric.idealAnswer || keyPoints.join(' ')
  const nextSteps = expectedMatch.missing.length
    ? expectedMatch.missing.slice(0, 3)
    : ['Reinforce core definitions', 'Practice a similar question']

  const followUpSource = missingConcepts[0] || rubric.edgeCases?.[0] || keyPoints[0] || 'the trade-offs'
  const followUp = isUncertain
    ? 'I am not confident about your answer. Can you clarify your approach and give one concrete example?'
    : `Can you expand on ${followUpSource}?`

  const confidenceBase = Math.round(40 + conceptCoverageRatio * 60)
  const confidence = Math.max(0, Math.min(100, confidenceBase - (isUncertain ? 25 : 0)))

  const coverage = [
    ...expected.map((concept) => ({
      concept,
      covered: expectedMatch.matched.includes(concept),
      evidence: expectedMatch.matched.includes(concept) ? 'Mentioned in answer' : '',
      gap: expectedMatch.matched.includes(concept) ? '' : 'Not mentioned',
    })),
    ...keyPoints.map((concept) => ({
      concept,
      covered: keyPointMatch.matched.includes(concept),
      evidence: keyPointMatch.matched.includes(concept) ? 'Mentioned in answer' : '',
      gap: keyPointMatch.matched.includes(concept) ? '' : 'Not mentioned',
    })),
  ].filter((item, index, arr) => arr.findIndex((other) => other.concept === item.concept) === index)

  return {
    score: Math.max(0, Math.min(100, breakdown.total)),
    breakdown,
    confidence,
    strengths,
    weaknesses,
    mistakesFound: mistakesFound.length ? mistakesFound : [],
    missingConcepts,
    coverage,
    scoreRationale: {
      correctness: conceptCoverageRatio > 0.7 ? 'Most core concepts are correct.' : 'Several core concepts are missing.',
      conceptCoverage: keyPointMatch.coverage > 0.6 ? 'Key points are mostly covered.' : 'Key points need more coverage.',
      clarity: clarityRatio > 0.7 ? 'Answer is structured and readable.' : 'Clarify structure and flow.',
      depth: depthRatio > 0.6 ? 'Includes some depth or trade-offs.' : 'Add depth, trade-offs, or edge cases.',
      communication: communicationRatio > 0.6 ? 'Communication is clear.' : 'Focus on concise, structured delivery.',
    },
    improvements,
    idealAnswer,
    nextSteps,
    followUp,
    isUncertain,
  }
}

export function generateHint(answer: string, rubric: Rubric) {
  const tokens = tokenize(answer)
  const missing = matchConcepts(tokens, rubric.keyPoints || []).missing
  const topMissing = missing.slice(0, 2)
  if (!topMissing.length) {
    return 'You have covered the key points. Consider adding a real-world example.'
  }
  return `Consider mentioning: ${topMissing.join(', ')}.`
}

export function generateExplanation(rubric: Rubric) {
  if (rubric.explanation) return rubric.explanation
  if (rubric.idealAnswer) return rubric.idealAnswer
  return 'Focus on the core concept, explain trade-offs, and ground your answer in a practical example.'
}

export function nextDifficulty(current: Difficulty, score: number): Difficulty {
  if (score >= 85) {
    return current === 'Easy' ? 'Medium' : 'Hard'
  }
  if (score <= 60) {
    return current === 'Hard' ? 'Medium' : 'Easy'
  }
  return current
}

export function selectNextQuestion(
  questionBank: QuestionBankEntry[],
  askedQuestionIds: string[],
  preferredDomains: string[],
  difficulty: Difficulty
) {
  const difficultyOrder =
    difficulty === 'Hard'
      ? ['Hard', 'Medium', 'Easy']
      : difficulty === 'Easy'
        ? ['Easy', 'Medium', 'Hard']
        : ['Medium', 'Hard', 'Easy']

  const pickPool = (targetDifficulty: string, ignoreDomains = false) =>
    questionBank.filter((question) => {
      const domainMatch = ignoreDomains || preferredDomains.length === 0 || preferredDomains.includes(question.domain)
      const difficultyMatch = question.difficulty.toLowerCase() === targetDifficulty.toLowerCase()
      return domainMatch && difficultyMatch
    })

  let candidatePool: QuestionBankEntry[] = []
  for (const target of difficultyOrder) {
    candidatePool = pickPool(target)
    if (candidatePool.length) break
  }

  if (!candidatePool.length) {
    for (const target of difficultyOrder) {
      candidatePool = pickPool(target, true)
      if (candidatePool.length) break
    }
  }

  const unused = candidatePool.filter((question) => !askedQuestionIds.includes(question.id))
  const pickFrom = unused.length ? unused : candidatePool
  if (!pickFrom.length) return null
  const index = Math.floor(Math.random() * pickFrom.length)
  return pickFrom[index]
}

export function summarizeSession(evaluations: EvaluationResult[]) {
  const scores = evaluations.map((evalItem) => evalItem.score)
  const totalScore = scores.length
    ? Math.round(scores.reduce((acc, score) => acc + score, 0) / scores.length)
    : 0

  const strengths = evaluations.flatMap((evalItem) => evalItem.strengths).filter(Boolean)
  const weaknesses = evaluations.flatMap((evalItem) => evalItem.weaknesses).filter(Boolean)

  const topStrengths = Array.from(new Set(strengths)).slice(0, 3)
  const topWeaknesses = Array.from(new Set(weaknesses)).slice(0, 3)

  const recommendations = evaluations.flatMap((evalItem) => evalItem.improvements).filter(Boolean)
  const uniqueRecommendations = Array.from(new Set(recommendations)).slice(0, 4)

  return {
    totalScore,
    strengths: topStrengths,
    weaknesses: topWeaknesses,
    recommendations: uniqueRecommendations,
  }
}
