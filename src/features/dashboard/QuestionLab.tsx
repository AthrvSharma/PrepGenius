import React, { useEffect, useMemo, useState } from 'react'
import { Card } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Textarea } from '../../components/ui/textarea'
import { useProfile } from '../../hooks/useProfile'
import { blink } from '../../lib/blink'
import { clampText } from '../../lib/validation'
import { QuestionBankEntry } from '../../lib/interviewEngine'
import { BookOpen, BrainCircuit, CheckCircle2, Filter, Lightbulb, Loader2, Search } from 'lucide-react'
import toast from 'react-hot-toast'

export function QuestionLab() {
  const { profile } = useProfile()
  const [questions, setQuestions] = useState<QuestionBankEntry[]>([])
  const [attempts, setAttempts] = useState<any[]>([])
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null)
  const [domainFilter, setDomainFilter] = useState('All')
  const [difficultyFilter, setDifficultyFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState('')
  const [evaluation, setEvaluation] = useState<any | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [isExplaining, setIsExplaining] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      const bank = await blink.db.questionBank.list()
      setQuestions(bank as QuestionBankEntry[])
      if (!selectedQuestionId && bank[0]?.id) {
        setSelectedQuestionId(bank[0].id)
      }

      if (profile?.userId) {
        const history = await blink.db.practiceAttempts.list({
          where: { userId: profile.userId },
          orderBy: { createdAt: 'desc' },
        })
        setAttempts(history)
      }
    }
    fetchData()
  }, [profile?.userId])

  const domains = useMemo(() => {
    const unique = Array.from(new Set(questions.map((q) => q.domain))).sort()
    return ['All', ...unique]
  }, [questions])

  const selectedQuestion = questions.find((q) => q.id === selectedQuestionId) || questions[0]

  const filteredQuestions = useMemo(() => {
    return questions.filter((question) => {
      const matchesDomain = domainFilter === 'All' || question.domain === domainFilter
      const matchesDifficulty = difficultyFilter === 'All' || question.difficulty.toLowerCase() === difficultyFilter.toLowerCase()
      const matchesType = typeFilter === 'All' || question.type === typeFilter
      const matchesQuery = !query.trim() || question.prompt.toLowerCase().includes(query.toLowerCase())
      return matchesDomain && matchesDifficulty && matchesType && matchesQuery
    })
  }, [questions, domainFilter, difficultyFilter, typeFilter, query])

  useEffect(() => {
    if (!filteredQuestions.length) return
    if (!selectedQuestionId || !filteredQuestions.find((item) => item.id === selectedQuestionId)) {
      setSelectedQuestionId(filteredQuestions[0].id)
    }
  }, [filteredQuestions, selectedQuestionId])

  const handleExplain = async () => {
    if (!selectedQuestion) return
    setIsExplaining(true)
    const toastId = toast.loading('Generating explanation...')
    try {
      const { object } = await blink.ai.generateObject({
        prompt: `EXPLAIN\nPAYLOAD:${JSON.stringify({
          action: 'explainConcept',
          question: {
            text: selectedQuestion.prompt,
            domain: selectedQuestion.domain,
            difficulty: selectedQuestion.difficulty,
            type: selectedQuestion.type,
            tags: selectedQuestion.tags,
            timeEstimateMin: selectedQuestion.timeEstimateMin,
          },
          rubric: selectedQuestion.rubric,
        })}`,
        schema: {
          type: 'object',
          properties: {
            explanation: { type: 'string' },
          },
        },
      })
      setExplanation(object?.explanation || selectedQuestion.rubric?.explanation || '')
      toast.success('Explanation ready', { id: toastId })
    } catch (err) {
      toast.error('AI explanation failed', { id: toastId })
    } finally {
      setIsExplaining(false)
    }
  }

  const handleEvaluate = async () => {
    if (!selectedQuestion || !profile?.userId) return
    if (!answer.trim()) {
      toast.error('Write an answer first.')
      return
    }
    setIsEvaluating(true)
    const toastId = toast.loading('Evaluating your answer...')
    try {
      const { object } = await blink.ai.generateObject({
        prompt: `EVALUATE_ANSWER\nPAYLOAD:${JSON.stringify({
          action: 'evaluateAnswer',
          answer: clampText(answer, 2000),
          question: {
            text: selectedQuestion.prompt,
            domain: selectedQuestion.domain,
            difficulty: selectedQuestion.difficulty,
            type: selectedQuestion.type,
            tags: selectedQuestion.tags,
            timeEstimateMin: selectedQuestion.timeEstimateMin,
          },
          rubric: selectedQuestion.rubric,
        })}`,
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

      setEvaluation(object)
      const attempt = await blink.db.practiceAttempts.create({
        id: `practice_${Date.now()}`,
        userId: profile.userId,
        questionId: selectedQuestion.id,
        questionText: selectedQuestion.prompt,
        answerText: clampText(answer, 2000),
        evaluation: object,
      })
      setAttempts((prev) => [attempt, ...prev].slice(0, 8))
      toast.success('Evaluation complete!', { id: toastId })
    } catch (err) {
      toast.error('AI evaluation failed', { id: toastId })
    } finally {
      setIsEvaluating(false)
    }
  }

  const EvaluationPanel = ({ data }: { data: any }) => (
    <div className="mt-4 rounded-2xl border border-border/40 bg-secondary/40 p-4 text-xs space-y-3">
      <div className="flex flex-wrap gap-2">
        <span className="px-2 py-1 rounded-full bg-primary/10 text-primary font-bold">Score {data.score}%</span>
        {typeof data.confidence === 'number' && (
          <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-700 font-bold">Confidence {data.confidence}%</span>
        )}
        <span className="px-2 py-1 rounded-full bg-muted/60 text-muted-foreground font-semibold">Correctness {data.breakdown?.correctness}</span>
        <span className="px-2 py-1 rounded-full bg-muted/60 text-muted-foreground font-semibold">Concept {data.breakdown?.conceptCoverage}</span>
        <span className="px-2 py-1 rounded-full bg-muted/60 text-muted-foreground font-semibold">Clarity {data.breakdown?.clarity}</span>
        <span className="px-2 py-1 rounded-full bg-muted/60 text-muted-foreground font-semibold">Depth {data.breakdown?.depth}</span>
        <span className="px-2 py-1 rounded-full bg-muted/60 text-muted-foreground font-semibold">Structure {data.breakdown?.communication}</span>
      </div>
      <div>
        <p className="font-semibold">What you did right</p>
        <p className="text-muted-foreground">{data.strengths?.join(', ') || 'Solid attempt. Keep building.'}</p>
      </div>
      <div>
        <p className="font-semibold">What's missing</p>
        <p className="text-muted-foreground">{data.missingConcepts?.join(', ') || 'Add more depth on trade-offs.'}</p>
      </div>
      {data.mistakesFound?.length ? (
        <div>
          <p className="font-semibold">Mistakes detected</p>
          <p className="text-muted-foreground">{data.mistakesFound.join(', ')}</p>
        </div>
      ) : null}
      {data.coverage?.length ? (
        <div>
          <p className="font-semibold">Coverage check</p>
          <div className="flex flex-wrap gap-2">
            {data.coverage.slice(0, 3).map((item: any, index: number) => (
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
        <p className="text-muted-foreground">{data.improvements?.join(' ')}</p>
      </div>
      {data.scoreRationale ? (
        <div>
          <p className="font-semibold">Score rationale</p>
          <p className="text-muted-foreground">
            {[
              data.scoreRationale.correctness,
              data.scoreRationale.conceptCoverage,
              data.scoreRationale.clarity,
              data.scoreRationale.depth,
              data.scoreRationale.communication,
            ]
              .filter(Boolean)
              .join(' ')}
          </p>
        </div>
      ) : null}
      <div>
        <p className="font-semibold">Ideal answer sample</p>
        <p className="text-muted-foreground">{data.idealAnswer}</p>
      </div>
      {data.isUncertain && (
        <div className="text-amber-600 font-semibold">
          The evaluator is unsure. Add clarification or a concrete example.
        </div>
      )}
    </div>
  )

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Question Lab</h1>
          <p className="text-muted-foreground">Browse the question bank, practice answers, and get instant AI feedback.</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <BrainCircuit className="w-4 h-4 text-primary" />
          Practice by domain, difficulty, and type
        </div>
      </div>

      <Card className="p-6 rounded-3xl border-border/40 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <Filter className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">Filters</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Select value={domainFilter} onValueChange={setDomainFilter}>
            <SelectTrigger className="h-11 rounded-2xl bg-background">
              <SelectValue placeholder="Domain" />
            </SelectTrigger>
            <SelectContent>
              {domains.map((domain) => (
                <SelectItem key={domain} value={domain}>{domain}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
            <SelectTrigger className="h-11 rounded-2xl bg-background">
              <SelectValue placeholder="Difficulty" />
            </SelectTrigger>
            <SelectContent>
              {['All', 'Easy', 'Medium', 'Hard'].map((level) => (
                <SelectItem key={level} value={level}>{level}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-11 rounded-2xl bg-background">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {['All', 'theory', 'coding', 'system', 'behavioral'].map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              className="pl-10 h-11 w-full rounded-2xl border border-border/40 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Search question..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-lg font-bold px-2">Questions</h2>
          {filteredQuestions.length === 0 ? (
            <Card className="p-10 text-center rounded-3xl border-dashed border-2">
              <p className="text-sm text-muted-foreground">No questions match your filters.</p>
            </Card>
          ) : (
            filteredQuestions.map((question) => (
              <Card
                key={question.id}
                onClick={() => {
                  setSelectedQuestionId(question.id)
                  setAnswer('')
                  setEvaluation(null)
                  setExplanation(null)
                }}
                className={`p-4 rounded-2xl border-border/40 hover:border-primary/30 transition-all cursor-pointer group ${
                  selectedQuestionId === question.id ? 'border-primary/40 bg-secondary/20' : ''
                }`}
              >
                <p className="text-sm font-bold mb-2 line-clamp-2">{question.prompt}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                  {question.domain} | {question.difficulty}
                </p>
              </Card>
            ))
          )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          {selectedQuestion ? (
            <div className="space-y-6">
              <Card className="p-8 rounded-3xl border-border/40 shadow-sm space-y-4">
                <div className="flex items-center gap-3">
                  <BookOpen className="w-5 h-5 text-primary" />
                  <h3 className="text-xl font-bold">Question</h3>
                </div>
                <p className="text-sm text-muted-foreground">{selectedQuestion.prompt}</p>
                <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                  <span>{selectedQuestion.domain}</span>
                  <span>|</span>
                  <span>{selectedQuestion.difficulty}</span>
                  <span>|</span>
                  <span>{selectedQuestion.type}</span>
                </div>
              </Card>

              <Card className="p-8 rounded-3xl border-border/40 shadow-sm space-y-4">
                <h3 className="text-lg font-bold">Rubric Focus</h3>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div>
                    <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Expected Concepts</p>
                    <p>{selectedQuestion.rubric?.expectedConcepts?.join(', ') || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Key Points</p>
                    <p>{selectedQuestion.rubric?.keyPoints?.join(', ') || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Common Mistakes</p>
                    <p>{selectedQuestion.rubric?.commonMistakes?.join(', ') || 'Not specified'}</p>
                  </div>
                </div>
              </Card>

              <Card className="p-8 rounded-3xl border-border/40 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold">Concept Explanation</h3>
                  <Button variant="outline" size="sm" onClick={handleExplain} disabled={isExplaining} className="rounded-full gap-2">
                    {isExplaining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
                    Explain
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {explanation || selectedQuestion.rubric?.explanation || 'Click explain to get an AI breakdown.'}
                </p>
              </Card>

              <Card className="p-8 rounded-3xl border-border/40 shadow-sm space-y-4">
                <h3 className="text-lg font-bold">Practice Answer</h3>
                <Textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Write your answer here..."
                  className={`min-h-[140px] rounded-2xl bg-background border-border/40 ${selectedQuestion.type === 'coding' ? 'font-mono text-sm' : ''}`}
                />
                <Button onClick={handleEvaluate} disabled={isEvaluating} className="h-11 rounded-2xl px-6 gap-2">
                  {isEvaluating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Evaluate Answer
                </Button>
                {evaluation && <EvaluationPanel data={evaluation} />}
              </Card>

              <Card className="p-8 rounded-3xl border-border/40 shadow-sm space-y-4">
                <h3 className="text-lg font-bold">Recent Attempts</h3>
                {attempts.length ? (
                  <div className="space-y-3">
                    {attempts.slice(0, 5).map((attempt) => (
                      <div key={attempt.id} className="p-4 rounded-2xl bg-secondary/30 border border-border/20">
                        <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-2">
                          {new Date(attempt.createdAt).toLocaleDateString()} | Score {attempt.evaluation?.score || 0}%
                        </p>
                        <p className="text-sm font-semibold line-clamp-2">{attempt.questionText}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No practice attempts yet.</p>
                )}
              </Card>
            </div>
          ) : (
            <Card className="p-20 text-center rounded-3xl border-dashed border-2">
              <p className="text-sm text-muted-foreground">Select a question to begin practice.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
