export interface AuthUser {
  id: string
  email: string
  name?: string
  role?: 'user' | 'admin'
}

const AUTH_STORAGE_KEY = 'prepgenius.auth.user'

let currentUser: AuthUser | null = readStoredUser()
const listeners = new Set<() => void>()

function readStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as AuthUser
    if (!parsed?.id || !parsed?.email) return null
    return parsed
  } catch {
    return null
  }
}

function writeStoredUser(user: AuthUser | null) {
  if (typeof window === 'undefined') return
  if (!user) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user))
}

function notify() {
  listeners.forEach((listener) => listener())
}

export function subscribeAuth(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getAuthSnapshot() {
  return currentUser
}

export function login(email = 'scholar@prepgenius.local', role: 'user' | 'admin' = 'user') {
  const user: AuthUser = {
    id: 'local-user',
    email,
    role,
  }
  currentUser = user
  writeStoredUser(user)
  notify()
}

export function logout() {
  currentUser = null
  writeStoredUser(null)
  notify()
}
