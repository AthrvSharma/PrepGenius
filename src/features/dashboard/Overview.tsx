import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { useProfile } from '../../hooks/useProfile'
import { blink } from '../../lib/blink'
import AnimatedList from '../../components/react-bits/AnimatedList'
import { 
  Plus, 
  ArrowUpRight, 
  Brain, 
  Target, 
  Timer, 
  TrendingUp,
  Award,
  ChevronRight
} from 'lucide-react'

interface OverviewProps {
  onStartInterview: () => void
  onViewRoadmap: () => void
}

export function Overview({ onStartInterview, onViewRoadmap }: OverviewProps) {
  const { profile } = useProfile()
  const [stats, setStats] = useState({
    totalInterviews: 0,
    averageScore: 0,
    topStrength: 'Loading...',
    nextSession: 'Now'
  })
  const [learningPlan, setLearningPlan] = useState<any[]>([])
  const [dailyChallenge, setDailyChallenge] = useState<any | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState<string | null>(null)

  const pulseItems = [
    'Resume improvements unlocked · ATS +6',
    'New mock: System design follow-ups ready',
    'Coding streak: 4 days',
    'Clarity score trending up',
    'Next focus: API Design depth'
  ]

  useEffect(() => {
    const fetchStats = async () => {
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

        const [history, reports, sessions, careerPaths] = await Promise.all([
          blink.db.interviewSessions.list({
            where: { userId: profile.userId, status: 'completed' }
          }),
          blink.db.feedbackReports.list({
            where: { userId: profile.userId },
            orderBy: { createdAt: 'asc' },
          }),
          blink.db.interviewSessions.list({
            where: { userId: profile.userId },
          }),
          blink.db.careerPaths.list(),
        ])
        
        const total = history.length
        const avg = reports.length > 0 
          ? Math.round(reports.reduce((acc: number, r: any) => acc + r.score, 0) / reports.length)
          : 0
        
        const strengthCounts: Record<string, number> = {}
        const weaknessCounts: Record<string, number> = {}
        reports.forEach((report: any) => {
          const strengths = parseList(report.strengths)
          strengths.forEach((strength: string) => {
            strengthCounts[strength] = (strengthCounts[strength] || 0) + 1
          })

          const weaknesses = parseList(report.weaknesses)
          weaknesses.forEach((weakness: string) => {
            weaknessCounts[weakness] = (weaknessCounts[weakness] || 0) + 1
          })
        })

        const topStrengths = Object.entries(strengthCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([strength]) => strength)
        const topWeaknesses = Object.entries(weaknessCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([weakness]) => weakness)

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

        setStats({
          totalInterviews: total,
          averageScore: avg,
          topStrength: topStrengths[0] || 'Consistency',
          nextSession: 'Now'
        })

        setInsightsLoading(true)
        setInsightsError(null)
        try {
          const { object } = await blink.ai.generateObject({
            prompt: `DASHBOARD_INSIGHTS\nPAYLOAD:${JSON.stringify({
              action: 'dashboardInsights',
              careerPathId: profile.careerPathId,
              currentRole: profile.currentRole || '',
              targetRole: profile.targetRole || '',
              interviewTimeline: profile.interviewTimeline || '',
              weeklyHours: profile.weeklyHours || '',
              resumeStatus: profile.resumeStatus || '',
              focusAreas: profile.focusAreas || [],
              challenges: profile.challenges || [],
              learningStyle: profile.learningStyle || '',
              goalStatement: profile.goalStatement || '',
              strengths: topStrengths.slice(0, 5),
              weaknesses: topWeaknesses.slice(0, 5),
              domainScores,
              recentScores,
              totalInterviews: total,
            })}`,
            schema: {
              type: 'object',
              properties: {
                learningPlan: { type: 'array' },
                dailyChallenge: { type: 'object' },
              },
            },
          })

          setLearningPlan(Array.isArray(object?.learningPlan) ? object.learningPlan : [])
          setDailyChallenge(object?.dailyChallenge || null)
        } catch (err) {
          console.error('AI insights error:', err)
          setInsightsError('AI insights unavailable right now.')
        } finally {
          setInsightsLoading(false)
        }
      } catch (err) {
        console.error('Error fetching stats:', err)
      }
    }
    fetchStats()
  }, [profile])

  const StatCard = ({ icon: Icon, label, value, trend, trendColor, delay = 0 }: any) => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut', delay }}
    >
      <Card className="p-6 rounded-3xl border-border/40 shadow-sm shadow-foreground/5 relative overflow-hidden group">
      <div className="flex justify-between items-start mb-4">
        <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center">
          <Icon className="text-primary w-6 h-6" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${trendColor}`}>
            <ArrowUpRight className="w-3 h-3" />
            {trend}
          </div>
        )}
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-1">{label}</p>
        <h3 className="text-2xl font-bold">{value}</h3>
      </div>
      <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
      </Card>
    </motion.div>
  )

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Welcome back, Scholar</h1>
          <p className="text-muted-foreground flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Currently preparing for <span className="font-bold text-foreground italic">{profile?.careerPathId?.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span>
          </p>
        </div>
        <Button onClick={onStartInterview} className="h-12 px-8 rounded-2xl shadow-lg shadow-primary/20 gap-2">
          <Plus className="w-5 h-5" />
          New Mock Interview
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard icon={Brain} label="Interviews Taken" value={stats.totalInterviews} trend="+12%" trendColor="bg-green-500/10 text-green-600" delay={0.05} />
        <StatCard icon={TrendingUp} label="Average Score" value={`${stats.averageScore}%`} trend="+5%" trendColor="bg-green-500/10 text-green-600" delay={0.1} />
        <StatCard icon={Award} label="Top Strength" value={stats.topStrength} delay={0.15} />
        <StatCard icon={Timer} label="Next Readiness Goal" value={stats.nextSession} delay={0.2} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recommended Path */}
        <Card className="lg:col-span-2 p-8 rounded-3xl border-border/40 shadow-sm shadow-foreground/5 overflow-hidden relative">
          <div className="flex justify-between items-start mb-8">
            <div className="space-y-1">
              <h2 className="text-xl font-bold">AI Recommended Learning Path</h2>
              <p className="text-sm text-muted-foreground">Personalized focus areas based on your performance.</p>
            </div>
            <Button variant="ghost" size="sm" className="text-primary font-bold" onClick={onViewRoadmap}>View Roadmap</Button>
          </div>

          <div className="space-y-6">
            {insightsLoading && (
              <div className="text-sm text-muted-foreground">Generating your AI learning plan...</div>
            )}
            {!insightsLoading && insightsError && (
              <div className="text-sm text-muted-foreground">{insightsError}</div>
            )}
            {!insightsLoading && !insightsError && learningPlan.length === 0 && (
              <div className="text-sm text-muted-foreground">Complete a mock interview to unlock your plan.</div>
            )}
            {learningPlan.map((step, i) => (
              <div key={i} className="flex items-center gap-6 p-4 rounded-2xl bg-secondary/30 border border-border/20 group hover:border-primary/30 transition-all cursor-pointer">
                <div className="w-12 h-12 rounded-xl bg-background border border-border/40 flex items-center justify-center font-bold text-lg text-primary">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between mb-2">
                    <h4 className="font-bold truncate">{step.title || 'Focus area'}</h4>
                    <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{step.difficulty || 'Medium'}</span>
                  </div>
                  {(step.focus || step.why) && (
                    <p className="text-xs text-muted-foreground mb-2">{step.focus || step.why}</p>
                  )}
                  <div className="h-1.5 w-full bg-background rounded-full overflow-hidden">
                    <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${Math.max(0, Math.min(100, Number(step.progress) || 0))}%` }} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-semibold text-muted-foreground">{step.duration || '1h'}</div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors ml-auto" />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Daily Challenge */}
        <Card className="p-8 rounded-3xl border-primary/20 bg-primary shadow-2xl shadow-primary/20 text-primary-foreground relative overflow-hidden">
          <div className="relative z-10 h-full flex flex-col">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center mb-6">
              <Plus className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-4">{dailyChallenge?.title || 'Daily Challenge'}</h2>
            <p className="text-white/80 text-sm leading-relaxed mb-6 flex-1">
              {insightsLoading
                ? 'Generating your AI challenge...'
                : dailyChallenge?.description || 'Complete interviews to unlock a tailored challenge.'}
            </p>
            {dailyChallenge?.difficulty && (
              <div className="flex items-center gap-2 text-xs font-bold mb-4">
                <span className="px-2 py-1 rounded-full bg-white/20">{dailyChallenge.difficulty}</span>
                {dailyChallenge.duration && (
                  <span className="px-2 py-1 rounded-full bg-white/20">{dailyChallenge.duration}</span>
                )}
              </div>
            )}
            <Button className="w-full bg-white text-primary hover:bg-white/90 font-bold rounded-2xl py-6">
              Start Challenge
            </Button>
          </div>
          <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent/20 rounded-full blur-2xl" />
        </Card>
      </div>

      <Card className="p-8 rounded-3xl border-border/40 shadow-sm shadow-foreground/5 overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold">AI Pulse</h2>
            <p className="text-sm text-muted-foreground">Live signals based on your recent activity.</p>
          </div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Updated now</div>
        </div>
        <div className="flex justify-center">
          <AnimatedList
            items={pulseItems}
            className="w-full"
            itemClassName="bg-background border border-border/40"
            showGradients={false}
            displayScrollbar={false}
          />
        </div>
      </Card>
    </div>
  )
}
