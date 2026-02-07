import React, { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Shell } from '../components/layout/Shell'
import { Overview } from '../features/dashboard/Overview'
import { MockInterviews } from '../features/dashboard/MockInterviews'
import { SessionHistory } from '../features/dashboard/SessionHistory'
import { ResumeAnalyzer } from '../features/dashboard/ResumeAnalyzer'
import { SkillAnalytics } from '../features/dashboard/SkillAnalytics'
import { JobMatchAnalyzer } from '../features/dashboard/JobMatchAnalyzer'
import { QuestionLab } from '../features/dashboard/QuestionLab'
import { Roadmap } from '../features/dashboard/Roadmap'
import { CodingPractice } from '../features/dashboard/CodingPractice'
import { LearningHub } from '../features/dashboard/LearningHub'
import { AdminConsole } from '../features/admin/AdminConsole'

export function DashboardPage() {
  const [activeTab, setActiveTab] = useState('overview')
  const [roadmapTrigger, setRoadmapTrigger] = useState(0)

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <Overview
            onStartInterview={() => setActiveTab('interviews')}
            onViewRoadmap={() => {
              setRoadmapTrigger(Date.now())
              setActiveTab('roadmap')
            }}
          />
        )
      case 'interviews':
        return <MockInterviews />
      case 'history':
        return <SessionHistory />
      case 'resume':
        return <ResumeAnalyzer />
      case 'analytics':
        return <SkillAnalytics />
      case 'job-match':
        return <JobMatchAnalyzer />
      case 'question-lab':
        return <QuestionLab />
      case 'roadmap':
        return <Roadmap trigger={roadmapTrigger} />
      case 'coding-practice':
        return <CodingPractice />
      case 'learning':
        return <LearningHub />
      case 'admin':
        return <AdminConsole />
      default:
        return (
          <Overview
            onStartInterview={() => setActiveTab('interviews')}
            onViewRoadmap={() => {
              setRoadmapTrigger(Date.now())
              setActiveTab('roadmap')
            }}
          />
        )
    }
  }

  return (
    <Shell activeTab={activeTab} setActiveTab={setActiveTab}>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </Shell>
  )
}
