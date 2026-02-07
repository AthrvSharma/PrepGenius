import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useBlinkAuth } from '@blinkdotnew/react'
import { LandingPage } from './pages/LandingPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { DashboardPage } from './pages/DashboardPage'
import { useProfile } from './hooks/useProfile'
import { Spinner } from './components/ui/spinner'
import { ErrorBoundary } from './components/ui/error-boundary'

function App() {
  const { isAuthenticated, isLoading: authLoading } = useBlinkAuth()
  const { profile, isLoading: profileLoading } = useProfile()

  if (authLoading || (isAuthenticated && profileLoading)) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Spinner className="w-10 h-10 text-primary" />
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <AnimatePresence mode="wait">
        {!isAuthenticated ? (
          <motion.div
            key="landing"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <LandingPage />
          </motion.div>
        ) : !profile?.careerPathId ? (
          <motion.div
            key="onboarding"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <OnboardingPage />
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <DashboardPage />
          </motion.div>
        )}
      </AnimatePresence>
    </ErrorBoundary>
  )
}

export default App
