import React, { useSyncExternalStore } from 'react'
import { getAuthSnapshot, subscribeAuth } from './localAuth'

interface ProviderProps {
  children: React.ReactNode
}

export function BlinkProvider({ children }: ProviderProps) {
  return <>{children}</>
}

export function BlinkAuthProvider({ children }: ProviderProps) {
  return <>{children}</>
}

export function useBlinkAuth() {
  const user = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthSnapshot)
  return {
    user,
    isAuthenticated: Boolean(user),
    isLoading: false,
  }
}
