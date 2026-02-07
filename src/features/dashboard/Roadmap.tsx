import React, { useEffect, useMemo, useState } from 'react'
import { Card } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { useProfile } from '../../hooks/useProfile'
import { blink } from '../../lib/blink'
import { Loader2, Map, RefreshCw, Target } from 'lucide-react'
import toast from 'react-hot-toast'

interface RoadmapRecord {
  id: string
  userId: string
  summary?: string
  primaryGoal?: string
  currentLevel?: string
  phases?: any[]
  weeklyPlan?: any[]
  nextActions?: string[]
  updatedAt?: string
  createdAt?: string
}

interface RoadmapProps {
  trigger: number
}

export function Roadmap({ trigger }: RoadmapProps) {
  const { profile } = useProfile()
  const [roadmap, setRoadmap] = useState<RoadmapRecord | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [latestActivityAt, setLatestActivityAt] = useState<string | null>(null)
  const [domainScoreMap, setDomainScoreMap] = useState<Record<string, number>>({})

  useEffect(() => {
    const fetchRoadmap = async () => {
      if (!profile?.userId) return
      const data = await blink.db.roadmaps.list({
        where: { userId: profile.userId },
        orderBy: { updatedAt: 'desc' },
      })
      setRoadmap(data[0] || null)
    }
    fetchRoadmap()
  }, [profile?.userId])

  useEffect(() => {
    const fetchLatestActivity = async () => {
      if (!profile?.userId) return
      const [sessions, practices, submissions, reports, careerPaths] = await Promise.all([
        blink.db.interviewSessions.list({ where: { userId: profile.userId } }),
        blink.db.practiceAttempts.list({ where: { userId: profile.userId } }),
        blink.db.codingSubmissions.list({ where: { userId: profile.userId } }),
        blink.db.feedbackReports.list({ where: { userId: profile.userId } }),
        blink.db.careerPaths.list(),
      ])
      const timestamps = [
        ...sessions.map((item: any) => item.updatedAt || item.startedAt),
        ...practices.map((item: any) => item.updatedAt || item.createdAt),
        ...submissions.map((item: any) => item.updatedAt || item.createdAt),
      ].filter(Boolean)
      const latest = timestamps.sort().slice(-1)[0] || null
      setLatestActivityAt(latest)

      const sessionMap: Record<string, any> = {}
      sessions.forEach((session: any) => {
        sessionMap[session.id] = session
      })

      const domainMap: Record<string, number[]> = {}
      reports.forEach((report: any) => {
        const session = sessionMap[report.sessionId]
        const careerPath = careerPaths.find((path: any) => path.id === session?.careerPathId)
        const domain = careerPath?.domain || 'General'
        if (!domainMap[domain]) domainMap[domain] = []
        domainMap[domain].push(report.score || 0)
      })

      const computedScores: Record<string, number> = {}
      Object.entries(domainMap).forEach(([domain, scores]) => {
        computedScores[domain] = Math.round(scores.reduce((acc, score) => acc + score, 0) / scores.length)
      })
      setDomainScoreMap(computedScores)
    }
    fetchLatestActivity()
  }, [profile?.userId])

  const parseList = (value: any) => {
    if (Array.isArray(value)) return value
    if (typeof value === 'string' && value.trim().startsWith('[')) {
      try {
        return JSON.parse(value)
      } catch {
        return []
      }
    }
    return []
  }

  const generateRoadmap = async () => {
    if (!profile?.userId) return
    if (isLoading) return
    setIsLoading(true)
    const toastId = toast.loading('AI is generating your roadmap...')
    try {
      const [reports, sessions, practices, submissions, careerPaths] = await Promise.all([
        blink.db.feedbackReports.list({ where: { userId: profile.userId } }),
        blink.db.interviewSessions.list({ where: { userId: profile.userId } }),
        blink.db.practiceAttempts.list({ where: { userId: profile.userId } }),
        blink.db.codingSubmissions.list({ where: { userId: profile.userId } }),
        blink.db.careerPaths.list(),
      ])

      const sessionMap: Record<string, any> = {}
      sessions.forEach((session: any) => {
        sessionMap[session.id] = session
      })

      const domainMap: Record<string, number[]> = {}
      reports.forEach((report: any) => {
        const session = sessionMap[report.sessionId]
        const careerPath = careerPaths.find((path: any) => path.id === session?.careerPathId)
        const domain = careerPath?.domain || 'General'
        if (!domainMap[domain]) domainMap[domain] = []
        domainMap[domain].push(report.score || 0)
      })

      const domainScores = Object.entries(domainMap).map(([domain, scores]) => ({
        domain,
        average: Math.round(scores.reduce((acc, score) => acc + score, 0) / scores.length),
      }))

      const recentScores = reports.slice(-5).map((report: any) => report.score || 0)
      const practiceCount = practices.length
      const codingStats = {
        total: submissions.length,
        passed: submissions.filter((s: any) => s.passed).length,
      }

      const { object } = await blink.ai.generateObject({
        prompt: `GENERATE_ROADMAP\nPAYLOAD:${JSON.stringify({
          action: 'generateRoadmap',
          careerPathId: profile.careerPathId,
          experienceLevel: profile.experienceLevel,
          currentRole: profile.currentRole || '',
          targetRole: profile.targetRole || '',
          interviewTimeline: profile.interviewTimeline || '',
          weeklyHours: profile.weeklyHours || '',
          resumeStatus: profile.resumeStatus || '',
          focusAreas: profile.focusAreas || [],
          challenges: profile.challenges || [],
          learningStyle: profile.learningStyle || '',
          goalStatement: profile.goalStatement || '',
          domainScores,
          recentScores,
          totalInterviews: sessions.length,
          practiceCount,
          codingStats,
        })}`,
        schema: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            currentLevel: { type: 'string' },
            primaryGoal: { type: 'string' },
            phases: { type: 'array', items: { type: 'object' } },
            weeklyPlan: { type: 'array', items: { type: 'object' } },
            nextActions: { type: 'array', items: { type: 'string' } },
          },
        },
      })

      const record = roadmap
        ? await blink.db.roadmaps.update(roadmap.id, { ...object })
        : await blink.db.roadmaps.create({
            id: `roadmap_${profile.userId}`,
            userId: profile.userId,
            ...object,
          })

      setRoadmap(record as RoadmapRecord)
      toast.success('Roadmap ready!', { id: toastId })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Roadmap generation failed'
      toast.error(message, { id: toastId })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!trigger) return
    generateRoadmap()
  }, [trigger])

  const updateAvailable = useMemo(() => {
    if (!roadmap?.updatedAt || !latestActivityAt) return false
    return latestActivityAt > roadmap.updatedAt
  }, [latestActivityAt, roadmap?.updatedAt])

  const resolvePhaseProgress = (phase: any) => {
    const domains = Array.isArray(phase?.focusDomains) ? phase.focusDomains : []
    if (!domains.length) return Number(phase?.progress) || 0
    const scores = domains.map((domain: string) => domainScoreMap[domain]).filter((value) => typeof value === 'number')
    if (!scores.length) return Number(phase?.progress) || 0
    return Math.round(scores.reduce((acc: number, value: number) => acc + value, 0) / scores.length)
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Personalized Roadmap</h1>
          <p className="text-muted-foreground">AI-generated plan based on your goals, timeline, and progress.</p>
          {roadmap?.updatedAt && (
            <p className="text-xs text-muted-foreground mt-2">
              Last updated: {new Date(roadmap.updatedAt).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {updateAvailable && (
            <span className="text-xs font-bold uppercase tracking-widest text-amber-600">Update available</span>
          )}
          <Button onClick={generateRoadmap} className="rounded-2xl h-11 gap-2" disabled={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {roadmap ? 'Update Roadmap' : 'Generate Roadmap'}
          </Button>
        </div>
      </div>

      {!roadmap ? (
        <Card className="p-12 rounded-3xl border-dashed border-2 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto">
            <Map className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-bold">{isLoading ? 'Generating roadmap...' : 'No roadmap yet'}</h3>
          <p className="text-sm text-muted-foreground">
            {isLoading ? 'AI is preparing your personalized plan. This may take a minute.' : 'Generate a detailed plan tailored to your goals and timeline.'}
          </p>
          {isLoading ? (
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
          ) : (
            <Button onClick={generateRoadmap} className="rounded-full px-8">Generate Roadmap</Button>
          )}
        </Card>
      ) : (
        <div className="space-y-8">
          <Card className="p-8 rounded-3xl border-border/40 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Target className="w-4 h-4 text-primary" />
              {roadmap.primaryGoal || 'Primary Goal'}
            </div>
            <p className="text-sm text-muted-foreground">{roadmap.summary || 'Your roadmap summary will appear here.'}</p>
            <p className="text-xs text-muted-foreground">Current level: {roadmap.currentLevel || profile?.experienceLevel || 'N/A'}</p>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {parseList(roadmap.phases).map((phase: any, index: number) => (
              <Card key={index} className="p-6 rounded-3xl border-border/40 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold">{phase.title || `Phase ${index + 1}`}</h3>
                  <span className="text-xs font-bold text-primary">{phase.duration || '2 weeks'}</span>
                </div>
                <p className="text-sm text-muted-foreground">{phase.objective || phase.summary || ''}</p>
                <div className="flex flex-wrap gap-2">
                  {(phase.focusDomains || []).map((domain: string) => (
                    <span key={domain} className="px-3 py-1 rounded-full bg-secondary text-xs font-semibold">{domain}</span>
                  ))}
                </div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  {(phase.actions || phase.tasks || []).slice(0, 4).map((task: string, idx: number) => (
                    <div key={idx}>- {task}</div>
                  ))}
                </div>
                {phase.deliverables?.length ? (
                  <div className="text-xs text-muted-foreground">
                    Deliverables: {phase.deliverables.slice(0, 3).join(', ')}
                  </div>
                ) : null}
                {(phase.mockInterviewPlan || phase.codingPracticePlan) && (
                  <div className="text-xs text-muted-foreground">
                    {phase.mockInterviewPlan ? `Mock interviews: ${phase.mockInterviewPlan}. ` : ''}
                    {phase.codingPracticePlan ? `Coding practice: ${phase.codingPracticePlan}.` : ''}
                  </div>
                )}
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, resolvePhaseProgress(phase)))}%` }} />
                </div>
              </Card>
            ))}
          </div>

          <Card className="p-8 rounded-3xl border-border/40 shadow-sm space-y-6">
            <h3 className="text-lg font-bold">Weekly Plan</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {parseList(roadmap.weeklyPlan).map((week: any, index: number) => (
                <div key={index} className="p-4 rounded-2xl bg-secondary/30 border border-border/20 space-y-2">
                  <p className="text-sm font-bold">{week.week || `Week ${index + 1}`}</p>
                  <p className="text-xs text-muted-foreground">{(week.focus || []).join(', ')}</p>
                  <div className="text-xs text-muted-foreground space-y-1">
                    {(week.tasks || []).slice(0, 3).map((task: string, idx: number) => (
                      <div key={idx}>- {task}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-8 rounded-3xl bg-primary text-primary-foreground shadow-2xl shadow-primary/20 space-y-4">
            <h3 className="text-2xl font-bold">Next Actions</h3>
            <ul className="text-sm text-primary-foreground/80 space-y-1">
              {parseList(roadmap.nextActions).length ? (
                parseList(roadmap.nextActions).map((item: string, index: number) => (
                  <li key={index}>- {item}</li>
                ))
              ) : (
                <li>- Complete one mock interview and one coding challenge this week.</li>
              )}
            </ul>
          </Card>
        </div>
      )}
    </div>
  )
}
