import React, { useEffect, useState } from 'react'
import { Card } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Textarea } from '../../components/ui/textarea'
import { useProfile } from '../../hooks/useProfile'
import { blink } from '../../lib/blink'
import { clampText } from '../../lib/validation'
import { Briefcase, Building2, FileText, Loader2, Search, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'

export function JobMatchAnalyzer() {
  const { profile } = useProfile()
  const [resumes, setResumes] = useState<any[]>([])
  const [jobMatches, setJobMatches] = useState<any[]>([])
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null)
  const [jobTitle, setJobTitle] = useState('')
  const [company, setCompany] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      if (!profile?.userId) return
      try {
        const [resumeData, matchData] = await Promise.all([
          blink.db.resumes.list({ where: { userId: profile.userId }, orderBy: { createdAt: 'desc' } }),
          blink.db.jobMatches.list({ where: { userId: profile.userId }, orderBy: { createdAt: 'desc' } }),
        ])
        setResumes(resumeData)
        setJobMatches(matchData)
        if (!selectedResumeId && resumeData[0]?.id) {
          setSelectedResumeId(resumeData[0].id)
        }
        if (!selectedMatchId && matchData[0]?.id) {
          setSelectedMatchId(matchData[0].id)
        }
      } catch (err) {
        console.error('Error fetching job match data:', err)
      }
    }
    fetchData()
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

  const scoreOrZero = (value: any) => (typeof value === 'number' ? value : 0)

  const handleAnalyze = async () => {
    if (!profile?.userId || !selectedResumeId) {
      toast.error('Upload a resume first.')
      return
    }
    if (!jobDescription.trim()) {
      toast.error('Paste a job description to analyze.')
      return
    }

    const resume = resumes.find((item) => item.id === selectedResumeId)
    if (!resume?.resumeText) {
      toast.error('Resume text not available. Upload again.')
      return
    }

    setIsAnalyzing(true)
    const toastId = toast.loading('AI is matching your resume to the job...')
    try {
      const { object } = await blink.ai.generateObject({
        prompt: `JOB_MATCH_ANALYSIS\nPAYLOAD:${JSON.stringify({
          action: 'jobMatchAnalysis',
          resumeText: clampText(resume.resumeText, 4000),
          jobDescription: clampText(jobDescription, 4000),
          jobTitle,
          company,
          careerPathId: profile.careerPathId,
        })}`,
        schema: {
          type: 'object',
          properties: {
            matchScore: { type: 'number' },
            keywordCoverage: { type: 'number' },
            roleFitScore: { type: 'number' },
            experienceScore: { type: 'number' },
            summary: { type: 'string' },
            matchRationale: { type: 'string' },
            matchedSkills: { type: 'array', items: { type: 'string' } },
            missingSkills: { type: 'array', items: { type: 'string' } },
            priorityGaps: { type: 'array', items: { type: 'string' } },
            recommendedKeywords: { type: 'array', items: { type: 'string' } },
            redFlags: { type: 'array', items: { type: 'string' } },
            resumeAdjustments: { type: 'array', items: { type: 'string' } },
            tailoredSummary: { type: 'string' },
            interviewTopics: { type: 'array', items: { type: 'string' } },
            nextSteps: { type: 'array', items: { type: 'string' } },
          },
        },
      })

      const record = await blink.db.jobMatches.create({
        id: `jm_${Date.now()}`,
        userId: profile.userId,
        resumeId: selectedResumeId,
        jobTitle,
        company,
        jobDescription: clampText(jobDescription, 4000),
        ...object,
      })

      setJobMatches((prev) => [record, ...prev])
      setSelectedMatchId(record.id)
      toast.success('Job match analysis complete!', { id: toastId })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI analysis failed'
      toast.error(message || 'AI analysis failed', { id: toastId })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const selectedMatch = jobMatches.find((item) => item.id === selectedMatchId) || jobMatches[0]

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Job Match Analyzer</h1>
          <p className="text-muted-foreground">Match your resume against a job description and get targeted fixes.</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Sparkles className="w-4 h-4 text-primary" />
          AI-powered match scoring and improvements
        </div>
      </div>

      <Card className="p-6 rounded-3xl border-border/40 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Search className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold">New Job Match</h2>
            <p className="text-xs text-muted-foreground">Use your resume text and a real job description.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Resume</p>
            <Select value={selectedResumeId || ''} onValueChange={setSelectedResumeId}>
              <SelectTrigger className="h-11 rounded-2xl bg-background">
                <SelectValue placeholder="Select resume" />
              </SelectTrigger>
              <SelectContent>
                {resumes.map((resume) => (
                  <SelectItem key={resume.id} value={resume.id}>
                    {resume.filename}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Job Title</p>
            <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-background px-4 h-11">
              <Briefcase className="w-4 h-4 text-muted-foreground" />
              <input
                className="flex-1 bg-transparent text-sm outline-none"
                placeholder="Frontend Engineer"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Company</p>
            <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-background px-4 h-11">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <input
                className="flex-1 bg-transparent text-sm outline-none"
                placeholder="Company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Job Description</p>
          <Textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the full job description here..."
            className="min-h-[140px] rounded-2xl bg-background border-border/40"
          />
        </div>

        <Button onClick={handleAnalyze} disabled={isAnalyzing || !resumes.length} className="h-12 rounded-2xl px-6 gap-2">
          {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Run Job Match
        </Button>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-lg font-bold px-2">Recent Matches</h2>
          {jobMatches.length === 0 ? (
            <Card className="p-10 text-center rounded-3xl border-dashed border-2">
              <p className="text-sm text-muted-foreground">No job matches yet.</p>
            </Card>
          ) : (
            jobMatches.map((match) => (
              <Card
                key={match.id}
                onClick={() => setSelectedMatchId(match.id)}
                className={`p-4 rounded-2xl border-border/40 hover:border-primary/30 transition-all cursor-pointer group ${
                  selectedMatchId === match.id ? 'border-primary/40 bg-secondary/20' : ''
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                    <FileText className="text-primary w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{match.jobTitle || 'Job Match'}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                      {match.company || 'Company'} | {new Date(match.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-xs font-bold text-primary">{scoreOrZero(match.matchScore)}%</div>
                </div>
              </Card>
            ))
          )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          {selectedMatch ? (
            <div className="space-y-6 animate-fade-in">
              <Card className="p-8 rounded-3xl border-border/40 shadow-sm space-y-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                  <div>
                    <h3 className="text-xl font-bold">{selectedMatch.jobTitle || 'Job Match Result'}</h3>
                    <p className="text-sm text-muted-foreground">{selectedMatch.company || 'Company'} | Resume fit overview</p>
                  </div>
                  <div className="text-4xl font-bold text-primary">{scoreOrZero(selectedMatch.matchScore)}%</div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Keyword Coverage', value: scoreOrZero(selectedMatch.keywordCoverage) },
                    { label: 'Role Fit', value: scoreOrZero(selectedMatch.roleFitScore) },
                    { label: 'Experience Fit', value: scoreOrZero(selectedMatch.experienceScore) },
                    { label: 'Overall Match', value: scoreOrZero(selectedMatch.matchScore) },
                  ].map((metric) => (
                    <div key={metric.label} className="p-4 rounded-2xl bg-secondary/30 border border-border/20">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">{metric.label}</p>
                      <p className="text-2xl font-bold text-primary">{metric.value}%</p>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-8 rounded-3xl border-border/40 shadow-sm space-y-6">
                <h3 className="text-xl font-bold">AI Summary</h3>
                <p className="text-sm text-muted-foreground">{selectedMatch.summary || 'Summary will appear after analysis.'}</p>
                {selectedMatch.matchRationale && (
                  <div className="p-4 rounded-2xl bg-secondary/30 border border-border/20">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-2">Match Rationale</p>
                    <p className="text-sm font-medium">{selectedMatch.matchRationale}</p>
                  </div>
                )}
                <div className="p-4 rounded-2xl bg-secondary/30 border border-border/20">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-2">Tailored Summary</p>
                  <p className="text-sm font-medium">{selectedMatch.tailoredSummary || 'No tailored summary yet.'}</p>
                </div>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="p-6 rounded-3xl border-border/40 space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Matched Skills</h4>
                  <div className="flex flex-wrap gap-2">
                    {parseList(selectedMatch.matchedSkills).length ? parseList(selectedMatch.matchedSkills).map((skill: string, i: number) => (
                      <span key={i} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">{skill}</span>
                    )) : <p className="text-sm text-muted-foreground italic">No matched skills yet.</p>}
                  </div>
                </Card>
                <Card className="p-6 rounded-3xl border-border/40 space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Missing Skills</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {parseList(selectedMatch.missingSkills).length ? parseList(selectedMatch.missingSkills).map((item: string, i: number) => (
                      <li key={i}>- {item}</li>
                    )) : <li>- None flagged</li>}
                  </ul>
                </Card>
              </div>

              <Card className="p-6 rounded-3xl border-border/40 space-y-4">
                <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Priority Gaps</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {parseList(selectedMatch.priorityGaps).length ? parseList(selectedMatch.priorityGaps).map((item: string, i: number) => (
                    <li key={i}>- {item}</li>
                  )) : <li>- No critical gaps flagged</li>}
                </ul>
              </Card>

              <Card className="p-8 rounded-3xl border-border/40 shadow-sm space-y-6">
                <h3 className="text-xl font-bold">Targeted Improvements</h3>
                <div className="space-y-4">
                  {parseList(selectedMatch.resumeAdjustments).length ? parseList(selectedMatch.resumeAdjustments).map((item: string, i: number) => (
                    <div key={i} className="p-4 rounded-2xl bg-secondary/30 border border-border/20 text-sm font-medium">
                      {item}
                    </div>
                  )) : (
                    <p className="text-sm text-muted-foreground italic">No adjustments yet.</p>
                  )}
                </div>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="p-6 rounded-3xl border-border/40 space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Recommended Keywords</h4>
                  <div className="flex flex-wrap gap-2">
                    {parseList(selectedMatch.recommendedKeywords).length ? parseList(selectedMatch.recommendedKeywords).map((item: string, i: number) => (
                      <span key={i} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">{item}</span>
                    )) : <p className="text-sm text-muted-foreground italic">No keywords yet.</p>}
                  </div>
                </Card>
                <Card className="p-6 rounded-3xl border-border/40 space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Interview Topics</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {parseList(selectedMatch.interviewTopics).length ? parseList(selectedMatch.interviewTopics).map((item: string, i: number) => (
                      <li key={i}>- {item}</li>
                    )) : <li>- Topics will appear after analysis</li>}
                  </ul>
                </Card>
              </div>

              <Card className="p-8 rounded-3xl border-border/40 shadow-sm space-y-4">
                <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Red Flags</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {parseList(selectedMatch.redFlags).length ? parseList(selectedMatch.redFlags).map((item: string, i: number) => (
                    <li key={i}>- {item}</li>
                  )) : <li>- No red flags detected</li>}
                </ul>
              </Card>

              <Card className="p-8 rounded-3xl bg-primary text-primary-foreground shadow-2xl shadow-primary/20">
                <h3 className="text-2xl font-bold mb-2">Next Steps</h3>
                <ul className="text-sm text-primary-foreground/80 space-y-1">
                  {parseList(selectedMatch.nextSteps).length ? parseList(selectedMatch.nextSteps).map((item: string, i: number) => (
                    <li key={i}>- {item}</li>
                  )) : <li>- Run a targeted mock interview next.</li>}
                </ul>
              </Card>
            </div>
          ) : (
            <Card className="p-20 text-center rounded-3xl border-dashed border-2">
              <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-6">
                <FileText className="text-muted-foreground w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-2">Select a job match to view details</h3>
              <p className="text-muted-foreground">Run your first analysis to see detailed feedback.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
