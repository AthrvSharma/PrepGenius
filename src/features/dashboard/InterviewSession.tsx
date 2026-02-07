import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Card } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Textarea } from '../../components/ui/textarea'
import { useProfile } from '../../hooks/useProfile'
import { useInterviewer } from '../../hooks/useInterviewer'
import {
  Send,
  Timer,
  BrainCircuit,
  CheckCircle2,
  AlertTriangle,
  Trophy,
  BookOpen,
  Lightbulb,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface InterviewSessionProps {
  sessionId: string
  onComplete: () => void
}

export function InterviewSession({ sessionId, onComplete }: InterviewSessionProps) {
  const { profile } = useProfile()
  const interviewer = useInterviewer(sessionId, profile)
  const [answer, setAnswer] = useState('')
  const [timeLeft, setTimeLeft] = useState(interviewer.timeLimitSec)
  const [sessionResults, setSessionResults] = useState<any>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const breakdownAverages = useMemo(() => {
    if (!interviewer.history.length) return null
    const totals = {
      correctness: 0,
      conceptCoverage: 0,
      clarity: 0,
      depth: 0,
      communication: 0,
    }
    interviewer.history.forEach((item) => {
      const breakdown = item.evaluation?.breakdown
      if (!breakdown) return
      totals.correctness += breakdown.correctness || 0
      totals.conceptCoverage += breakdown.conceptCoverage || 0
      totals.clarity += breakdown.clarity || 0
      totals.depth += breakdown.depth || 0
      totals.communication += breakdown.communication || 0
    })
    const count = interviewer.history.length || 1
    return {
      correctness: Math.round(totals.correctness / count),
      conceptCoverage: Math.round(totals.conceptCoverage / count),
      clarity: Math.round(totals.clarity / count),
      depth: Math.round(totals.depth / count),
      communication: Math.round(totals.communication / count),
    }
  }, [interviewer.history])

  const domainFocus = useMemo(() => {
    const counts: Record<string, number> = {}
    interviewer.history.forEach((item) => {
      const domain = item.question.domain || 'General'
      counts[domain] = (counts[domain] || 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([domain, count]) => ({ domain, count }))
  }, [interviewer.history])

  useEffect(() => {
    if (!interviewer.currentQuestion && interviewer.sessionStatus === 'idle') {
      interviewer.generateNextQuestion()
    }
  }, [interviewer])

  useEffect(() => {
    if (interviewer.sessionStartedAt) {
      const startedAt = Date.parse(interviewer.sessionStartedAt)
      if (!Number.isNaN(startedAt)) {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000)
        setTimeLeft(Math.max(interviewer.timeLimitSec - elapsed, 0))
        return
      }
    }
    setTimeLeft(interviewer.timeLimitSec)
  }, [interviewer.sessionStartedAt, interviewer.timeLimitSec])

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [interviewer.history, interviewer.isProcessing, interviewer.currentQuestion])

  useEffect(() => {
    if (interviewer.prefillAnswer) {
      setAnswer(interviewer.prefillAnswer)
      interviewer.clearPrefill()
    }
  }, [interviewer])

  useEffect(() => {
    if (interviewer.currentQuestion?.starterCode && !answer) {
      setAnswer(interviewer.currentQuestion.starterCode)
    }
  }, [interviewer.currentQuestion, answer])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const handleSubmit = async () => {
    if (!answer.trim() || interviewer.isProcessing || !interviewer.currentQuestion) return
    const currentAnswer = answer
    setAnswer('')
    const result = await interviewer.evaluateAnswer(currentAnswer)
    if (!result) {
      setAnswer(currentAnswer)
      toast.error('AI evaluation failed. Please try again.')
      return
    }
    const { evaluation, nextDifficulty } = result

    const nextHistory = [
      ...interviewer.history,
      {
        question: interviewer.currentQuestion,
        answer: currentAnswer,
        evaluation,
      },
    ]

    if (nextHistory.length >= interviewer.totalQuestions) {
      const final = await interviewer.finalizeSession()
      setSessionResults(final)
    } else if (interviewer.followUpsEnabled && evaluation.followUp && evaluation.score < 75) {
      await interviewer.generateFollowUpQuestion(evaluation.followUp, interviewer.currentQuestion, interviewer.totalQuestions)
    } else {
      await interviewer.generateNextQuestion(nextHistory, interviewer.totalQuestions, nextDifficulty)
    }
  }

  const handleHint = async () => {
    if (!interviewer.currentQuestion) return
    const toastId = toast.loading('Generating hint...')
    try {
      const hint = await interviewer.getHint(answer)
      toast.success(hint, { id: toastId })
    } catch (err) {
      toast.error('AI hint failed. Please try again.', { id: toastId })
    }
  }

  const handleExplain = async () => {
    if (!interviewer.currentQuestion) return
    const toastId = toast.loading('Generating explanation...')
    try {
      const explanation = await interviewer.getExplanation()
      toast.success(explanation, { id: toastId })
    } catch (err) {
      toast.error('AI explanation failed. Please try again.', { id: toastId })
    }
  }

  const EvaluationPanel = ({ evaluation }: { evaluation: any }) => (
    <div className="mt-4 rounded-2xl border border-border/40 bg-secondary/40 p-4 text-xs space-y-3">
      <div className="flex flex-wrap gap-2">
        <span className="px-2 py-1 rounded-full bg-primary/10 text-primary font-bold">Score {evaluation.score}%</span>
        {typeof evaluation.confidence === 'number' && (
          <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-700 font-bold">Confidence {evaluation.confidence}%</span>
        )}
        <span className="px-2 py-1 rounded-full bg-muted/60 text-muted-foreground font-semibold">Correctness {evaluation.breakdown?.correctness}</span>
        <span className="px-2 py-1 rounded-full bg-muted/60 text-muted-foreground font-semibold">Concept {evaluation.breakdown?.conceptCoverage}</span>
        <span className="px-2 py-1 rounded-full bg-muted/60 text-muted-foreground font-semibold">Clarity {evaluation.breakdown?.clarity}</span>
        <span className="px-2 py-1 rounded-full bg-muted/60 text-muted-foreground font-semibold">Depth {evaluation.breakdown?.depth}</span>
        <span className="px-2 py-1 rounded-full bg-muted/60 text-muted-foreground font-semibold">Structure {evaluation.breakdown?.communication}</span>
      </div>
      <div>
        <p className="font-semibold">What you did right</p>
        <p className="text-muted-foreground">{evaluation.strengths?.join(', ') || 'Solid attempt. Keep building on this.'}</p>
      </div>
      <div>
        <p className="font-semibold">What's missing</p>
        <p className="text-muted-foreground">{evaluation.missingConcepts?.join(', ') || 'Add more depth on trade-offs.'}</p>
      </div>
      {evaluation.mistakesFound?.length ? (
        <div>
          <p className="font-semibold">Mistakes detected</p>
          <p className="text-muted-foreground">{evaluation.mistakesFound.join(', ')}</p>
        </div>
      ) : null}
      {evaluation.coverage?.length ? (
        <div>
          <p className="font-semibold">Coverage check</p>
          <div className="flex flex-wrap gap-2">
            {evaluation.coverage.slice(0, 3).map((item: any, index: number) => (
              <span
                key={`${item.concept}-${index}`}
                className={`px-2 py-1 rounded-full text-[10px] font-semibold ${item.covered ? 'bg-green-500/10 text-green-600' : 'bg-amber-500/10 text-amber-600'}`}
              >
                {item.concept} {item.covered ? 'covered' : 'missing'}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div>
        <p className="font-semibold">How to improve</p>
        <p className="text-muted-foreground">{evaluation.improvements?.join(' ')}</p>
      </div>
      {evaluation.scoreRationale ? (
        <div>
          <p className="font-semibold">Score rationale</p>
          <p className="text-muted-foreground">
            {[
              evaluation.scoreRationale.correctness,
              evaluation.scoreRationale.conceptCoverage,
              evaluation.scoreRationale.clarity,
              evaluation.scoreRationale.depth,
              evaluation.scoreRationale.communication,
            ]
              .filter(Boolean)
              .join(' ')}
          </p>
        </div>
      ) : null}
      <div>
        <p className="font-semibold">Ideal answer sample</p>
        <p className="text-muted-foreground">{evaluation.idealAnswer}</p>
      </div>
      <div>
        <p className="font-semibold">Next steps</p>
        <p className="text-muted-foreground">{evaluation.nextSteps?.join(', ')}</p>
      </div>
      {evaluation.isUncertain && (
        <div className="text-amber-600 font-semibold">
          The evaluator is unsure. Add clarification or a concrete example.
        </div>
      )}
    </div>
  )

  if (!profile) {
    return (
      <div className="h-full flex items-center justify-center">
        <Card className="p-6 rounded-3xl border-border/40">
          <p className="text-sm text-muted-foreground">Loading your interview session...</p>
        </Card>
      </div>
    )
  }

  if (sessionResults) {
    return (
      <div className="p-8 max-w-4xl mx-auto animate-fade-in space-y-8">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Trophy className="text-primary w-10 h-10" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Interview Completed!</h1>
          <p className="text-muted-foreground">Great job. Here is your AI-generated readiness report.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-8 rounded-3xl border-primary/20 bg-primary/5 text-center flex flex-col justify-center">
            <p className="text-sm font-bold text-primary uppercase tracking-wider mb-2">Readiness Score</p>
            <h2 className="text-7xl font-bold text-primary">{sessionResults.totalScore}%</h2>
          </Card>

          <Card className="p-8 rounded-3xl space-y-6">
            <div className="space-y-2">
              <h3 className="font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                Key Strengths
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                {sessionResults.strengths?.map((s: string, i: number) => <li key={i}>• {s}</li>)}
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Areas for Growth
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                {sessionResults.weaknesses?.map((w: string, i: number) => <li key={i}>• {w}</li>)}
              </ul>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-8 rounded-3xl space-y-6">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-primary" />
              Score Breakdown Averages
            </h3>
            {breakdownAverages ? (
              <div className="space-y-4 text-sm text-muted-foreground">
                {[
                  { label: 'Correctness', value: breakdownAverages.correctness },
                  { label: 'Concept Coverage', value: breakdownAverages.conceptCoverage },
                  { label: 'Clarity', value: breakdownAverages.clarity },
                  { label: 'Depth & Edge Cases', value: breakdownAverages.depth },
                  { label: 'Communication', value: breakdownAverages.communication },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span>{item.label}</span>
                    <span className="font-bold text-foreground">{item.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No breakdown data yet.</p>
            )}
          </Card>

          <Card className="p-8 rounded-3xl space-y-6">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Trophy className="w-4 h-4 text-primary" />
              Top Domains Practiced
            </h3>
            {domainFocus.length ? (
              <div className="flex flex-wrap gap-2">
                {domainFocus.map((item) => (
                  <span key={item.domain} className="px-3 py-1 rounded-full bg-secondary text-xs font-semibold">
                    {item.domain} | {item.count}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No domain data yet.</p>
            )}
          </Card>
        </div>

        <Card className="p-8 rounded-3xl space-y-6">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Recommended Learning Path
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sessionResults.recommendations?.map((rec: string, i: number) => (
              <div key={i} className="p-4 rounded-2xl bg-secondary/50 border border-border/40 text-sm font-medium leading-relaxed">
                {rec}
              </div>
            ))}
          </div>
        </Card>

        <div className="flex justify-center pt-8">
          <Button onClick={onComplete} size="lg" className="rounded-full px-12 h-14 font-bold shadow-xl shadow-primary/20">
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-background relative overflow-hidden">
      <header className="h-20 border-b border-border/40 flex items-center px-8 justify-between bg-background/80 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <BrainCircuit className="text-primary-foreground w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold">AI Mock Interview</h2>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Session ID: {sessionId}</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-secondary border border-border/40 font-mono text-sm">
            <Timer className="w-4 h-4 text-primary" />
            {formatTime(timeLeft)}
          </div>
          <div className="px-3 py-2 rounded-2xl bg-secondary/70 border border-border/40 text-xs font-bold uppercase tracking-widest">
            Q {interviewer.progress.current}/{interviewer.totalQuestions}
          </div>
          <Button variant="ghost" onClick={onComplete} className="text-muted-foreground hover:text-destructive">Quit Session</Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar" ref={scrollRef}>
        <div className="max-w-4xl mx-auto space-y-8">
          {interviewer.history.map((item, i) => (
            <div key={i} className="space-y-8">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary-foreground">AI</span>
                </div>
                <div className="space-y-2 max-w-[80%]">
                  <div className="p-6 rounded-3xl rounded-tl-none bg-card border border-border/40 shadow-sm leading-relaxed">
                    <p className="font-medium text-foreground">{item.question.text}</p>
                    <p className="text-[10px] text-muted-foreground mt-3">Domain: {item.question.domain} • {item.question.difficulty}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 flex-row-reverse">
                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">ME</span>
                </div>
                <div className="space-y-2 max-w-[80%] flex flex-col items-end">
                  <div className="p-6 rounded-3xl rounded-tr-none bg-primary text-primary-foreground shadow-lg shadow-primary/10 leading-relaxed">
                    <p>{item.answer}</p>
                  </div>
                  <EvaluationPanel evaluation={item.evaluation} />
                </div>
              </div>
            </div>
          ))}

          {interviewer.currentQuestion && (
            <div className="flex gap-4 animate-in slide-in-from-bottom-4 duration-500">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary-foreground">AI</span>
              </div>
              <div className="space-y-2 max-w-[80%]">
                <div className="p-6 rounded-3xl rounded-tl-none bg-card border border-border/40 shadow-sm leading-relaxed">
                  <p className="font-medium text-foreground">{interviewer.currentQuestion.text}</p>
                  <div className="flex flex-wrap gap-2 mt-4 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                    <span>{interviewer.currentQuestion.domain}</span>
                    <span>•</span>
                    <span>{interviewer.currentQuestion.difficulty}</span>
                    <span>•</span>
                    <span>{interviewer.currentQuestion.timeEstimateMin} mins</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {interviewer.isProcessing && (
            <div className="flex gap-4 animate-pulse">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
              <div className="p-4 rounded-2xl bg-muted/50 w-32 h-12" />
            </div>
          )}
        </div>
      </div>

      <div className="p-8 bg-background border-t border-border/40">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" size="sm" onClick={handleHint} className="rounded-full gap-2">
              <Lightbulb className="w-4 h-4" />
              Hint
            </Button>
            <Button variant="outline" size="sm" onClick={handleExplain} className="rounded-full gap-2">
              <Sparkles className="w-4 h-4" />
              Explain concept
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={interviewer.retryLastAnswer}
              disabled={!interviewer.canRetry}
              className="rounded-full gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Retry answer
            </Button>
          </div>
          <div className="relative group">
            <Textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your response here... (Professional depth is rewarded)"
              className={`min-h-[120px] rounded-[2rem] p-8 pr-24 bg-card border-border/40 shadow-xl shadow-foreground/5 focus:ring-primary/20 transition-all resize-none ${interviewer.currentQuestion?.type === 'coding' ? 'font-mono text-sm' : ''}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
            />
            <Button
              onClick={handleSubmit}
              disabled={!answer.trim() || interviewer.isProcessing}
              className="absolute right-4 bottom-4 w-14 h-14 rounded-2xl shadow-lg shadow-primary/20"
            >
              <Send className="w-6 h-6" />
            </Button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
            Shift + Enter for new line • Keep answers concise and structured
          </p>
        </div>
      </div>
    </div>
  )
}
