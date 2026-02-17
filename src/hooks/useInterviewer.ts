import { useState, useCallback, useEffect } from 'react'
import { blink } from '../lib/blink'
import { UserProfile } from './useProfile'
import {
  Difficulty,
  EvaluationResult,
  QuestionBankEntry,
  generateExplanation,
  generateHint,
  nextDifficulty,
  selectNextQuestion,
} from '../lib/interviewEngine'
import { clampText } from '../lib/validation'
import { logError } from '../lib/logger'

interface InterviewQuestionState {
  id: string
  questionId: string
  text: string
  difficulty: Difficulty
  domain: string
  tags: string[]
  type: string
  rubric: any
  timeEstimateMin: number
  starterCode?: string
  retryCount: number
}

interface HistoryItem {
  question: InterviewQuestionState
  answer: string
  evaluation: EvaluationResult
}

const DEFAULT_TOTAL_QUESTIONS = 10
const DEFAULT_TIME_LIMIT_SEC = 1800

function normalizeDifficultyLabel(value: string, fallback: Difficulty = 'Medium'): Difficulty {
  const normalized = (value || '').toLowerCase()
  if (normalized === 'easy') return 'Easy'
  if (normalized === 'hard') return 'Hard'
  if (normalized === 'medium') return 'Medium'
  return fallback
}

function normalizeQuestionType(value: string) {
  const normalized = (value || '').toLowerCase()
  if (normalized === 'coding') return 'coding'
  if (normalized === 'system') return 'system'
  if (normalized === 'behavioral') return 'behavioral'
  return 'theory'
}

function validateInterviewAnswer(answer: string): string | null {
  const trimmed = answer.trim()
  if (!trimmed) return 'Please enter an answer before submitting.'

  const words = trimmed.split(/\s+/).filter(Boolean)
  if (trimmed.length < 25 || words.length < 6) {
    return 'Answer is too short. Write at least 6 words with clear reasoning.'
  }

  const lowered = trimmed.toLowerCase()
  const invalidMarkers = ['idk', "i don't know", 'dont know', 'no idea', 'n/a', 'skip', '...']
  if (invalidMarkers.some((marker) => lowered.includes(marker))) {
    return 'Answer looks invalid. Please provide a meaningful explanation.'
  }

  const uniqueWords = new Set(words.map((word) => word.toLowerCase()))
  if (uniqueWords.size <= Math.max(2, Math.floor(words.length / 6))) {
    return 'Answer is too repetitive. Add concrete points and an example.'
  }

  return null
}

function extractReadableErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Unknown error'
  const message = error.message || 'Unknown error'
  try {
    const parsed = JSON.parse(message)
    if (typeof parsed?.error === 'string' && parsed.error.trim()) {
      return parsed.error.trim()
    }
  } catch {
    // Ignore parse errors and use raw message
  }
  return message
}

function isInvalidAnswerError(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('too short') ||
    normalized.includes('please enter an answer') ||
    normalized.includes('answer looks invalid') ||
    normalized.includes('too repetitive') ||
    normalized.includes('missing answer')
  )
}

