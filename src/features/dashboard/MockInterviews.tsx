import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Switch } from '../../components/ui/switch'
import { useProfile } from '../../hooks/useProfile'
import { blink } from '../../lib/blink'
import {
  Play,
  ChevronRight,
  Clock,
  Zap,
  AlertCircle,
  RotateCcw,
  Settings2,
} from 'lucide-react'
import { InterviewSession } from './InterviewSession'
import toast from 'react-hot-toast'
import { SectionHeader } from '../../components/ui/section-header'

interface CareerPath {
  id: string
  name: string
  description: string
  domain: string
}

const difficultyMap: Record<string, 'Easy' | 'Medium' | 'Hard'> = {
  Junior: 'Easy',
  Mid: 'Medium',
  Senior: 'Hard',
}

export function MockInterviews() {
  const { profile } = useProfile()
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [careerPaths, setCareerPaths] = useState<CareerPath[]>([])
  const [isStarting, setIsSubmitting] = useState(false)
  const [inProgressSession, setInProgressSession] = useState<any | null>(null)
  const [questionCount, setQuestionCount] = useState('10')
  const [timeLimitMin, setTimeLimitMin] = useState('30')
  const [followUpsEnabled, setFollowUpsEnabled] = useState(true)

  useEffect(() => {
    const fetchPaths = async () => {
      try {
        const paths = await blink.db.careerPaths.list()
        setCareerPaths(paths as CareerPath[])
      } catch (err) {
        console.error('Error fetching career paths:', err)
      }
    }

    const fetchInProgress = async () => {
      if (!profile?.userId) return
      const sessions = await blink.db.interviewSessions.list({
        where: { userId: profile.userId, status: 'in_progress' },
        orderBy: { startedAt: 'desc' },
      })
      setInProgressSession(sessions[0] || null)
    }

    fetchPaths()
    fetchInProgress()
  }, [profile?.userId])

  const handleStartSession = async (pathId: string) => {
    if (!profile?.userId) return
    setIsSubmitting(true)
    try {
      const sessionId = `sess_${Date.now()}`
      const difficulty = difficultyMap[profile.experienceLevel || 'Mid'] || 'Medium'
      const totalQuestions = Number(questionCount) || 10
      const timeLimitSec = (Number(timeLimitMin) || 30) * 60
      await blink.db.interviewSessions.create({
        id: sessionId,
        userId: profile.userId,
        careerPathId: pathId,
        status: 'in_progress',
        difficulty,
        totalQuestions,
        timeLimitSec,
        followUpsEnabled,
        currentIndex: 0,
      })
      setActiveSessionId(sessionId)
      toast.success('Interview session started')
    } catch (err) {
      toast.error('Failed to start session')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (activeSessionId) {
    return (
      <InterviewSession
        sessionId={activeSessionId}
        onComplete={() => {
          setActiveSessionId(null)
          setInProgressSession(null)
        }}
      />
    )
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6 items-end">
        <SectionHeader
          kicker="Interview Studio"
          title="Mock Interviews"
          subtitle="Select a specialized module, adjust pacing, and train in a realistic interview environment."
        />
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="flex items-center gap-3 p-2 bg-secondary/50 rounded-2xl border border-border/40 justify-start lg:justify-end"
        >
          <Button variant="ghost" size="sm" className="rounded-xl h-9 px-4 text-xs font-bold bg-background shadow-sm">Standard</Button>
          <Button variant="ghost" size="sm" className="rounded-xl h-9 px-4 text-xs font-bold text-muted-foreground opacity-50 cursor-not-allowed">Realistic (Video)</Button>
        </motion.div>
      </div>

      <Card className="relative overflow-hidden rounded-3xl border-border/40 p-8 glass-card">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.15),transparent_55%),radial-gradient(circle_at_80%_0%,rgba(56,189,248,0.12),transparent_50%)]" />
        <div className="relative z-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">
              <Zap className="h-4 w-4 text-primary" />
              Adaptive Interview Engine
            </div>
            <h2 className="text-2xl font-semibold">Simulate real pressure with guided AI prompts</h2>
            <p className="text-sm text-muted-foreground">
              Each question adapts to your depth and clarity. Score breakdowns follow every response so you can adjust immediately.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {[
              { label: 'Avg Session', value: `${timeLimitMin} min` },
              { label: 'Questions', value: questionCount },
              { label: 'Follow-ups', value: followUpsEnabled ? 'On' : 'Off' },
              { label: 'Difficulty', value: difficultyMap[profile?.experienceLevel || 'Mid'] || 'Medium' }
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-border/40 bg-background/80 px-4 py-3">
                <div className="text-xs text-muted-foreground">{item.label}</div>
                <div className="text-lg font-semibold">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-6 rounded-3xl border-border/40 bg-secondary/20">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Settings2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Session Settings</h2>
            <p className="text-xs text-muted-foreground">Customize the length and style of your mock interview.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Questions</p>
            <Select value={questionCount} onValueChange={setQuestionCount}>
              <SelectTrigger className="h-11 rounded-2xl bg-background">
                <SelectValue placeholder="Questions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 questions</SelectItem>
                <SelectItem value="10">10 questions</SelectItem>
                <SelectItem value="15">15 questions</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Time Limit</p>
            <Select value={timeLimitMin} onValueChange={setTimeLimitMin}>
              <SelectTrigger className="h-11 rounded-2xl bg-background">
                <SelectValue placeholder="Time limit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="45">45 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/40 bg-background px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Follow-ups</p>
              <p className="text-sm font-medium">Enable AI follow-up questions</p>
            </div>
            <Switch checked={followUpsEnabled} onCheckedChange={setFollowUpsEnabled} />
          </div>
        </div>
      </Card>

      {inProgressSession && (
        <Card className="p-6 rounded-3xl border-primary/30 bg-primary/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary font-bold">Resume Interview</p>
            <h2 className="text-xl font-bold mt-2">Session in progress</h2>
            <p className="text-sm text-muted-foreground">
              Continue where you left off to preserve your progress.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {inProgressSession.totalQuestions || 10} questions | {Math.round((inProgressSession.timeLimitSec || 1800) / 60)} min | {inProgressSession.followUpsEnabled === false ? 'No follow-ups' : 'Follow-ups on'}
            </p>
          </div>
          <Button onClick={() => setActiveSessionId(inProgressSession.id)} className="h-11 px-6 rounded-2xl gap-2">
            <RotateCcw className="w-4 h-4" />
            Resume Session
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {careerPaths.map((path, idx) => (
          <motion.div
            key={path.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut', delay: idx * 0.04 }}
          >
            <Card className="group relative overflow-hidden rounded-3xl border-border/40 shadow-sm shadow-foreground/5 p-8 transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5">
            <div className="relative z-10 flex flex-col h-full">
              <div className="flex justify-between items-start mb-6">
                <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Play className="w-6 h-6" />
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{path.domain}</span>
                  <div className="flex items-center gap-1 text-[10px] font-bold text-primary px-2 py-0.5 rounded-full bg-primary/10">
                    <Zap className="w-3 h-3" />
                    PREMIUM
                  </div>
                </div>
              </div>

              <h3 className="text-xl font-bold mb-3 group-hover:text-primary transition-colors">{path.name}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-8 flex-1">
                {path.description}
              </p>

              <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground mb-8">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  30 mins
                </div>
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Adaptive difficulty
                </div>
              </div>

              <Button
                onClick={() => handleStartSession(path.id)}
                disabled={isStarting}
                className="w-full h-12 rounded-2xl group-hover:shadow-lg group-hover:shadow-primary/20 transition-all"
              >
                Start Practice Session
                <ChevronRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl transition-opacity opacity-0 group-hover:opacity-100" />
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
