import React, { useState, useEffect } from 'react'
import { Card } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { useProfile } from '../../hooks/useProfile'
import { blink } from '../../lib/blink'
import { 
  History, 
  Calendar, 
  Award, 
  BarChart3, 
  ExternalLink,
  Search,
  Filter
} from 'lucide-react'
import { Badge } from '../../components/ui/badge'

export function SessionHistory() {
  const { profile } = useProfile()
  const [history, setHistory] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchHistory = async () => {
      if (!profile?.userId) return
      try {
        const sessions = await blink.db.interviewSessions.list({
          where: { userId: profile.userId, status: 'completed' },
          orderBy: { startedAt: 'desc' }
        })
        
        // Fetch reports for these sessions
        const reports = await blink.db.feedbackReports.list({
          where: { userId: profile.userId }
        })

        const mapped = sessions.map(s => ({
          ...s,
          report: reports.find(r => r.sessionId === s.id)
        }))

        setHistory(mapped)
      } catch (err) {
        console.error('Error fetching history:', err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchHistory()
  }, [profile])

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500 bg-green-500/10'
    if (score >= 60) return 'text-amber-500 bg-amber-500/10'
    return 'text-destructive bg-destructive/10'
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Session History</h1>
          <p className="text-muted-foreground">Review your past performance and track growth over time.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              placeholder="Search sessions..." 
              className="pl-10 h-11 w-64 rounded-xl border border-border/40 bg-secondary/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <Button variant="outline" className="h-11 rounded-xl px-4 gap-2">
            <Filter className="w-4 h-4" />
            Filter
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-2xl" />)}
        </div>
      ) : history.length === 0 ? (
        <Card className="p-20 text-center rounded-3xl border-dashed border-2 border-border/40">
          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-6">
            <History className="text-muted-foreground w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold mb-2">No completed sessions yet</h3>
          <p className="text-muted-foreground mb-8">Take your first AI mock interview to start building your history.</p>
          <Button className="rounded-full px-8">Start First Session</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {history.map((session) => (
            <Card key={session.id} className="p-6 rounded-3xl border-border/40 shadow-sm hover:border-primary/30 transition-all group">
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
                  <BarChart3 className="w-7 h-7" />
                </div>
                
                <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-1">
                    <h4 className="font-bold truncate">{session.careerPathId?.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</h4>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(session.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <Badge variant="outline" className="rounded-full px-3 py-1 font-bold">{session.difficulty}</Badge>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Level</span>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className={`px-4 py-1.5 rounded-full font-bold text-sm ${getScoreColor(session.report?.score || 0)}`}>
                      {session.report?.score || 0}%
                    </div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Score</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <Button variant="ghost" size="sm" className="text-primary font-bold gap-2">
                    <ExternalLink className="w-4 h-4" />
                    Full Report
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
