import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { useProfile } from '../hooks/useProfile'
import { blink } from '../lib/blink'
import { Briefcase, GraduationCap, ChevronRight, Check, Target, User, Clock, BookOpen } from 'lucide-react'
import { SectionHeader } from '../components/ui/section-header'
import toast from 'react-hot-toast'

interface CareerPath {
  id: string
  name: string
  description: string
  domain: string
}

export function OnboardingPage() {
  const { updateProfile } = useProfile()
  const [careerPaths, setCareerPaths] = useState<CareerPath[]>([])
  const [step, setStep] = useState(1)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedLevel, setSelectedPathLevel] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentRole, setCurrentRole] = useState('')
  const [targetRole, setTargetRole] = useState('')
  const [interviewTimeline, setInterviewTimeline] = useState('1 month')
  const [weeklyHours, setWeeklyHours] = useState('5')
  const [resumeStatus, setResumeStatus] = useState('Needs update')
  const [focusAreas, setFocusAreas] = useState<string[]>([])
  const [challenges, setChallenges] = useState<string[]>([])
  const [learningStyle, setLearningStyle] = useState('Structured plan')
  const [goalStatement, setGoalStatement] = useState('')

  useEffect(() => {
    const fetchPaths = async () => {
      try {
        const paths = await blink.db.careerPaths.list()
        setCareerPaths(paths as CareerPath[])
      } catch (err) {
        console.error('Error fetching career paths:', err)
      }
    }
    fetchPaths()
  }, [])

  const handleComplete = async () => {
    if (!selectedPath || !selectedLevel) return
    setIsSubmitting(true)
    try {
      await updateProfile({
        careerPathId: selectedPath,
        experienceLevel: selectedLevel,
        currentRole: currentRole || null,
        targetRole: targetRole || null,
        interviewTimeline: interviewTimeline || null,
        weeklyHours: weeklyHours ? Number(weeklyHours) : null,
        resumeStatus: resumeStatus || null,
        focusAreas,
        challenges,
        learningStyle,
        goalStatement: goalStatement || null,
      })
      toast.success('Profile setup complete!')
      window.location.reload() // Trigger auth check in App.tsx
    } catch (err) {
      toast.error('Failed to complete onboarding')
    } finally {
      setIsSubmitting(false)
    }
  }

  const steps = [1, 2, 3, 4]
  const focusOptions = [
    'DSA',
    'System Design',
    'Backend',
    'Frontend',
    'Behavioral',
    'SQL/DBMS',
    'OS/Networking',
    'Projects',
    'Cloud/DevOps',
    'AI/ML',
  ]
  const challengeOptions = [
    'Time management',
    'Confidence',
    'Coding speed',
    'System design depth',
    'Behavioral storytelling',
    'SQL queries',
    'Debugging',
    'Communication clarity',
  ]

  const toggleValue = (value: string, list: string[], setter: (values: string[]) => void) => {
    if (list.includes(value)) {
      setter(list.filter((item) => item !== value))
      return
    }
    setter([...list, value])
  }

  return (
    <div className="relative min-h-screen bg-background aurora-surface flex items-center justify-center p-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-24 h-80 w-80 rounded-full bg-purple-500/20 blur-3xl animate-float" />
        <div className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-cyan-400/15 blur-3xl animate-float-slow" />
      </div>
      <div className="relative z-10 max-w-5xl w-full">
        {/* Progress Bar */}
        <div className="flex gap-2 mb-12 max-w-xs mx-auto">
          {steps.map((s) => (
            <div 
              key={s} 
              className={`h-1 flex-1 rounded-full transition-all duration-500 ${step >= s ? 'bg-primary shadow-sm shadow-primary/20' : 'bg-muted'}`} 
            />
          ))}
        </div>

        {step === 1 ? (
          <div className="space-y-10">
            <SectionHeader
              align="center"
              kicker="Step 01"
              title="Choose Your Career Path"
              subtitle="Select the domain you want to master and we’ll tailor everything around it."
            />
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {careerPaths.map((path) => (
                <motion.button
                  key={path.id}
                  onClick={() => setSelectedPath(path.id)}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  className={`text-left p-6 rounded-3xl border transition-all duration-300 relative group glass-card ${
                    selectedPath === path.id 
                      ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10' 
                      : 'border-border/50 hover:border-primary/30 hover:bg-secondary/50'
                  }`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${selectedPath === path.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-primary'}`}>
                      <Briefcase className="w-5 h-5" />
                    </div>
                    {selectedPath === path.id && (
                      <Check className="w-5 h-5 text-primary animate-in zoom-in" />
                    )}
                  </div>
                  <h3 className="font-bold mb-2 group-hover:text-primary transition-colors">{path.name}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{path.description}</p>
                </motion.button>
              ))}
            </div>

            <div className="flex justify-center pt-8">
              <Button 
                onClick={() => setStep(2)} 
                disabled={!selectedPath}
                className="h-12 px-10 rounded-full"
              >
                Next Step
                <ChevronRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : step === 2 ? (
          <div className="space-y-10">
            <SectionHeader
              align="center"
              kicker="Step 02"
              title="Select Experience Level"
              subtitle="We tune depth and difficulty based on your real-world experience."
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
              {[
                { id: 'Junior', title: 'Junior / Intern', desc: '0-2 years. Core concepts & fundamentals.' },
                { id: 'Mid', title: 'Mid-Level', desc: '2-5 years. Problem solving & efficiency.' },
                { id: 'Senior', title: 'Senior+', desc: '5+ years. Architecture & leadership.' }
              ].map((level) => (
                <motion.button
                  key={level.id}
                  onClick={() => setSelectedPathLevel(level.id)}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  className={`text-left p-8 rounded-3xl border transition-all duration-300 relative glass-card ${
                    selectedLevel === level.id 
                      ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10' 
                      : 'border-border/50 hover:border-primary/30 hover:bg-secondary/50'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 transition-colors ${selectedLevel === level.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-primary'}`}>
                    <GraduationCap className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold mb-3">{level.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{level.desc}</p>
                </motion.button>
              ))}
            </div>

            <div className="flex justify-center gap-4 pt-8">
              <Button variant="ghost" onClick={() => setStep(1)} className="rounded-full px-8 h-12">Back</Button>
              <Button 
                onClick={() => setStep(3)}
                disabled={!selectedLevel}
                className="h-12 px-10 rounded-full shadow-lg shadow-primary/20"
              >
                Next Step
                <ChevronRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : step === 3 ? (
          <div className="space-y-10">
            <SectionHeader
              align="center"
              kicker="Step 03"
              title="Define Your Goals"
              subtitle="Your goals help us craft the most accurate mock and roadmap."
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="p-6 rounded-3xl border-border/40 space-y-4 glass-card">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <User className="w-4 h-4 text-primary" />
                  Current Role (optional)
                </div>
                <Input
                  value={currentRole}
                  onChange={(e) => setCurrentRole(e.target.value)}
                  placeholder="Student, Intern, Software Engineer"
                  className="rounded-2xl h-11"
                />
              </Card>

              <Card className="p-6 rounded-3xl border-border/40 space-y-4 glass-card">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <Target className="w-4 h-4 text-primary" />
                  Target Role
                </div>
                <Input
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder="Frontend Engineer, SDE-1, Data Analyst"
                  className="rounded-2xl h-11"
                />
              </Card>

              <Card className="p-6 rounded-3xl border-border/40 space-y-4 glass-card">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <Clock className="w-4 h-4 text-primary" />
                  Interview Timeline
                </div>
                <Select value={interviewTimeline} onValueChange={setInterviewTimeline}>
                  <SelectTrigger className="h-11 rounded-2xl bg-background">
                    <SelectValue placeholder="Pick timeline" />
                  </SelectTrigger>
                  <SelectContent>
                    {['2 weeks', '1 month', '3 months', '6 months'].map((option) => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Card>

              <Card className="p-6 rounded-3xl border-border/40 space-y-4 glass-card">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <Clock className="w-4 h-4 text-primary" />
                  Weekly Prep Hours
                </div>
                <Select value={weeklyHours} onValueChange={setWeeklyHours}>
                  <SelectTrigger className="h-11 rounded-2xl bg-background">
                    <SelectValue placeholder="Pick hours" />
                  </SelectTrigger>
                  <SelectContent>
                    {['3', '5', '8', '12', '15'].map((option) => (
                      <SelectItem key={option} value={option}>{option} hours</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Card>

              <Card className="p-6 rounded-3xl border-border/40 space-y-4 md:col-span-2 glass-card">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <BookOpen className="w-4 h-4 text-primary" />
                  Resume Status
                </div>
                <Select value={resumeStatus} onValueChange={setResumeStatus}>
                  <SelectTrigger className="h-11 rounded-2xl bg-background">
                    <SelectValue placeholder="Resume status" />
                  </SelectTrigger>
                  <SelectContent>
                    {['Up to date', 'Needs update', 'Not started'].map((option) => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Card>
            </div>

            <div className="flex justify-center gap-4 pt-8">
              <Button variant="ghost" onClick={() => setStep(2)} className="rounded-full px-8 h-12">Back</Button>
              <Button
                onClick={() => setStep(4)}
                disabled={!targetRole}
                className="h-12 px-10 rounded-full shadow-lg shadow-primary/20"
              >
                Next Step
                <ChevronRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            <SectionHeader
              align="center"
              kicker="Step 04"
              title="Focus & Challenges"
              subtitle="Help the AI tailor a precise learning path for you."
            />

            <Card className="p-8 rounded-3xl border-border/40 space-y-6 glass-card">
              <div>
                <h3 className="font-bold mb-3">Focus Areas</h3>
                <div className="flex flex-wrap gap-2">
                  {focusOptions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleValue(item, focusAreas, setFocusAreas)}
                      className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
                        focusAreas.includes(item)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border/50 text-muted-foreground hover:border-primary/40'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-bold mb-3">Biggest Challenges</h3>
                <div className="flex flex-wrap gap-2">
                  {challengeOptions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleValue(item, challenges, setChallenges)}
                      className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
                        challenges.includes(item)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border/50 text-muted-foreground hover:border-primary/40'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h3 className="font-bold">Learning Style</h3>
                  <Select value={learningStyle} onValueChange={setLearningStyle}>
                    <SelectTrigger className="h-11 rounded-2xl bg-background">
                      <SelectValue placeholder="Learning style" />
                    </SelectTrigger>
                    <SelectContent>
                      {['Structured plan', 'Rapid drills', 'Project-based', 'Interview simulation'].map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <h3 className="font-bold">Goal Statement</h3>
                  <Textarea
                    value={goalStatement}
                    onChange={(e) => setGoalStatement(e.target.value)}
                    placeholder="I want to crack SDE-1 interviews in 3 months."
                    className="min-h-[90px] rounded-2xl bg-background"
                  />
                </div>
              </div>
            </Card>

            <div className="flex justify-center gap-4 pt-8">
              <Button variant="ghost" onClick={() => setStep(3)} className="rounded-full px-8 h-12">Back</Button>
              <Button 
                onClick={handleComplete} 
                disabled={isSubmitting}
                className="h-12 px-10 rounded-full shadow-lg shadow-primary/20"
              >
                {isSubmitting ? 'Finishing...' : 'Complete Profile'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
