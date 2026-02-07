import React, { useEffect, useMemo, useState } from 'react'
import { Card } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { blink } from '../../lib/blink'
import { normalizeTags, sanitizeText } from '../../lib/validation'
import { useBlinkAuth } from '@blinkdotnew/react'
import {
  ShieldCheck,
  Users,
  ChartBar,
  AlertTriangle,
  Wrench,
  Save,
  Trash2,
  Pencil,
} from 'lucide-react'

const domains = ['Java', 'DSA', 'OS', 'DBMS', 'CN', 'Web', 'System Design', 'Behavioral', 'Product', 'Data Science', 'Backend']
const difficulties = ['easy', 'medium', 'hard']
const types = ['theory', 'coding', 'system', 'behavioral']

const defaultWeights = {
  correctness: 40,
  conceptCoverage: 25,
  clarity: 15,
  depth: 10,
  communication: 10,
}

export function AdminConsole() {
  const { user } = useBlinkAuth()
  const [questionBank, setQuestionBank] = useState<any[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<any>(null)
  const [form, setForm] = useState<any>({
    domain: 'Java',
    difficulty: 'easy',
    tags: '',
    timeEstimateMin: 10,
    type: 'theory',
    prompt: '',
    expectedConcepts: '',
    keyPoints: '',
    commonMistakes: '',
    edgeCases: '',
    idealAnswer: '',
    explanation: '',
    weights: defaultWeights,
  })

  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    const load = async () => {
      const [questions, sessions, reports, interviewQuestions, careerPaths] = await Promise.all([
        blink.db.questionBank.list(),
        blink.db.interviewSessions.list(),
        blink.db.feedbackReports.list(),
        blink.db.interviewQuestions.list(),
        blink.db.careerPaths.list(),
      ])

      setQuestionBank(questions)

      const uniqueUsers = new Set(sessions.map((session: any) => session.userId))
      const activeSessions = sessions.filter((session: any) => session.status === 'in_progress')

      const domainMap: Record<string, number[]> = {}
      reports.forEach((report: any) => {
        const session = sessions.find((item: any) => item.id === report.sessionId)
        const careerPath = careerPaths.find((path: any) => path.id === session?.careerPathId)
        const domain = careerPath?.domain || 'General'
        if (!domainMap[domain]) domainMap[domain] = []
        domainMap[domain].push(report.score || 0)
      })

      const domainAverages = Object.entries(domainMap).map(([domain, scores]) => ({
        domain,
        average: Math.round(scores.reduce((acc, score) => acc + score, 0) / scores.length),
      }))

      const questionScores: Record<string, number[]> = {}
      interviewQuestions.forEach((question: any) => {
        if (!question.questionId || !question.scoreBreakdown) return
        if (!questionScores[question.questionId]) questionScores[question.questionId] = []
        questionScores[question.questionId].push(question.scoreBreakdown.total || 0)
      })

      const weakQuestions = Object.entries(questionScores)
        .map(([questionId, scores]) => ({
          questionId,
          average: Math.round(scores.reduce((acc, score) => acc + score, 0) / scores.length),
        }))
        .sort((a, b) => a.average - b.average)
        .slice(0, 3)
        .map((entry) => {
          const question = questions.find((item: any) => item.id === entry.questionId)
          return {
            ...entry,
            prompt: question?.prompt || entry.questionId,
          }
        })

      const aiStats = blink.ai.getStats()

      setMetrics({
        totalInterviews: sessions.length,
        activeUsers: uniqueUsers.size,
        activeSessions: activeSessions.length,
        domainAverages,
        weakQuestions,
        aiStats,
      })
    }
    load()
  }, [])

  const resetForm = () => {
    setForm({
      domain: 'Java',
      difficulty: 'easy',
      tags: '',
      timeEstimateMin: 10,
      type: 'theory',
      prompt: '',
      expectedConcepts: '',
      keyPoints: '',
      commonMistakes: '',
      edgeCases: '',
      idealAnswer: '',
      explanation: '',
      weights: defaultWeights,
    })
    setEditingId(null)
  }

  const handleSave = async () => {
    const payload = {
      domain: form.domain,
      difficulty: form.difficulty,
      tags: normalizeTags(form.tags),
      timeEstimateMin: Number(form.timeEstimateMin) || 10,
      type: form.type,
      prompt: sanitizeText(form.prompt),
      rubric: {
        expectedConcepts: normalizeTags(form.expectedConcepts),
        keyPoints: normalizeTags(form.keyPoints),
        commonMistakes: normalizeTags(form.commonMistakes),
        edgeCases: normalizeTags(form.edgeCases),
        scoringWeights: form.weights,
        idealAnswer: sanitizeText(form.idealAnswer),
        explanation: sanitizeText(form.explanation),
      },
    }

    if (!payload.prompt) return

    if (editingId) {
      const updated = await blink.db.questionBank.update(editingId, payload)
      setQuestionBank((prev) => prev.map((item) => (item.id === editingId ? updated : item)))
    } else {
      const created = await blink.db.questionBank.create({
        id: `qb_${Date.now()}`,
        ...payload,
      })
      setQuestionBank((prev) => [created, ...prev])
    }
    resetForm()
  }

  const handleEdit = (question: any) => {
    setEditingId(question.id)
    setForm({
      domain: question.domain,
      difficulty: question.difficulty,
      tags: (question.tags || []).join(', '),
      timeEstimateMin: question.timeEstimateMin,
      type: question.type,
      prompt: question.prompt,
      expectedConcepts: (question.rubric?.expectedConcepts || []).join(', '),
      keyPoints: (question.rubric?.keyPoints || []).join(', '),
      commonMistakes: (question.rubric?.commonMistakes || []).join(', '),
      edgeCases: (question.rubric?.edgeCases || []).join(', '),
      idealAnswer: question.rubric?.idealAnswer || '',
      explanation: question.rubric?.explanation || '',
      weights: question.rubric?.scoringWeights || defaultWeights,
    })
  }

  const handleDelete = async (id: string) => {
    await blink.db.questionBank.delete(id)
    setQuestionBank((prev) => prev.filter((item) => item.id !== id))
  }

  const sortedQuestions = useMemo(() => {
    return [...questionBank].sort((a, b) => a.domain.localeCompare(b.domain))
  }, [questionBank])

  if (!isAdmin) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <Card className="p-8 rounded-3xl text-center">
          <ShieldCheck className="w-10 h-10 text-primary mx-auto mb-4" />
          <h2 className="text-xl font-bold">Admin access required</h2>
          <p className="text-sm text-muted-foreground">This area is restricted to admin users.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Console</h1>
        <p className="text-muted-foreground">Manage question bank and monitor system health.</p>
      </div>

      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-6 rounded-3xl border-border/40 space-y-3">
            <Users className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Active Users</p>
              <p className="text-2xl font-bold">{metrics.activeUsers}</p>
            </div>
          </Card>
          <Card className="p-6 rounded-3xl border-border/40 space-y-3">
            <ChartBar className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Total Interviews</p>
              <p className="text-2xl font-bold">{metrics.totalInterviews}</p>
            </div>
          </Card>
          <Card className="p-6 rounded-3xl border-border/40 space-y-3">
            <AlertTriangle className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Active Sessions</p>
              <p className="text-2xl font-bold">{metrics.activeSessions}</p>
            </div>
          </Card>
          <Card className="p-6 rounded-3xl border-border/40 space-y-3">
            <Wrench className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">AI Latency</p>
              <p className="text-2xl font-bold">{metrics.aiStats.avgLatencyMs}ms</p>
            </div>
          </Card>
        </div>
      )}

      {metrics && (
        <Card className="p-6 rounded-3xl border-border/40 space-y-4">
          <h2 className="text-lg font-bold">Domain Performance</h2>
          <div className="flex flex-wrap gap-2">
            {metrics.domainAverages.map((domain: any) => (
              <Badge key={domain.domain} variant="outline" className="rounded-full px-3 py-1">
                {domain.domain}: {domain.average}%
              </Badge>
            ))}
          </div>
          <div>
            <h3 className="text-sm font-bold mb-2">Questions users struggle with</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              {metrics.weakQuestions.map((question: any) => (
                <li key={question.questionId}>• {question.prompt} ({question.average}%)</li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <Card className="p-8 rounded-3xl border-border/40 space-y-6">
        <h2 className="text-xl font-bold">Question Bank Manager</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold">Domain</label>
              <select
                className="w-full mt-1 h-10 rounded-xl border border-border/40 bg-background px-3 text-sm"
                value={form.domain}
                onChange={(e) => setForm({ ...form, domain: e.target.value })}
              >
                {domains.map((domain) => (
                  <option key={domain} value={domain}>{domain}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold">Difficulty</label>
              <select
                className="w-full mt-1 h-10 rounded-xl border border-border/40 bg-background px-3 text-sm"
                value={form.difficulty}
                onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
              >
                {difficulties.map((difficulty) => (
                  <option key={difficulty} value={difficulty}>{difficulty}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold">Type</label>
              <select
                className="w-full mt-1 h-10 rounded-xl border border-border/40 bg-background px-3 text-sm"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                {types.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold">Tags (comma-separated)</label>
              <input
                className="w-full mt-1 h-10 rounded-xl border border-border/40 bg-background px-3 text-sm"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold">Time Estimate (mins)</label>
              <input
                type="number"
                className="w-full mt-1 h-10 rounded-xl border border-border/40 bg-background px-3 text-sm"
                value={form.timeEstimateMin}
                onChange={(e) => setForm({ ...form, timeEstimateMin: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold">Prompt</label>
              <textarea
                className="w-full mt-1 min-h-[120px] rounded-xl border border-border/40 bg-background px-3 py-2 text-sm"
                value={form.prompt}
                onChange={(e) => setForm({ ...form, prompt: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold">Expected Concepts</label>
              <textarea
                className="w-full mt-1 min-h-[80px] rounded-xl border border-border/40 bg-background px-3 py-2 text-sm"
                value={form.expectedConcepts}
                onChange={(e) => setForm({ ...form, expectedConcepts: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold">Key Points</label>
              <textarea
                className="w-full mt-1 min-h-[80px] rounded-xl border border-border/40 bg-background px-3 py-2 text-sm"
                value={form.keyPoints}
                onChange={(e) => setForm({ ...form, keyPoints: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold">Common Mistakes</label>
              <textarea
                className="w-full mt-1 min-h-[80px] rounded-xl border border-border/40 bg-background px-3 py-2 text-sm"
                value={form.commonMistakes}
                onChange={(e) => setForm({ ...form, commonMistakes: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold">Edge Cases</label>
              <textarea
                className="w-full mt-1 min-h-[80px] rounded-xl border border-border/40 bg-background px-3 py-2 text-sm"
                value={form.edgeCases}
                onChange={(e) => setForm({ ...form, edgeCases: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold">Ideal Answer</label>
              <textarea
                className="w-full mt-1 min-h-[80px] rounded-xl border border-border/40 bg-background px-3 py-2 text-sm"
                value={form.idealAnswer}
                onChange={(e) => setForm({ ...form, idealAnswer: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold">Explanation</label>
              <textarea
                className="w-full mt-1 min-h-[80px] rounded-xl border border-border/40 bg-background px-3 py-2 text-sm"
                value={form.explanation}
                onChange={(e) => setForm({ ...form, explanation: e.target.value })}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 justify-end">
          <Button variant="outline" onClick={resetForm}>Reset</Button>
          <Button onClick={handleSave} className="gap-2">
            <Save className="w-4 h-4" />
            {editingId ? 'Update Question' : 'Add Question'}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4">
        {sortedQuestions.map((question) => (
          <Card key={question.id} className="p-5 rounded-3xl border-border/40 flex flex-col md:flex-row md:items-center gap-4 justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{question.domain}</Badge>
                <Badge variant="outline">{question.difficulty}</Badge>
                <Badge variant="outline">{question.type}</Badge>
              </div>
              <p className="font-semibold">{question.prompt}</p>
              <p className="text-xs text-muted-foreground">Tags: {(question.tags || []).join(', ') || 'None'}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleEdit(question)} className="gap-2">
                <Pencil className="w-4 h-4" />
                Edit
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleDelete(question.id)} className="gap-2 text-destructive">
                <Trash2 className="w-4 h-4" />
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