export function useInterviewer(sessionId: string, profile: UserProfile | null) {
  const [currentQuestion, setCurrentQuestion] = useState<InterviewQuestionState | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [sessionStatus, setSessionStatus] = useState<'idle' | 'interviewing' | 'completed'>('idle')
  const [progress, setProgress] = useState({ current: 0, total: DEFAULT_TOTAL_QUESTIONS })
  const [difficulty, setDifficulty] = useState<Difficulty>('Medium')
  const [questionBank, setQuestionBank] = useState<QuestionBankEntry[]>([])
  const [preferredDomains, setPreferredDomains] = useState<string[]>([])
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null)
  const [timeLimitSec, setTimeLimitSec] = useState(DEFAULT_TIME_LIMIT_SEC)
  const [followUpsEnabled, setFollowUpsEnabled] = useState(true)
  const [prefillAnswer, setPrefillAnswer] = useState<string | null>(null)
  const [canRetry, setCanRetry] = useState(false)

  useEffect(() => {
    let isMounted = true
    const bootstrap = async () => {
      if (!profile?.careerPathId) return
      setIsProcessing(true)
      try {
        const [bank, careerPath, session] = await Promise.all([
          blink.db.questionBank.list(),
          blink.db.careerPaths.get(profile.careerPathId),
          blink.db.interviewSessions.get(sessionId),
        ])
        if (!isMounted) return

        setQuestionBank(bank as QuestionBankEntry[])
        setPreferredDomains(careerPath?.questionDomains || [])

        const totalQuestions = session?.totalQuestions || DEFAULT_TOTAL_QUESTIONS
        setProgress((prev) => ({ ...prev, total: totalQuestions }))
        if (session?.difficulty) setDifficulty(session.difficulty)
        if (session?.startedAt) setSessionStartedAt(session.startedAt)
        if (session?.timeLimitSec) setTimeLimitSec(session.timeLimitSec)
        if (typeof session?.followUpsEnabled === 'boolean') setFollowUpsEnabled(session.followUpsEnabled)
        if (session?.status === 'completed') setSessionStatus('completed')

        const questions = await blink.db.interviewQuestions.list({
          where: { sessionId },
          orderBy: { orderIndex: 'asc' },
        })

        const answered = questions.filter((question: any) => question.answerText)
        const pending = questions.find((question: any) => !question.answerText)

        const mappedHistory: HistoryItem[] = answered.map((entry: any) => ({
          question: {
            id: entry.id,
            questionId: entry.questionId,
            text: entry.questionText,
            difficulty: entry.difficulty,
            domain: entry.domain,
            tags: entry.tags || [],
            type: entry.type,
            rubric: entry.rubric,
            timeEstimateMin: entry.timeEstimateMin,
            starterCode: entry.starterCode,
            retryCount: entry.retryCount || 0,
          },
          answer: entry.answerText,
          evaluation: entry.evaluation,
        }))

        setHistory(mappedHistory)

        if (pending) {
          setCurrentQuestion({
            id: pending.id,
            questionId: pending.questionId,
            text: pending.questionText,
            difficulty: pending.difficulty,
            domain: pending.domain,
            tags: pending.tags || [],
            type: pending.type,
            rubric: pending.rubric,
            timeEstimateMin: pending.timeEstimateMin,
            starterCode: pending.starterCode,
            retryCount: pending.retryCount || 0,
          })
          setSessionStatus('interviewing')
        } else if (mappedHistory.length < totalQuestions && session?.status !== 'completed') {
          await generateNextQuestion(
            mappedHistory,
            totalQuestions,
            session?.difficulty || difficulty,
            bank as QuestionBankEntry[],
            careerPath?.questionDomains || []
          )
        }

        setProgress({
          current: mappedHistory.length + (pending ? 1 : 0),
          total: totalQuestions,
        })

        const lastEntry = mappedHistory[mappedHistory.length - 1]
        setCanRetry(Boolean(lastEntry && (lastEntry.question.retryCount || 0) < 1))
      } catch (err) {
        logError('Failed to load interview session', { error: err })
      } finally {
        if (isMounted) setIsProcessing(false)
      }
    }

    bootstrap()
    return () => {
      isMounted = false
    }
  }, [profile?.careerPathId, sessionId])

  const generateNextQuestion = useCallback(
    async (
      existingHistory: HistoryItem[] = history,
      totalQuestions = progress.total,
      baseDifficulty = difficulty,
      bankOverride?: QuestionBankEntry[],
      domainsOverride?: string[]
    ) => {
      if (!profile?.userId) return
      setIsProcessing(true)
      try {
        const askedIds = existingHistory.map((item) => item.question.questionId)
        const askedQuestions = existingHistory.map((item) => item.question.text).filter(Boolean)
        const bank = bankOverride || questionBank
        const domains = domainsOverride || preferredDomains
        let nextQuestion: QuestionBankEntry | null = null

        try {
          const recentHistory = existingHistory.slice(-5).map((item) => ({
            question: item.question.text,
            domain: item.question.domain,
            difficulty: item.question.difficulty,
            score: item.evaluation?.score ?? null,
            missingConcepts: item.evaluation?.missingConcepts || [],
          }))
          const targetDomain = domains[existingHistory.length % Math.max(domains.length, 1)] || 'General'
          const prompt = `GENERATE_INTERVIEW_QUESTION\nPAYLOAD:${JSON.stringify({
            action: 'generateInterviewQuestion',
            targetRole: profile?.targetRole || profile?.careerPathId || '',
            careerPath: profile?.careerPathId || '',
            preferredDomains: domains,
            targetDomain,
            desiredDifficulty: baseDifficulty,
            askedQuestions,
            history: recentHistory,
          })}`

          const { object } = await blink.ai.generateObject({
            prompt,
            schema: {
              type: 'object',
              properties: {
                questionId: { type: 'string' },
                question: { type: 'string' },
                difficulty: { type: 'string' },
                domain: { type: 'string' },
                tags: { type: 'array', items: { type: 'string' } },
                type: { type: 'string' },
                timeEstimateMin: { type: 'number' },
                interviewerNote: { type: 'string' },
                starterCode: { type: 'string' },
                rubric: { type: 'object' },
              },
            },
          })

          const aiQuestionText = typeof object?.question === 'string' ? object.question.trim() : ''
          if (aiQuestionText) {
            const rubric = (object as any)?.rubric || {}
            const expectedConcepts = Array.isArray(rubric.expectedConcepts)
              ? rubric.expectedConcepts.filter((item: unknown) => typeof item === 'string')
              : []
            const keyPoints = Array.isArray(rubric.keyPoints)
              ? rubric.keyPoints.filter((item: unknown) => typeof item === 'string')
              : []
            const commonMistakes = Array.isArray(rubric.commonMistakes)
              ? rubric.commonMistakes.filter((item: unknown) => typeof item === 'string')
              : []
            const edgeCases = Array.isArray(rubric.edgeCases)
              ? rubric.edgeCases.filter((item: unknown) => typeof item === 'string')
              : []
            const scoringWeights = rubric.scoringWeights && typeof rubric.scoringWeights === 'object'
              ? rubric.scoringWeights
              : undefined
            const difficultyLabel = normalizeDifficultyLabel(String((object as any)?.difficulty || baseDifficulty), baseDifficulty)
            nextQuestion = {
              id: typeof (object as any)?.questionId === 'string' && (object as any).questionId.trim()
                ? (object as any).questionId.trim()
                : `ai_${Date.now()}`,
              prompt: aiQuestionText,
              difficulty: difficultyLabel,
              domain: String((object as any)?.domain || targetDomain || 'General'),
              tags: Array.isArray((object as any)?.tags)
                ? (object as any).tags.filter((item: unknown) => typeof item === 'string').slice(0, 8)
                : [],
              type: normalizeQuestionType(String((object as any)?.type || 'theory')),
              rubric: {
                expectedConcepts,
                keyPoints,
                commonMistakes,
                edgeCases,
                scoringWeights,
                idealAnswer: typeof rubric.idealAnswer === 'string' ? rubric.idealAnswer : '',
                explanation: typeof rubric.explanation === 'string' ? rubric.explanation : '',
              },
              timeEstimateMin: Math.max(5, Math.min(35, Number((object as any)?.timeEstimateMin || 8))),
              starterCode: typeof (object as any)?.starterCode === 'string' ? (object as any).starterCode : undefined,
            }
          }
        } catch (err) {
          logError('AI recruiter question generation failed. Falling back to question bank.', { error: err })
        }

        if (!nextQuestion) {
          nextQuestion = selectNextQuestion(bank, askedIds, domains, baseDifficulty)
        }

        if (!nextQuestion) {
          setSessionStatus('completed')
          return
        }

        const orderIndex = existingHistory.length + 1
        const questionRecord = await blink.db.interviewQuestions.create({
          id: `q_${Date.now()}`,
          sessionId,
          questionId: nextQuestion.id,
          questionText: nextQuestion.prompt,
          difficulty: nextQuestion.difficulty,
          domain: nextQuestion.domain,
          tags: nextQuestion.tags,
          type: nextQuestion.type,
          rubric: nextQuestion.rubric,
          timeEstimateMin: nextQuestion.timeEstimateMin,
          starterCode: nextQuestion.starterCode,
          orderIndex,
          retryCount: 0,
        })

        setCurrentQuestion({
          id: questionRecord.id,
          questionId: nextQuestion.id,
          text: nextQuestion.prompt,
          difficulty: nextQuestion.difficulty as Difficulty,
          domain: nextQuestion.domain,
          tags: nextQuestion.tags,
          type: nextQuestion.type,
          rubric: nextQuestion.rubric,
          timeEstimateMin: nextQuestion.timeEstimateMin,
          starterCode: nextQuestion.starterCode,
          retryCount: 0,
        })

        await blink.db.interviewSessions.update(sessionId, {
          currentQuestionId: questionRecord.id,
          currentIndex: orderIndex,
          status: 'in_progress',
          totalQuestions,
          difficulty: baseDifficulty,
          timeLimitSec,
          followUpsEnabled,
        })

        setSessionStatus('interviewing')
        setProgress({ current: orderIndex, total: totalQuestions })
      } catch (err) {
        logError('Error generating next question', { error: err })
      } finally {
        setIsProcessing(false)
      }
    },
    [
      difficulty,
      followUpsEnabled,
      history,
      preferredDomains,
      profile?.careerPathId,
      profile?.targetRole,
      profile?.userId,
      progress.total,
      questionBank,
      sessionId,
      timeLimitSec,
    ]
  )

  const generateFollowUpQuestion = useCallback(
    async (followUpText: string, baseQuestion: InterviewQuestionState, totalQuestions = progress.total) => {
      if (!profile?.userId) return
      setIsProcessing(true)
      try {
        const orderIndex = history.length + 1
        const questionRecord = await blink.db.interviewQuestions.create({
          id: `q_${Date.now()}`,
          sessionId,
          questionId: `followup_${Date.now()}`,
          questionText: followUpText,
          difficulty: baseQuestion.difficulty,
          domain: baseQuestion.domain,
          tags: [...(baseQuestion.tags || []), 'follow-up'],
          type: baseQuestion.type,
          rubric: baseQuestion.rubric,
          timeEstimateMin: baseQuestion.timeEstimateMin,
          orderIndex,
          retryCount: 0,
          isFollowUp: true,
          parentQuestionId: baseQuestion.questionId,
        })

        setCurrentQuestion({
          id: questionRecord.id,
          questionId: questionRecord.questionId,
          text: questionRecord.questionText,
          difficulty: baseQuestion.difficulty,
          domain: baseQuestion.domain,
          tags: questionRecord.tags || [],
          type: baseQuestion.type,
          rubric: baseQuestion.rubric,
          timeEstimateMin: baseQuestion.timeEstimateMin,
          retryCount: 0,
        })

        await blink.db.interviewSessions.update(sessionId, {
          currentQuestionId: questionRecord.id,
          currentIndex: orderIndex,
          status: 'in_progress',
          totalQuestions,
          timeLimitSec,
          followUpsEnabled,
        })

        setSessionStatus('interviewing')
        setProgress({ current: orderIndex, total: totalQuestions })
      } catch (err) {
        logError('Error generating follow-up question', { error: err })
      } finally {
        setIsProcessing(false)
      }
    },
    [followUpsEnabled, history.length, profile?.userId, progress.total, sessionId, timeLimitSec]
  )

  const evaluateAnswer = useCallback(
    async (answer: string) => {
      if (!currentQuestion || isProcessing) return null
      const validationError = validateInterviewAnswer(answer)
      if (validationError) {
        throw new Error(validationError)
      }

      setIsProcessing(true)
      try {
        const sanitized = clampText(answer, 2000)
        const prompt = `EVALUATE_ANSWER\nPAYLOAD:${JSON.stringify({
          action: 'evaluateAnswer',
          answer: sanitized,
          question: {
            text: currentQuestion.text,
            domain: currentQuestion.domain,
            difficulty: currentQuestion.difficulty,
            type: currentQuestion.type,
            tags: currentQuestion.tags,
            timeEstimateMin: currentQuestion.timeEstimateMin,
          },
          rubric: currentQuestion.rubric,
        })}`

        const { object } = await blink.ai.generateObject({
          prompt,
          schema: {
            type: 'object',
            properties: {
              score: { type: 'number' },
              confidence: { type: 'number' },
              breakdown: { type: 'object' },
              strengths: { type: 'array', items: { type: 'string' } },
              weaknesses: { type: 'array', items: { type: 'string' } },
              mistakesFound: { type: 'array', items: { type: 'string' } },
              missingConcepts: { type: 'array', items: { type: 'string' } },
              coverage: { type: 'array', items: { type: 'object' } },
              scoreRationale: { type: 'object' },
              improvements: { type: 'array', items: { type: 'string' } },
              idealAnswer: { type: 'string' },
              nextSteps: { type: 'array', items: { type: 'string' } },
              followUp: { type: 'string' },
              isUncertain: { type: 'boolean' },
            },
          },
        })

        const evaluation = object as EvaluationResult

        await blink.db.interviewQuestions.update(currentQuestion.id, {
          answerText: sanitized,
          evaluation,
          scoreBreakdown: evaluation.breakdown,
          answeredAt: new Date().toISOString(),
          retryCount: currentQuestion.retryCount,
        })

        const updatedHistory = [
          ...history,
          {
            question: currentQuestion,
            answer: sanitized,
            evaluation,
          },
        ]

        const newDifficulty = nextDifficulty(difficulty, evaluation.score)
        await blink.db.interviewSessions.update(sessionId, {
          currentIndex: updatedHistory.length,
          lastScore: evaluation.score,
          difficulty: newDifficulty,
        })

        setHistory(updatedHistory)
        setCanRetry(currentQuestion.retryCount < 1)

        setDifficulty(newDifficulty)

        const answeredCount = updatedHistory.length
        setProgress({ current: answeredCount, total: progress.total })

        return { evaluation, nextDifficulty: newDifficulty }
      } catch (err) {
        const message = extractReadableErrorMessage(err)
        if (isInvalidAnswerError(message)) {
          throw new Error(message)
        }
        logError('Error evaluating answer', { error: err })
        return null
      } finally {
        setIsProcessing(false)
      }
    },
    [currentQuestion, difficulty, history, isProcessing, progress.total]
  )

  const finalizeSession = useCallback(async () => {
    if (!profile?.userId) return null
    setIsProcessing(true)
    try {
      const prompt = `FINAL_REPORT\nPAYLOAD:${JSON.stringify({
        action: 'finalReport',
        evaluations: history.map((item) => item.evaluation),
      })}`

      const { object } = await blink.ai.generateObject({
        prompt,
        schema: {
          type: 'object',
          properties: {
            totalScore: { type: 'number' },
            strengths: { type: 'array', items: { type: 'string' } },
            weaknesses: { type: 'array', items: { type: 'string' } },
            recommendations: { type: 'array', items: { type: 'string' } },
          },
        },
      })

      await blink.db.feedbackReports.create({
        id: `rep_${Date.now()}`,
        sessionId,
        userId: profile.userId,
        score: object.totalScore,
        strengths: object.strengths,
        weaknesses: object.weaknesses,
        recommendations: object.recommendations,
      })

      await blink.db.interviewSessions.update(sessionId, {
        status: 'completed',
        endedAt: new Date().toISOString(),
        finalScore: object.totalScore,
      })

      setSessionStatus('completed')
      return object
    } catch (err) {
      logError('Error finalizing session', { error: err })
      return null
    } finally {
      setIsProcessing(false)
    }
  }, [history, profile?.userId, sessionId])

  const getHint = useCallback(async (answer = '') => {
    if (!currentQuestion) return 'No question loaded yet.'
    try {
      const prompt = `HINT\nPAYLOAD:${JSON.stringify({
        action: 'generateHint',
        answer,
        question: {
          text: currentQuestion.text,
          domain: currentQuestion.domain,
          difficulty: currentQuestion.difficulty,
          type: currentQuestion.type,
          tags: currentQuestion.tags,
          timeEstimateMin: currentQuestion.timeEstimateMin,
        },
        rubric: currentQuestion.rubric,
      })}`

      const { object } = await blink.ai.generateObject({
        prompt,
        schema: {
          type: 'object',
          properties: {
            hint: { type: 'string' },
          },
          required: ['hint'],
        },
      })

      return object?.hint || generateHint(answer, currentQuestion.rubric)
    } catch (err) {
      logError('Hint generation failed', { error: err })
      if (blink.ai.isStrict) throw err
      return generateHint(answer, currentQuestion.rubric)
    }
  }, [currentQuestion])

  const getExplanation = useCallback(async () => {
    if (!currentQuestion) return 'No question loaded yet.'
    try {
      const prompt = `EXPLAIN\nPAYLOAD:${JSON.stringify({
        action: 'explainConcept',
        question: {
          text: currentQuestion.text,
          domain: currentQuestion.domain,
          difficulty: currentQuestion.difficulty,
          type: currentQuestion.type,
          tags: currentQuestion.tags,
          timeEstimateMin: currentQuestion.timeEstimateMin,
        },
        rubric: currentQuestion.rubric,
      })}`

      const { object } = await blink.ai.generateObject({
        prompt,
        schema: {
          type: 'object',
          properties: {
            explanation: { type: 'string' },
          },
          required: ['explanation'],
        },
      })

      return object?.explanation || generateExplanation(currentQuestion.rubric)
    } catch (err) {
      logError('Explanation generation failed', { error: err })
      if (blink.ai.isStrict) throw err
      return generateExplanation(currentQuestion.rubric)
    }
  }, [currentQuestion])

  const retryLastAnswer = useCallback(async () => {
    const last = history[history.length - 1]
    if (!last) return
    if ((last.question.retryCount || 0) >= 1) return

    await blink.db.interviewQuestions.update(last.question.id, {
      answerText: null,
      evaluation: null,
      scoreBreakdown: null,
      retryCount: (last.question.retryCount || 0) + 1,
    })

    setHistory((prev) => prev.slice(0, -1))
    setCurrentQuestion({
      ...last.question,
      retryCount: (last.question.retryCount || 0) + 1,
    })
    setPrefillAnswer(last.answer)
    setCanRetry(false)
  }, [history])

  const clearPrefill = useCallback(() => {
    setPrefillAnswer(null)
  }, [])

  return {
    currentQuestion,
    history,
    isProcessing,
    sessionStatus,
    progress,
    totalQuestions: progress.total,
    timeLimitSec,
    followUpsEnabled,
    sessionStartedAt,
    generateNextQuestion,
    generateFollowUpQuestion,
    evaluateAnswer,
    finalizeSession,
    getHint,
    getExplanation,
    retryLastAnswer,
    canRetry,
    prefillAnswer,
    clearPrefill,
  }
}
