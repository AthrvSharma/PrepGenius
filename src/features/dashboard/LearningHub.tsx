import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Card } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { Badge } from '../../components/ui/badge'
import { blink } from '../../lib/blink'
import {
  BookOpen,
  Search,
  Layers,
  ArrowRight,
  Sparkles,
  ListChecks,
  Compass,
  CheckCircle2,
  ChevronLeft,
  GraduationCap,
  Bot,
  MessageSquareQuote,
  Loader2,
  ShieldAlert,
  Lightbulb,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface LearningTopic {
  id: string
  title: string
  definition?: string
  explanation?: string
  examples?: Array<{ input: string; output: string; explanation?: string }>
  diagrams?: Array<{ type?: string; url?: string; content?: string }>
  complexity?: { time?: string; space?: string } | string | null
  commonMistakes?: string[]
  practiceQuestions?: string[]
}

interface LearningSubject {
  id: string
  name: string
  topics: LearningTopic[]
}

const COMPLETED_KEY = 'prepgenius.learning.completed'
const AI_EXPANSION_CACHE_KEY = 'prepgenius.learning.ai.expansions'

interface AiFlashcard {
  front: string
  back: string
}

interface AiQuizQuestion {
  question: string
  expectedPoints?: string[]
  difficulty?: string
}

interface TopicAiExpansion {
  title?: string
  summary?: string
  keyIdeas?: string[]
  realWorldUseCases?: string[]
  pitfalls?: string[]
  memoryTips?: string[]
  flashcards?: AiFlashcard[]
  quiz?: AiQuizQuestion[]
  challenge?: string
  nextTopics?: string[]
  fallbackQuestion?: string
}

interface TopicAnswerReview {
  score?: number
  verdict?: string
  feedback?: string
  strengths?: string[]
  improvements?: string[]
  missingPoints?: string[]
  modelAnswer?: string
  nextStep?: string
  isInvalid?: boolean
  invalidReason?: string
}

export function LearningHub() {
  const [subjects, setSubjects] = useState<LearningSubject[]>([])
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [completedTopics, setCompletedTopics] = useState<Set<string>>(new Set())
  const [aiExpansionCache, setAiExpansionCache] = useState<Record<string, TopicAiExpansion>>({})
  const [isExpandingTopic, setIsExpandingTopic] = useState(false)
  const [activeQuizIndex, setActiveQuizIndex] = useState(0)
  const [practiceAnswer, setPracticeAnswer] = useState('')
  const [isReviewingAnswer, setIsReviewingAnswer] = useState(false)
  const [answerReview, setAnswerReview] = useState<TopicAnswerReview | null>(null)

  useEffect(() => {
    const fetchSubjects = async () => {
      const data = await blink.db.learningSubjects.list()
      setSubjects(data as LearningSubject[])
    }
    fetchSubjects()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(COMPLETED_KEY)
    if (!stored) return
    try {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        setCompletedTopics(new Set(parsed))
      }
    } catch (error) {
      console.error('Failed to parse learning progress', error)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(AI_EXPANSION_CACHE_KEY)
    if (!stored) return
    try {
      const parsed = JSON.parse(stored)
      if (parsed && typeof parsed === 'object') {
        setAiExpansionCache(parsed as Record<string, TopicAiExpansion>)
      }
    } catch (error) {
      console.error('Failed to parse AI topic cache', error)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(COMPLETED_KEY, JSON.stringify(Array.from(completedTopics)))
  }, [completedTopics])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(AI_EXPANSION_CACHE_KEY, JSON.stringify(aiExpansionCache))
  }, [aiExpansionCache])

  const sortedSubjects = useMemo(() => {
    return [...subjects].sort((a, b) => a.name.localeCompare(b.name))
  }, [subjects])

  const selectedSubject = useMemo(() => {
    return subjects.find((subject) => subject.id === selectedSubjectId) || null
  }, [subjects, selectedSubjectId])

  useEffect(() => {
    if (!selectedSubject) return
    if (!selectedTopicId || !selectedSubject.topics.some((topic) => topic.id === selectedTopicId)) {
      setSelectedTopicId(selectedSubject.topics?.[0]?.id || null)
    }
  }, [selectedSubject, selectedTopicId])

  const selectedTopic = useMemo(() => {
    if (!selectedSubject) return null
    return selectedSubject.topics.find((topic) => topic.id === selectedTopicId) || null
  }, [selectedSubject, selectedTopicId])

  const selectedTopicExpansion = useMemo(() => {
    if (!selectedTopic) return null
    return aiExpansionCache[selectedTopic.id] || null
  }, [aiExpansionCache, selectedTopic])

  const activeQuizQuestion = useMemo(() => {
    const quiz = selectedTopicExpansion?.quiz || []
    if (!quiz.length) return null
    return quiz[Math.max(0, Math.min(activeQuizIndex, quiz.length - 1))]
  }, [activeQuizIndex, selectedTopicExpansion])

  useEffect(() => {
    setActiveQuizIndex(0)
    setPracticeAnswer('')
    setAnswerReview(null)
  }, [selectedTopicId, selectedSubjectId])

  const searchResults = useMemo(() => {
    if (!query.trim()) return [] as Array<{ subject: LearningSubject; topic: LearningTopic }>
    const q = query.trim().toLowerCase()
    const results: Array<{ subject: LearningSubject; topic: LearningTopic }> = []
    subjects.forEach((subject) => {
      subject.topics.forEach((topic) => {
        if (
          subject.name.toLowerCase().includes(q) ||
          topic.title.toLowerCase().includes(q) ||
          (topic.definition || '').toLowerCase().includes(q) ||
          (topic.explanation || '').toLowerCase().includes(q)
        ) {
          results.push({ subject, topic })
        }
      })
    })
    return results.slice(0, 60)
  }, [subjects, query])

  const totalTopics = useMemo(() => {
    return subjects.reduce((sum, subject) => sum + (subject.topics?.length || 0), 0)
  }, [subjects])

  const progressBySubject = useMemo(() => {
    const progress = new Map<string, { total: number; completed: number; percent: number }>()
    subjects.forEach((subject) => {
      const total = subject.topics?.length || 0
      const completed = subject.topics.filter((topic) => completedTopics.has(topic.id)).length
      const percent = total ? Math.round((completed / total) * 100) : 0
      progress.set(subject.id, { total, completed, percent })
    })
    return progress
  }, [subjects, completedTopics])

  const markTopic = (topicId: string) => {
    setCompletedTopics((prev) => {
      const next = new Set(prev)
      if (next.has(topicId)) {
        next.delete(topicId)
      } else {
        next.add(topicId)
      }
      return next
    })
  }

  const readableError = (error: unknown) => {
    if (!(error instanceof Error)) return 'Something went wrong. Please try again.'
    const message = error.message || ''
    try {
      const parsed = JSON.parse(message)
      if (typeof parsed?.error === 'string' && parsed.error.trim()) {
        return parsed.error.trim()
      }
    } catch {
      // Use raw error text
    }
    return message || 'Something went wrong. Please try again.'
  }

  const generateAiExpansion = async (forceRefresh = false) => {
    if (!selectedSubject || !selectedTopic) return
    if (!forceRefresh && aiExpansionCache[selectedTopic.id]) {
      toast.success('AI deep dive already available for this topic.')
      return
    }
    setIsExpandingTopic(true)
    try {
      const { object } = await blink.ai.generateObject({
        prompt: `LEARNING_TOPIC_EXPANSION\nPAYLOAD:${JSON.stringify({
          action: 'learningTopicExpansion',
          subjectName: selectedSubject.name,
          topicTitle: selectedTopic.title,
          topic: selectedTopic,
        })}`,
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            summary: { type: 'string' },
            keyIdeas: { type: 'array', items: { type: 'string' } },
            realWorldUseCases: { type: 'array', items: { type: 'string' } },
            pitfalls: { type: 'array', items: { type: 'string' } },
            memoryTips: { type: 'array', items: { type: 'string' } },
            flashcards: { type: 'array', items: { type: 'object' } },
            quiz: { type: 'array', items: { type: 'object' } },
            challenge: { type: 'string' },
            nextTopics: { type: 'array', items: { type: 'string' } },
            fallbackQuestion: { type: 'string' },
          },
        },
      })

      setAiExpansionCache((prev) => ({
        ...prev,
        [selectedTopic.id]: (object || {}) as TopicAiExpansion,
      }))
      setActiveQuizIndex(0)
      setPracticeAnswer('')
      setAnswerReview(null)
      toast.success('AI deep dive generated for this topic.')
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setIsExpandingTopic(false)
    }
  }

  const reviewAnswerWithAi = async () => {
    if (!selectedTopic || !activeQuizQuestion) return
    if (!practiceAnswer.trim()) {
      toast.error('Please write your answer before submitting for review.')
      return
    }
    setIsReviewingAnswer(true)
    try {
      const { object } = await blink.ai.generateObject({
        prompt: `LEARNING_ANSWER_REVIEW\nPAYLOAD:${JSON.stringify({
          action: 'learningAnswerReview',
          topicTitle: selectedTopic.title,
          topic: selectedTopic,
          question: activeQuizQuestion.question,
          expectedPoints: activeQuizQuestion.expectedPoints || [],
          answer: practiceAnswer,
        })}`,
        schema: {
          type: 'object',
          properties: {
            score: { type: 'number' },
            verdict: { type: 'string' },
            feedback: { type: 'string' },
            strengths: { type: 'array', items: { type: 'string' } },
            improvements: { type: 'array', items: { type: 'string' } },
            missingPoints: { type: 'array', items: { type: 'string' } },
            modelAnswer: { type: 'string' },
            nextStep: { type: 'string' },
            isInvalid: { type: 'boolean' },
            invalidReason: { type: 'string' },
          },
        },
      })
      const review = (object || {}) as TopicAnswerReview
      setAnswerReview(review)
      if (review.isInvalid && review.invalidReason) {
        toast.error(review.invalidReason)
      } else {
        toast.success('AI evaluation completed.')
      }
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setIsReviewingAnswer(false)
    }
  }

  return (
    <div className="relative p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.08),transparent_45%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.08),transparent_40%),linear-gradient(180deg,_rgba(15,23,42,0.02),transparent_40%)]" />

      <Card className="p-8 rounded-[32px] border-border/50 bg-background/80 backdrop-blur shadow-sm glass-card">
        <div className="flex flex-col xl:flex-row xl:items-center gap-6 justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              <Sparkles className="w-4 h-4 text-primary" />
              Learning Hub
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Your personal knowledge library</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Explore curated subjects, drill into topics, and track what you have mastered along the way.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2 rounded-2xl border border-border/40 bg-background px-4 py-2 w-full sm:w-80 shadow-sm">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search topics, definitions, or subjects"
                className="border-none bg-transparent p-0 focus-visible:ring-0"
              />
            </div>
            <div className="flex items-center gap-3">
              <Card className="px-4 py-3 rounded-2xl border-border/40 bg-secondary/20 text-center min-w-[110px] glass-card">
                <p className="text-xs text-muted-foreground">Subjects</p>
                <p className="text-lg font-bold">{subjects.length}</p>
              </Card>
              <Card className="px-4 py-3 rounded-2xl border-border/40 bg-secondary/20 text-center min-w-[110px] glass-card">
                <p className="text-xs text-muted-foreground">Topics</p>
                <p className="text-lg font-bold">{totalTopics}</p>
              </Card>
              <Card className="px-4 py-3 rounded-2xl border-border/40 bg-secondary/20 text-center min-w-[110px] glass-card">
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-lg font-bold">{completedTopics.size}</p>
              </Card>
            </div>
          </div>
        </div>
      </Card>

      {query.trim() ? (
        <Card className="p-6 rounded-[28px] border-border/40 shadow-sm bg-background/80">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Search Results</h2>
            <Badge variant="secondary">{searchResults.length} matches</Badge>
          </div>
          {searchResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">No topics matched your search.</p>
          ) : (
            <div className="space-y-3">
              {searchResults.map((result) => (
                <button
                  key={`${result.subject.id}-${result.topic.id}`}
                  className="w-full text-left p-4 rounded-2xl border border-border/40 hover:border-primary/30 hover:bg-secondary/20 transition-all group"
                  onClick={() => {
                    setSelectedSubjectId(result.subject.id)
                    setSelectedTopicId(result.topic.id)
                    setQuery('')
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold group-hover:text-primary transition-colors">{result.topic.title}</p>
                      <p className="text-xs text-muted-foreground">{result.subject.name}</p>
                      {result.topic.definition && (
                        <p className="text-xs text-muted-foreground">{result.topic.definition}</p>
                      )}
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      ) : selectedSubject ? (
        <div className="space-y-6">
          <Card className="p-6 rounded-[28px] border-border/40 shadow-sm bg-background/80 glass-card">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => {
                    setSelectedSubjectId(null)
                    setSelectedTopicId(null)
                  }}
                >
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  All Subjects
                </Button>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Subject</p>
                  <h2 className="text-2xl font-bold mt-1">{selectedSubject.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {progressBySubject.get(selectedSubject.id)?.completed || 0}/{progressBySubject.get(selectedSubject.id)?.total || 0}{' '}
                    topics completed
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Card className="px-4 py-3 rounded-2xl border-border/40 bg-secondary/20 text-center min-w-[140px] glass-card">
                  <p className="text-xs text-muted-foreground">Topics</p>
                  <p className="text-lg font-bold">{progressBySubject.get(selectedSubject.id)?.total || 0}</p>
                </Card>
                <Card className="px-4 py-3 rounded-2xl border-border/40 bg-secondary/20 text-center min-w-[140px] glass-card">
                  <p className="text-xs text-muted-foreground">Completion</p>
                  <p className="text-lg font-bold">{progressBySubject.get(selectedSubject.id)?.percent || 0}%</p>
                </Card>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-[320px,1fr] gap-6">
            <Card className="p-5 rounded-[28px] border-border/40 shadow-sm bg-background/80 space-y-4 glass-card">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Layers className="w-4 h-4 text-primary" />
                Topics
              </div>
              <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1 custom-scrollbar">
                {(selectedSubject?.topics || []).map((topic, idx) => (
                  <motion.button
                    key={topic.id}
                    onClick={() => setSelectedTopicId(topic.id)}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: 'easeOut', delay: idx * 0.02 }}
                    className={`w-full text-left px-3 py-3 rounded-2xl transition-all border ${
                      selectedTopic?.id === topic.id
                        ? 'border-primary/40 bg-secondary/30 shadow-sm'
                        : 'border-transparent hover:bg-secondary/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{topic.title}</p>
                        <p className="text-xs text-muted-foreground">Topic {idx + 1}</p>
                      </div>
                      {completedTopics.has(topic.id) ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <span className="text-xs text-muted-foreground">{idx + 1}</span>
                      )}
                    </div>
                  </motion.button>
                ))}
              </div>
            </Card>

            <Card className="p-7 rounded-[28px] border-border/40 shadow-sm bg-background/80 space-y-6 glass-card">
              {selectedTopic ? (
                <>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-2xl font-bold">{selectedTopic.title}</h2>
                        <p className="text-sm text-muted-foreground">{selectedSubject?.name}</p>
                      </div>
                      <Button
                        variant={completedTopics.has(selectedTopic.id) ? 'secondary' : 'default'}
                        className="rounded-full"
                        onClick={() => markTopic(selectedTopic.id)}
                      >
                        {completedTopics.has(selectedTopic.id) ? 'Marked as learned' : 'Mark as learned'}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedTopic.complexity && (
                        typeof selectedTopic.complexity === 'string' ? (
                          <Badge variant="secondary">{selectedTopic.complexity}</Badge>
                        ) : (
                          <>
                            <Badge variant="secondary">Time: {selectedTopic.complexity.time || 'N/A'}</Badge>
                            <Badge variant="secondary">Space: {selectedTopic.complexity.space || 'N/A'}</Badge>
                          </>
                        )
                      )}
                      {selectedTopic.practiceQuestions?.length ? (
                        <Badge variant="secondary">{selectedTopic.practiceQuestions.length} practice prompts</Badge>
                      ) : null}
                      {selectedTopic.examples?.length ? (
                        <Badge variant="secondary">{selectedTopic.examples.length} examples</Badge>
                      ) : null}
                    </div>
                  </div>

                  {selectedTopic.definition && (
                    <div>
                      <h3 className="text-sm font-bold">Definition</h3>
                      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{selectedTopic.definition}</p>
                    </div>
                  )}

                  {selectedTopic.explanation && (
                    <div>
                      <h3 className="text-sm font-bold">Explanation</h3>
                      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{selectedTopic.explanation}</p>
                    </div>
                  )}

                  {selectedTopic.examples?.length ? (
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold">Examples</h3>
                      <div className="grid gap-3 md:grid-cols-2">
                        {selectedTopic.examples.map((example, index) => (
                          <div key={index} className="p-4 rounded-2xl bg-secondary/30 border border-border/20 text-sm">
                            <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Example {index + 1}</p>
                            <p className="text-xs text-muted-foreground">Input: {example.input}</p>
                            <p className="text-xs text-muted-foreground">Output: {example.output}</p>
                            {example.explanation && <p className="text-xs text-muted-foreground">{example.explanation}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {selectedTopic.diagrams?.length ? (
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold">Diagrams</h3>
                      <div className="grid gap-3 md:grid-cols-2">
                        {selectedTopic.diagrams.map((diagram, index) => (
                          <div key={index} className="p-4 rounded-2xl bg-secondary/20 border border-border/20">
                            {diagram.url ? (
                              <img src={diagram.url} alt="diagram" className="w-full rounded-xl" />
                            ) : (
                              <pre className="text-xs text-muted-foreground whitespace-pre-wrap">{diagram.content}</pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    {selectedTopic.commonMistakes?.length ? (
                      <div className="p-4 rounded-2xl border border-border/20 bg-secondary/20">
                        <h3 className="text-sm font-bold flex items-center gap-2">
                          <ListChecks className="w-4 h-4 text-primary" />
                          Common Mistakes
                        </h3>
                        <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                          {selectedTopic.commonMistakes.map((mistake, index) => (
                            <li key={index}>- {mistake}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {selectedTopic.practiceQuestions?.length ? (
                      <div className="p-4 rounded-2xl border border-border/20 bg-secondary/20">
                        <h3 className="text-sm font-bold flex items-center gap-2">
                          <Compass className="w-4 h-4 text-primary" />
                          Practice Questions
                        </h3>
                        <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                          {selectedTopic.practiceQuestions.map((question, index) => (
                            <li key={index}>- {question}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>

                  <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5 space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold flex items-center gap-2">
                          <Bot className="w-4 h-4 text-primary" />
                          AI Deep Dive
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          Generate richer notes, flashcards, and interactive quiz feedback for this topic.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="rounded-full"
                        onClick={() => generateAiExpansion(Boolean(selectedTopicExpansion))}
                        disabled={isExpandingTopic}
                      >
                        {isExpandingTopic ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : selectedTopicExpansion ? 'Refresh AI Deep Dive' : 'Generate AI Deep Dive'}
                      </Button>
                    </div>

                    {selectedTopicExpansion ? (
                      <div className="space-y-5">
                        {selectedTopicExpansion.summary ? (
                          <div>
                            <h4 className="text-xs uppercase tracking-wider font-bold text-muted-foreground">AI Summary</h4>
                            <p className="text-sm mt-2 leading-relaxed">{selectedTopicExpansion.summary}</p>
                          </div>
                        ) : null}

                        <div className="grid gap-4 md:grid-cols-2">
                          {selectedTopicExpansion.keyIdeas?.length ? (
                            <div className="p-4 rounded-2xl border border-border/30 bg-background/70">
                              <h4 className="text-sm font-semibold">Key Ideas</h4>
                              <ul className="mt-2 text-sm text-muted-foreground space-y-1">
                                {selectedTopicExpansion.keyIdeas.map((idea, index) => (
                                  <li key={index}>- {idea}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {selectedTopicExpansion.realWorldUseCases?.length ? (
                            <div className="p-4 rounded-2xl border border-border/30 bg-background/70">
                              <h4 className="text-sm font-semibold">Real-world Use Cases</h4>
                              <ul className="mt-2 text-sm text-muted-foreground space-y-1">
                                {selectedTopicExpansion.realWorldUseCases.map((item, index) => (
                                  <li key={index}>- {item}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>

                        {selectedTopicExpansion.memoryTips?.length ? (
                          <div className="p-4 rounded-2xl border border-border/30 bg-background/70">
                            <h4 className="text-sm font-semibold flex items-center gap-2">
                              <Lightbulb className="w-4 h-4 text-primary" />
                              Memory Tips
                            </h4>
                            <ul className="mt-2 text-sm text-muted-foreground space-y-1">
                              {selectedTopicExpansion.memoryTips.map((item, index) => (
                                <li key={index}>- {item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {selectedTopicExpansion.flashcards?.length ? (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold">Flashcards</h4>
                            <div className="grid gap-3 md:grid-cols-2">
                              {selectedTopicExpansion.flashcards.slice(0, 4).map((card, index) => (
                                <div key={index} className="p-4 rounded-2xl border border-border/30 bg-background/70">
                                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Q</p>
                                  <p className="text-sm mt-1">{card.front}</p>
                                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold mt-3">A</p>
                                  <p className="text-sm mt-1 text-muted-foreground">{card.back}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {activeQuizQuestion ? (
                          <div className="p-4 rounded-2xl border border-border/30 bg-background/80 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="text-sm font-semibold flex items-center gap-2">
                                <MessageSquareQuote className="w-4 h-4 text-primary" />
                                AI Practice Review
                              </h4>
                              <Badge variant="secondary">
                                Question {activeQuizIndex + 1}/{selectedTopicExpansion.quiz?.length || 1}
                              </Badge>
                            </div>
                            <p className="text-sm">{activeQuizQuestion.question}</p>
                            {activeQuizQuestion.expectedPoints?.length ? (
                              <div className="flex flex-wrap gap-2">
                                {activeQuizQuestion.expectedPoints.map((point, index) => (
                                  <Badge key={index} variant="secondary">{point}</Badge>
                                ))}
                              </div>
                            ) : null}
                            <Textarea
                              value={practiceAnswer}
                              onChange={(event) => setPracticeAnswer(event.target.value)}
                              placeholder="Write your answer. AI will score it and suggest improvements."
                              className="min-h-[120px] rounded-2xl"
                            />
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" onClick={reviewAnswerWithAi} disabled={isReviewingAnswer}>
                                {isReviewingAnswer ? (
                                  <>
                                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                                    Evaluating...
                                  </>
                                ) : 'Evaluate with AI'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={activeQuizIndex <= 0}
                                onClick={() => {
                                  setActiveQuizIndex((prev) => Math.max(0, prev - 1))
                                  setAnswerReview(null)
                                  setPracticeAnswer('')
                                }}
                              >
                                Previous
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={activeQuizIndex >= (selectedTopicExpansion.quiz?.length || 1) - 1}
                                onClick={() => {
                                  setActiveQuizIndex((prev) => prev + 1)
                                  setAnswerReview(null)
                                  setPracticeAnswer('')
                                }}
                              >
                                Next
                              </Button>
                            </div>

                            {answerReview ? (
                              <div
                                className={`rounded-2xl border p-4 text-sm space-y-2 ${
                                  answerReview.isInvalid
                                    ? 'border-amber-400/40 bg-amber-500/10'
                                    : 'border-border/30 bg-secondary/20'
                                }`}
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="secondary">Score {answerReview.score ?? 0}%</Badge>
                                  {answerReview.verdict ? <Badge variant="secondary">{answerReview.verdict}</Badge> : null}
                                  {answerReview.isInvalid ? (
                                    <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                                      <ShieldAlert className="w-4 h-4" />
                                      Invalid answer
                                    </span>
                                  ) : null}
                                </div>
                                {answerReview.feedback ? <p>{answerReview.feedback}</p> : null}
                                {answerReview.improvements?.length ? (
                                  <p className="text-muted-foreground">Improve: {answerReview.improvements.join(', ')}</p>
                                ) : null}
                                {answerReview.missingPoints?.length ? (
                                  <p className="text-muted-foreground">Missing points: {answerReview.missingPoints.join(', ')}</p>
                                ) : null}
                                {answerReview.modelAnswer ? (
                                  <p className="text-muted-foreground">Model answer: {answerReview.modelAnswer}</p>
                                ) : null}
                                {answerReview.invalidReason ? (
                                  <p className="text-amber-700 font-medium">{answerReview.invalidReason}</p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Generate AI Deep Dive to unlock richer notes, flashcards, and answer-level evaluation for this topic.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Select a topic to view content.</p>
              )}
            </Card>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="p-6 rounded-[28px] border-border/40 shadow-sm bg-background/80 glass-card">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  <GraduationCap className="w-4 h-4 text-primary" />
                  Subject Catalog
                </div>
                <h2 className="text-2xl font-bold">Start with a subject, then dive deep</h2>
                <p className="text-sm text-muted-foreground max-w-xl">
                  Pick a subject to see the full topic list, explanations, examples, and practice prompts.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Card className="px-4 py-3 rounded-2xl border-border/40 bg-secondary/20 text-center min-w-[140px] glass-card">
                  <p className="text-xs text-muted-foreground">Mastered</p>
                  <p className="text-lg font-bold">{completedTopics.size}</p>
                </Card>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sortedSubjects.map((subject, idx) => {
              const progress = progressBySubject.get(subject.id)
              const sampleTopics = subject.topics.slice(0, 4)
              return (
                <motion.button
                  key={subject.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: 'easeOut', delay: idx * 0.03 }}
                  className="text-left p-6 rounded-3xl border border-border/40 bg-background/80 shadow-sm hover:border-primary/40 hover:shadow-md transition-all glass-card"
                  onClick={() => {
                    setSelectedSubjectId(subject.id)
                    setSelectedTopicId(subject.topics?.[0]?.id || null)
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <BookOpen className="w-4 h-4 text-primary" />
                        {subject.name}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">{progress?.total || 0} topics</p>
                    </div>
                    <Badge variant="secondary">{progress?.percent || 0}%</Badge>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {sampleTopics.map((topic) => (
                      <span key={topic.id} className="px-2.5 py-1 rounded-full bg-secondary/30 text-[11px] text-muted-foreground">
                        {topic.title}
                      </span>
                    ))}
                    {subject.topics.length > sampleTopics.length && (
                      <span className="px-2.5 py-1 rounded-full bg-secondary/30 text-[11px] text-muted-foreground">
                        +{subject.topics.length - sampleTopics.length} more
                      </span>
                    )}
                  </div>

                  <div className="mt-4">
                    <div className="h-2 rounded-full bg-secondary/30 overflow-hidden">
                      <div
                        className="h-full bg-primary/80"
                        style={{ width: `${progress?.percent || 0}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {progress?.completed || 0} completed
                    </p>
                  </div>

                  <div className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-primary">
                    Explore subject
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </motion.button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
