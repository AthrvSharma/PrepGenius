import { useState, useEffect } from 'react'
import { useBlinkAuth } from '@blinkdotnew/react'
import { blink } from '../lib/blink'

export interface UserProfile {
  userId: string
  careerPathId: string | null
  experienceLevel: string | null
  currentRole?: string | null
  targetRole?: string | null
  interviewTimeline?: string | null
  weeklyHours?: number | null
  resumeStatus?: string | null
  focusAreas?: string[] | null
  challenges?: string[] | null
  learningStyle?: string | null
  goalStatement?: string | null
  bio: string | null
  avatarUrl: string | null
  createdAt: string
}

export function useProfile() {
  const { user, isAuthenticated } = useBlinkAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setProfile(null)
      setIsLoading(false)
      return
    }

    const fetchProfile = async () => {
      try {
        setIsLoading(true)
        const data = await blink.db.userProfiles.get(user.id) as UserProfile | null
        setProfile(data)
      } catch (err) {
        console.error('Error fetching profile:', err)
        setError(err as Error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchProfile()
  }, [user, isAuthenticated])

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) return
    try {
      const existing = await blink.db.userProfiles.get(user.id)
      let updated
      if (existing) {
        updated = await blink.db.userProfiles.update(user.id, updates)
      } else {
        updated = await blink.db.userProfiles.create({
          userId: user.id,
          ...updates
        })
      }
      setProfile(updated as UserProfile)
      return updated
    } catch (err) {
      console.error('Error updating profile:', err)
      throw err
    }
  }

  return { profile, isLoading, error, updateProfile, setProfile }
}
