import React, { useState, useEffect } from 'react'
import { Card } from '../../components/ui/card'
import { useProfile } from '../../hooks/useProfile'
import { blink } from '../../lib/blink'
import {
  TrendingUp,
  Target,
  Zap,
  BarChart,
  Activity,
} from 'lucide-react'

interface DomainScore {
  domain: string
  average: number
}

export function SkillAnalytics() {
  const { profile } = useProfile()
  const [data, setData] = useState<any[]>([])
  const [domainScores, setDomainScores] = useState<DomainScore[]>([])
  const [topStrengths, setTopStrengths] = useState<string[]>([])
  const [topWeaknesses, setTopWeaknesses] = useState<string[]>([])
  const [competencyScores, setCompetencyScores] = useState<{ label: string; value: number }[]>([])
  const [coachSummary, setCoachSummary] = useState<{ summary?: string; focusAreas?: string[]; nextSteps?: string[] } | null>(null)
  const [coachLoading, setCoachLoading] = useState(false)
  const [coachError, setCoachError] = useState<string | null>(null)
  const growthDelta = data.length >= 2
    ? Math.round((data[data.length - 1]?.score || 0) - (data[0]?.score || 0))
    : 0
  const growthLabel = growthDelta ? ` (${growthDelta > 0 ? '+' : ''}${growthDelta}%)` : ''

  useEffect(() => {
    const fetchReports = async () => {
      if (!profile?.userId) return
      try {
        const parseList = (value: any) => {
          if (Array.isArray(value)) return value
          if (typeof value === 'string') {
            try {
              return JSON.parse(value)
            } catch {
              return []
            }
          }
          return []
        }

        const parseObject = (value: any) => {
          if (!value) return null
          if (typeof value === 'string') {
            try {
              return JSON.parse(value)
            } catch {
              return null
            }
          }
          return value
        }

        const [reports, sessions, careerPaths, interviewQuestions] = await Promise.all([
          blink.db.feedbackReports.list({
            where: { userId: profile.userId },
            orderBy: { createdAt: 'asc' },
          }),
          blink.db.interviewSessions.list({
            where: { userId: profile.userId },
          }),
          blink.db.careerPaths.list(),
          blink.db.interviewQuestions.list(),
        ])

        setData(reports)

        const sessionMap: Record<string, any> = {}
        sessions.forEach((session: any) => {
          sessionMap[session.id] = session
        })
        const sessionIds = new Set(sessions.map((session: any) => session.id))

        const domainMap: Record<string, number[]> = {}
        const strengthCount: Record<string, number> = {}
        const weaknessCount: Record<string, number> = {}

        reports.forEach((report: any) => {
          const session = sessionMap[report.sessionId]
          const careerPath = careerPaths.find((path: any) => path.id === session?.careerPathId)
          const domain = careerPath?.domain || 'General'

          if (!domainMap[domain]) domainMap[domain] = []
          domainMap[domain].push(report.score || 0)

          const strengths = parseList(report.strengths)
          strengths.forEach((strength: string) => {
            strengthCount[strength] = (strengthCount[strength] || 0) + 1
          })

          const weaknesses = parseList(report.weaknesses)
          weaknesses.forEach((weakness: string) => {
            weaknessCount[weakness] = (weaknessCount[weakness] || 0) + 1
          })
        })

        const breakdownTotals = {
          correctness: 0,
          conceptCoverage: 0,
          clarity: 0,
          depth: 0,
          communication: 0,
          count: 0,
        }

        interviewQuestions.forEach((question: any) => {
          if (!sessionIds.has(question.sessionId)) return
          const evaluation = parseObject(question.evaluation)
          const breakdown = parseObject(question.scoreBreakdown) || evaluation?.breakdown
          if (!breakdown) return
          breakdownTotals.correctness += breakdown.correctness || 0
          breakdownTotals.conceptCoverage += breakdown.conceptCoverage || 0
          breakdownTotals.clarity += breakdown.clarity || 0
          breakdownTotals.depth += breakdown.depth || 0
          breakdownTotals.communication += breakdown.communication || 0
          breakdownTotals.count += 1
        })

        const divisor = breakdownTotals.count || 1
        const averages = {
          correctness: breakdownTotals.correctness / divisor,
          conceptCoverage: breakdownTotals.conceptCoverage / divisor,
          clarity: breakdownTotals.clarity / divisor,
          depth: breakdownTotals.depth / divisor,
          communication: breakdownTotals.communication / divisor,
        }

        const toPercent = (value: number, max: number) =>
          Math.max(0, Math.min(100, Math.round((value / max) * 100)))

        setCompetencyScores([
          { label: 'Correctness', value: toPercent(averages.correctness, 40) },
          { label: 'Concept Coverage', value: toPercent(averages.conceptCoverage, 25) },
          { label: 'Clarity', value: toPercent(averages.clarity, 15) },
          { label: 'Depth & Edge Cases', value: toPercent(averages.depth, 10) },
          { label: 'Communication', value: toPercent(averages.communication, 10) },
        ])

        const domainScoresArray = Object.entries(domainMap).map(([domain, scores]) => ({
          domain,
          average: Math.round(scores.reduce((acc, score) => acc + score, 0) / scores.length),
        }))

        const strengthList = Object.entries(strengthCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s)
        const weaknessList = Object.entries(weaknessCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s)

        setDomainScores(domainScoresArray)
        setTopStrengths(strengthList)
        setTopWeaknesses(weaknessList)

        setCoachLoading(true)
        setCoachError(null)
        try {
          const { object } = await blink.ai.generateObject({
            prompt: `COACH_SUMMARY\nPAYLOAD:${JSON.stringify({
              action: 'coachSummary',
              strengths: strengthList,
              weaknesses: weaknessList,
              domainScores: domainScoresArray,
              totalReports: reports.length,
            })}`,
            schema: {
              type: 'object',
              properties: {
                summary: { type: 'string' },
                focusAreas: { type: 'array', items: { type: 'string' } },
                nextSteps: { type: 'array', items: { type: 'string' } },
              },
            },
          })
          setCoachSummary(object || null)
        } catch (err) {
          console.error('AI coach summary error:', err)
          setCoachError('AI coach unavailable right now.')
        } finally {
          setCoachLoading(false)
        }
      } catch (err) {
        console.error('Error fetching reports:', err)
      }
    }
    fetchReports()
  }, [profile])

  const SkillProgress = ({ label, value }: { label: string, value: number }) => (
    <div className="space-y-3">
      <div className="flex justify-between text-sm font-bold">
        <span>{label}</span>
        <span className="text-primary">{value}%</span>
      </div>
      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary shadow-lg shadow-primary/30 transition-all duration-1000"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Skill Analytics</h1>
        <p className="text-muted-foreground">Deep dive into your performance metrics and readiness levels.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="p-8 rounded-3xl border-border/40 shadow-sm flex flex-col h-full">
          <div className="flex justify-between items-start mb-8">
            <div className="space-y-1">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Readiness Progress
              </h2>
              <p className="text-sm text-muted-foreground">Your interview score trend over the last sessions.</p>
            </div>
          </div>

          <div className="flex-1 flex items-end gap-2 min-h-[240px] pt-10">
            {data.length > 0 ? data.map((r, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-3 group">
                <div
                  className="w-full bg-primary/10 rounded-xl relative overflow-hidden group-hover:bg-primary/20 transition-all cursor-pointer"
                  style={{ height: `${r.score}%` }}
                >
                  <div className="absolute inset-x-0 bottom-0 bg-primary rounded-xl h-full transition-all duration-1000" style={{ height: `${r.score}%` }} />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-xs font-bold bg-white text-primary px-2 py-1 rounded-lg shadow-lg">{r.score}%</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase truncate w-full text-center">Session {i + 1}</span>
              </div>
            )) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm italic">
                Insufficient data to generate trend.
              </div>
            )}
          </div>
        </Card>

        <Card className="p-8 rounded-3xl border-border/40 shadow-sm space-y-8">
          <div className="space-y-1">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Competency Breakdown
            </h2>
            <p className="text-sm text-muted-foreground">Core skill proficiency based on AI evaluations.</p>
          </div>

          <div className="space-y-8 py-4">
            {competencyScores.length > 0 ? competencyScores.map((metric) => (
              <SkillProgress key={metric.label} label={metric.label} value={metric.value} />
            )) : (
              <div className="text-sm text-muted-foreground">Complete interviews to unlock competency metrics.</div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 rounded-3xl border-border/40 bg-secondary/20 flex flex-col items-center text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-white border border-border/40 flex items-center justify-center shadow-sm">
            <TrendingUp className="text-primary w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold">Fastest Growth</h4>
            <p className="text-xs text-muted-foreground">{topStrengths[0] || 'Communication'}{growthLabel}</p>
          </div>
        </Card>

        <Card className="p-6 rounded-3xl border-border/40 bg-secondary/20 flex flex-col items-center text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-white border border-border/40 flex items-center justify-center shadow-sm">
            <Zap className="text-primary w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold">Top Focus Area</h4>
            <p className="text-xs text-muted-foreground">{topWeaknesses[0] || 'Trade-off analysis'}</p>
          </div>
        </Card>

        <Card className="p-6 rounded-3xl border-border/40 bg-secondary/20 flex flex-col items-center text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-white border border-border/40 flex items-center justify-center shadow-sm">
            <BarChart className="text-primary w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold">Domain Averages</h4>
            <p className="text-xs text-muted-foreground">
              {domainScores.length ? domainScores.map((score) => `${score.domain} ${score.average}%`).join(' • ') : 'No domain data yet'}
            </p>
          </div>
        </Card>
      </div>

      <Card className="p-8 rounded-3xl border-border/40 shadow-sm space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            AI Coach Insights
          </h2>
          <p className="text-sm text-muted-foreground">Personalized guidance based on your interview history.</p>
        </div>
        {coachLoading && (
          <div className="text-sm text-muted-foreground">Generating coach insights...</div>
        )}
        {!coachLoading && coachError && (
          <div className="text-sm text-muted-foreground">{coachError}</div>
        )}
        {!coachLoading && !coachError && coachSummary && (
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>{coachSummary.summary || 'Keep practicing to build consistent interview performance.'}</p>
            {coachSummary.focusAreas?.length ? (
              <div>
                <p className="font-semibold text-foreground mb-2">Focus Areas</p>
                <p>{coachSummary.focusAreas.join(', ')}</p>
              </div>
            ) : null}
            {coachSummary.nextSteps?.length ? (
              <div>
                <p className="font-semibold text-foreground mb-2">Next Steps</p>
                <p>{coachSummary.nextSteps.join(', ')}</p>
              </div>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  )
}
