import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { useProfile } from '../../hooks/useProfile'
import { blink } from '../../lib/blink'
import { clampText } from '../../lib/validation'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { 
  Upload, 
  FileText, 
  Sparkles, 
  CheckCircle2, 
  ArrowRight,
  Loader2,
  Trash2,
  Download
} from 'lucide-react'
import toast from 'react-hot-toast'
import { SectionHeader } from '../../components/ui/section-header'

export function ResumeAnalyzer() {
  const { profile } = useProfile()
  const [resumes, setResumes] = useState<any[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null)
  const selectedResume = resumes.find((resume) => resume.id === selectedResumeId) || null

  useEffect(() => {
    GlobalWorkerOptions.workerSrc = workerSrc
  }, [])

  useEffect(() => {
    const fetchResumes = async () => {
      if (!profile?.userId) return
      try {
        const data = await blink.db.resumes.list({
          where: { userId: profile.userId },
          orderBy: { createdAt: 'desc' }
        })
        setResumes(data)
        if (!selectedResumeId && data[0]?.id) {
          setSelectedResumeId(data[0].id)
        }
      } catch (err) {
        console.error('Error fetching resumes:', err)
      }
    }
    fetchResumes()
  }, [profile])

  const extractTextFromFile = async (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    if (extension === 'pdf') {
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await getDocument({ data: arrayBuffer }).promise
      const pages: string[] = []
      for (let i = 1; i <= pdf.numPages; i += 1) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        const pageText = content.items
          .map((item: any) => (item?.str ? item.str : ''))
          .join(' ')
        pages.push(pageText)
      }
      return pages.join('\n')
    }

    if (extension === 'docx') {
      const arrayBuffer = await file.arrayBuffer()
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ arrayBuffer })
      return result.value || ''
    }

    return await file.text()
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profile?.userId) return

    setIsUploading(true)
    const toastId = toast.loading('Uploading resume...')
    try {
      const ext = file.name.split('.').pop()
      const path = `resumes/${profile.userId}/${Date.now()}.${ext}`
      const { publicUrl } = await blink.storage.upload(file, path)

      const resumeText = clampText(await extractTextFromFile(file).catch(() => ''), 4000)

      // Initial DB record
      const newResume = await blink.db.resumes.create({
        id: `res_${Date.now()}`,
        userId: profile.userId,
        filename: file.name,
        publicUrl,
        resumeText
      })

      setResumes(prev => [newResume, ...prev])
      setSelectedResumeId(newResume.id)
      toast.success('Resume uploaded successfully', { id: toastId })
      
      // Trigger AI Analysis
      analyzeResume(newResume.id, publicUrl, newResume.filename, resumeText)
    } catch (err) {
      toast.error('Upload failed', { id: toastId })
    } finally {
      setIsUploading(false)
    }
  }

  const analyzeResume = async (resumeId: string, url: string, filename: string, resumeText: string) => {
    setIsAnalyzing(true)
    const toastId = toast.loading('AI is scoring your resume (ATS + HR review)...')
    try {
      // For production ready, we use generateObject
      const { object } = await blink.ai.generateObject({
        prompt: `RESUME_ANALYSIS\nPAYLOAD:${JSON.stringify({
          action: 'resumeAnalysis',
          filename,
          careerPathId: profile?.careerPathId || null,
          resumeText
        })}`,
        schema: {
          type: 'object',
          properties: {
            atsScore: { type: 'number' },
            keywordMatchScore: { type: 'number' },
            formattingScore: { type: 'number' },
            readabilityScore: { type: 'number' },
            impactScore: { type: 'number' },
            roleFitScore: { type: 'number' },
            atsCompatibilityScore: { type: 'number' },
            sectionCompletenessScore: { type: 'number' },
            impactDensity: { type: 'number' },
            readabilityGrade: { type: 'string' },
            languageTone: { type: 'string' },
            summary: { type: 'string' },
            strengths: { type: 'array', items: { type: 'string' } },
            weaknesses: { type: 'array', items: { type: 'string' } },
            improvements: { type: 'array', items: { type: 'string' } },
            missingSections: { type: 'array', items: { type: 'string' } },
            redFlags: { type: 'array', items: { type: 'string' } },
            formatRisks: { type: 'array', items: { type: 'string' } },
            suggestedKeywords: { type: 'array', items: { type: 'string' } },
            skills: { type: 'array', items: { type: 'string' } },
            roleSuggestions: { type: 'array', items: { type: 'string' } },
            targetRoleFit: { type: 'array', items: { type: 'object' } },
            recommendations: { type: 'array', items: { type: 'string' } },
            roleFitSummary: { type: 'string' },
            interviewReadiness: { type: 'string' },
            sectionsFound: { type: 'array', items: { type: 'string' } },
            sectionCoverage: { type: 'array', items: { type: 'object' } },
            atsIssues: { type: 'array', items: { type: 'string' } },
            topAchievements: { type: 'array', items: { type: 'string' } },
            bulletRewriteSuggestions: { type: 'array', items: { type: 'object' } },
            metrics: { type: 'object' }
          },
          required: ['skills', 'recommendations']
        }
      })

      const updated = await blink.db.resumes.update(resumeId, {
        extractedSkills: object.skills,
        recommendations: object.recommendations,
        atsScore: object.atsScore,
        keywordMatchScore: object.keywordMatchScore,
        formattingScore: object.formattingScore,
        readabilityScore: object.readabilityScore,
        impactScore: object.impactScore,
        roleFitScore: object.roleFitScore,
        atsCompatibilityScore: object.atsCompatibilityScore,
        sectionCompletenessScore: object.sectionCompletenessScore,
        impactDensity: object.impactDensity,
        readabilityGrade: object.readabilityGrade,
        languageTone: object.languageTone,
        summary: object.summary,
        strengths: object.strengths,
        weaknesses: object.weaknesses,
        improvements: object.improvements,
        missingSections: object.missingSections,
        redFlags: object.redFlags,
        formatRisks: object.formatRisks,
        suggestedKeywords: object.suggestedKeywords,
        roleSuggestions: object.roleSuggestions,
        targetRoleFit: object.targetRoleFit,
        roleFitSummary: object.roleFitSummary,
        interviewReadiness: object.interviewReadiness,
        sectionsFound: object.sectionsFound,
        sectionCoverage: object.sectionCoverage,
        atsIssues: object.atsIssues,
        topAchievements: object.topAchievements,
        bulletRewriteSuggestions: object.bulletRewriteSuggestions,
        metrics: object.metrics
      })

      setResumes(prev => prev.map(r => r.id === resumeId ? updated : r))
      toast.success('Analysis complete!', { id: toastId })
    } catch (err) {
      console.error('Analysis error:', err)
      const message = err instanceof Error ? err.message : 'AI Analysis failed'
      toast.error(message || 'AI Analysis failed', { id: toastId })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleDelete = async (id: string, path: string) => {
    try {
      await blink.db.resumes.delete(id)
      // Extract path from URL or store it separately. For now, just DB delete.
      setResumes(prev => prev.filter(r => r.id !== id))
      toast.success('Resume deleted')
    } catch (err) {
      toast.error('Delete failed')
    }
  }

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

  const parseObjectList = (value: any) => {
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

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10 animate-fade-in">
      <SectionHeader
        kicker="Resume Intelligence"
        title="Resume Analyzer"
        subtitle="Upload your resume and receive ATS + HR-level feedback, scoring, and actionable edits."
      />

      <Card className="relative overflow-hidden rounded-3xl border-border/40 p-8 glass-card">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.14),transparent_55%),radial-gradient(circle_at_80%_0%,rgba(56,189,248,0.12),transparent_50%)]" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              ATS + HR scoring
            </div>
            <h2 className="text-2xl font-semibold mt-2">Instant resume diagnostics in under 2 minutes</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
              We extract skills, quantify impact, and flag formatting risks to increase interview callbacks.
            </p>
          </div>
          <label className="flex items-center gap-3 rounded-full border border-border/40 bg-background/80 px-6 py-3 cursor-pointer text-sm font-medium">
            <Upload className="w-4 h-4 text-primary" />
            Upload Resume
            <input type="file" className="hidden" accept=".pdf,.docx,.txt" onChange={handleUpload} />
          </label>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'ATS Score', value: selectedResume?.atsScore ?? '—' },
          { label: 'Keyword Match', value: selectedResume?.keywordMatchScore ?? '—' },
          { label: 'Readability', value: selectedResume?.readabilityScore ?? '—' },
          { label: 'Role Fit', value: selectedResume?.roleFitScore ?? '—' }
        ].map((item, idx) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut', delay: idx * 0.05 }}
            className="rounded-2xl border border-border/40 bg-background/80 p-4 text-center glass-card"
          >
            <div className="text-xs text-muted-foreground">{item.label}</div>
            <div className="text-xl font-semibold">{item.value}</div>
          </motion.div>
        ))}
      </div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Resume Analyzer</h1>
          <p className="text-muted-foreground">Upload your resume to get skill extraction and personalized interview tips.</p>
        </div>
        <div className="relative">
          <input 
            type="file" 
            id="resume-upload" 
            className="hidden" 
            accept=".pdf,.doc,.docx"
            onChange={handleUpload}
            disabled={isUploading}
          />
          <Button asChild disabled={isUploading} className="h-12 px-8 rounded-2xl shadow-lg shadow-primary/20 gap-2 cursor-pointer">
            <label htmlFor="resume-upload">
              {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
              Upload Resume
            </label>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Resume List */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-lg font-bold px-2">Recent Uploads</h2>
          {resumes.length === 0 ? (
            <Card className="p-12 text-center rounded-3xl border-dashed border-2">
              <p className="text-sm text-muted-foreground">No resumes uploaded yet.</p>
            </Card>
          ) : (
            resumes.map((resume) => (
              <Card
                key={resume.id}
                onClick={() => setSelectedResumeId(resume.id)}
                className={`p-4 rounded-2xl border-border/40 hover:border-primary/30 transition-all cursor-pointer group ${
                  selectedResumeId === resume.id ? 'border-primary/40 bg-secondary/20' : ''
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                    <FileText className="text-primary w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{resume.filename}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                      {new Date(resume.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={(event) => {
                        event.stopPropagation()
                        if (resume.publicUrl) {
                          window.open(resume.publicUrl, '_blank', 'noopener,noreferrer')
                        }
                      }}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleDelete(resume.id, resume.publicUrl)
                      }}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        {/* Analysis Details */}
        <div className="lg:col-span-2 space-y-6">
          {selectedResume ? (
            <div className="space-y-6 animate-fade-in">
              <Card className="p-8 rounded-3xl border-border/40 shadow-sm space-y-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                  <div>
                    <h3 className="text-xl font-bold">ATS Score</h3>
                    <p className="text-sm text-muted-foreground">Recruiter-style evaluation with ATS metrics.</p>
                  </div>
                  <div className="text-4xl font-bold text-primary">{scoreOrZero(selectedResume.atsScore)}%</div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    { label: 'Role Fit', value: scoreOrZero(selectedResume.roleFitScore) },
                    { label: 'Keyword Match', value: scoreOrZero(selectedResume.keywordMatchScore) },
                    { label: 'Formatting', value: scoreOrZero(selectedResume.formattingScore) },
                    { label: 'Readability', value: scoreOrZero(selectedResume.readabilityScore) },
                    { label: 'Impact', value: scoreOrZero(selectedResume.impactScore) },
                    { label: 'ATS Overall', value: scoreOrZero(selectedResume.atsScore) },
                  ].map((metric) => (
                    <div key={metric.label} className="p-4 rounded-2xl bg-secondary/30 border border-border/20">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">{metric.label}</p>
                      <p className="text-2xl font-bold text-primary">{metric.value}%</p>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-8 rounded-3xl border-border/40 shadow-sm space-y-6">
                <h3 className="text-xl font-bold">Quality Signals</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    { label: 'ATS Compatibility', value: scoreOrZero(selectedResume.atsCompatibilityScore) },
                    { label: 'Section Completeness', value: scoreOrZero(selectedResume.sectionCompletenessScore) },
                    { label: 'Impact Density', value: scoreOrZero(selectedResume.impactDensity) },
                  ].map((metric) => (
                    <div key={metric.label} className="p-4 rounded-2xl bg-secondary/30 border border-border/20">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">{metric.label}</p>
                      <p className="text-2xl font-bold text-primary">{metric.value}%</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-secondary/30 border border-border/20 space-y-2">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Readability Grade</p>
                    <p className="text-lg font-semibold">{selectedResume.readabilityGrade || 'N/A'}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-secondary/30 border border-border/20 space-y-2">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Language Tone</p>
                    <p className="text-lg font-semibold">{selectedResume.languageTone || 'Neutral'}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Format Risks</p>
                  {parseList(selectedResume.formatRisks).length ? (
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {parseList(selectedResume.formatRisks).map((item: string, i: number) => (
                        <li key={i}>- {item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No format risks flagged.</p>
                  )}
                </div>
              </Card>

              <Card className="p-8 rounded-3xl border-border/40 shadow-sm space-y-6">
                <h3 className="text-xl font-bold">Recruiter Summary</h3>
                <p className="text-sm text-muted-foreground">{selectedResume.summary || 'Analysis in progress...'}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-secondary/30 border border-border/20 space-y-2">
                    <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Role Fit</p>
                    <p className="text-sm font-medium">{selectedResume.roleFitSummary || 'No role fit summary yet.'}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-secondary/30 border border-border/20 space-y-2">
                    <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Interview Readiness</p>
                    <p className="text-sm font-medium">{selectedResume.interviewReadiness || 'Pending analysis.'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { label: 'Quantified Impact', value: selectedResume.metrics?.quantifiedImpact ?? 0 },
                    { label: 'Action Verbs', value: selectedResume.metrics?.actionVerbs ?? 0 },
                    { label: 'Projects Mentioned', value: selectedResume.metrics?.projectsMentioned ?? 0 },
                  ].map((metric) => (
                    <div key={metric.label} className="p-4 rounded-2xl bg-secondary/30 border border-border/20">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">{metric.label}</p>
                      <p className="text-2xl font-bold text-primary">{metric.value}</p>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-8 rounded-3xl border-border/40 shadow-sm space-y-6">
                <h3 className="text-xl font-bold">Best Fit Roles</h3>
                <div className="flex flex-wrap gap-2">
                  {parseList(selectedResume.roleSuggestions).length ? (
                    parseList(selectedResume.roleSuggestions).map((role: string, i: number) => (
                      <span key={i} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
                        {role}
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Role suggestions will appear after analysis.</p>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {parseObjectList(selectedResume.targetRoleFit).length ? (
                    parseObjectList(selectedResume.targetRoleFit).map((item: any, i: number) => (
                      <div key={i} className="p-4 rounded-2xl bg-secondary/30 border border-border/20 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold">{item.role || 'Role'}</p>
                          <span className="text-xs font-bold text-primary">{scoreOrZero(item.fitScore)}%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.notes || 'No notes provided.'}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Fit analysis will appear after analysis.</p>
                  )}
                </div>
              </Card>

              <Card className="p-8 rounded-3xl border-border/40 shadow-sm space-y-6">
                <h3 className="text-xl font-bold">ATS Section Coverage</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {parseObjectList(selectedResume.sectionCoverage).length ? (
                    parseObjectList(selectedResume.sectionCoverage).map((item: any, i: number) => (
                      <div key={i} className="p-4 rounded-2xl bg-secondary/30 border border-border/20 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold">{item.section || 'Section'}</p>
                          <span className={`text-[10px] uppercase tracking-widest font-bold ${item.status === 'present' ? 'text-green-600' : 'text-amber-600'}`}>
                            {item.status || 'missing'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.notes || 'No notes provided.'}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Section coverage will appear after analysis.</p>
                  )}
                </div>
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">ATS Issues</p>
                  {parseList(selectedResume.atsIssues).length ? (
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {parseList(selectedResume.atsIssues).map((item: string, i: number) => (
                        <li key={i}>• {item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No ATS issues flagged.</p>
                  )}
                </div>
              </Card>

              <Card className="p-8 rounded-3xl border-border/40 shadow-sm overflow-hidden relative">
                <div className="absolute top-0 right-0 p-6 opacity-10">
                  <Sparkles className="w-24 h-24 text-primary" />
                </div>

                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  Skills & Keywords
                </h3>

                <div className="flex flex-wrap gap-2 mb-6">
                  {parseList(selectedResume.extractedSkills).length ? (
                    parseList(selectedResume.extractedSkills).map((skill: string, i: number) => (
                      <div key={i} className="px-4 py-2 rounded-xl bg-secondary text-primary text-sm font-bold border border-primary/10">
                        {skill}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Analysis in progress or not available.</p>
                  )}
                </div>

                <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">Suggested Keywords</h4>
                <div className="flex flex-wrap gap-2">
                  {parseList(selectedResume.suggestedKeywords).length ? (
                    parseList(selectedResume.suggestedKeywords).map((keyword: string, i: number) => (
                      <span key={i} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
                        {keyword}
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No keyword suggestions yet.</p>
                  )}
                </div>
              </Card>

              <Card className="p-8 rounded-3xl border-border/40 shadow-sm space-y-6">
                <h3 className="text-xl font-bold">Bullet Rewrite Suggestions</h3>
                {parseObjectList(selectedResume.bulletRewriteSuggestions).length ? (
                  <div className="space-y-4">
                    {parseObjectList(selectedResume.bulletRewriteSuggestions).slice(0, 4).map((item: any, i: number) => (
                      <div key={i} className="p-4 rounded-2xl bg-secondary/30 border border-border/20 space-y-2">
                        <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Original</p>
                        <p className="text-sm text-muted-foreground">{item.original || '-'}</p>
                        <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Rewrite</p>
                        <p className="text-sm font-semibold">{item.rewritten || '-'}</p>
                        {item.why && (
                          <p className="text-xs text-muted-foreground">{item.why}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No rewrite suggestions yet.</p>
                )}
              </Card>

              <Card className="p-8 rounded-3xl border-border/40 shadow-sm space-y-6">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                  Interview Recommendations
                </h3>

                <div className="space-y-4">
                  {parseList(selectedResume.recommendations).length ? (
                    parseList(selectedResume.recommendations).map((rec: string, i: number) => (
                      <div key={i} className="flex items-start gap-4 p-4 rounded-2xl bg-secondary/30 border border-border/20">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <ArrowRight className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <p className="text-sm font-medium leading-relaxed">{rec}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No recommendations yet.</p>
                  )}
                </div>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="p-6 rounded-3xl border-border/40 space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Strengths</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {parseList(selectedResume.strengths).length ? parseList(selectedResume.strengths).map((item: string, i: number) => (
                      <li key={i}>• {item}</li>
                    )) : <li>• Pending analysis</li>}
                  </ul>
                </Card>
                <Card className="p-6 rounded-3xl border-border/40 space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Weaknesses</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {parseList(selectedResume.weaknesses).length ? parseList(selectedResume.weaknesses).map((item: string, i: number) => (
                      <li key={i}>• {item}</li>
                    )) : <li>• Pending analysis</li>}
                  </ul>
                </Card>
                <Card className="p-6 rounded-3xl border-border/40 space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Improvements</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {parseList(selectedResume.improvements).length ? parseList(selectedResume.improvements).map((item: string, i: number) => (
                      <li key={i}>• {item}</li>
                    )) : <li>• Pending analysis</li>}
                  </ul>
                </Card>
                <Card className="p-6 rounded-3xl border-border/40 space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Missing Sections</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {parseList(selectedResume.missingSections).length ? parseList(selectedResume.missingSections).map((item: string, i: number) => (
                      <li key={i}>• {item}</li>
                    )) : <li>• None detected</li>}
                  </ul>
                </Card>
                <Card className="p-6 rounded-3xl border-border/40 space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Top Achievements</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {parseList(selectedResume.topAchievements).length ? parseList(selectedResume.topAchievements).map((item: string, i: number) => (
                      <li key={i}>• {item}</li>
                    )) : <li>• Highlight measurable impact</li>}
                  </ul>
                </Card>
              </div>

              <Card className="p-8 rounded-3xl border-border/40 shadow-sm space-y-4">
                <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Red Flags</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {parseList(selectedResume.redFlags).length ? parseList(selectedResume.redFlags).map((item: string, i: number) => (
                    <li key={i}>• {item}</li>
                  )) : <li>• No major red flags detected</li>}
                </ul>
              </Card>

              <Card className="p-8 rounded-3xl bg-primary text-primary-foreground shadow-2xl shadow-primary/20 relative overflow-hidden">
                <div className="relative z-10">
                  <h3 className="text-2xl font-bold mb-2">Ready to test these skills?</h3>
                  <p className="text-primary-foreground/80 mb-6">Our AI can now tailor interview questions specifically to your experience.</p>
                  <Button className="bg-white text-primary hover:bg-white/90 font-bold rounded-2xl h-12 px-8">
                    Start Targeted Interview
                  </Button>
                </div>
                <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
              </Card>
            </div>
          ) : (
            <Card className="p-20 text-center rounded-3xl border-dashed border-2">
              <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-6">
                <FileText className="text-muted-foreground w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-2">Select a resume to view analysis</h3>
              <p className="text-muted-foreground">Detailed insights will appear here once you upload and analyze a document.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
