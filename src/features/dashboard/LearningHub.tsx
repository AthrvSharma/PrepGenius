import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Card } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
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
} from 'lucide-react'

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

export function LearningHub() {
  const [subjects, setSubjects] = useState<LearningSubject[]>([])
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [completedTopics, setCompletedTopics] = useState<Set<string>>(new Set())

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
    window.localStorage.setItem(COMPLETED_KEY, JSON.stringify(Array.from(completedTopics)))
  }, [completedTopics])

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
