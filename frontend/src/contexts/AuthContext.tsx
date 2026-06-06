import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthUser } from '../api/auth'
import { fetchMe, logoutApi } from '../api/auth'

const TOKEN_KEY = 'ht_token'

type AuthContextValue = {
  user:    AuthUser | null
  token:   string | null
  loading: boolean
  login:   (token: string, user: AuthUser) => void
  logout:  () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<AuthUser | null>(null)
  const [token,   setToken]   = useState<string | null>(null)
  const [loading, setLoading] = useState(() => !!localStorage.getItem(TOKEN_KEY))

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY)
    if (!saved) return
    fetchMe(saved)
      .then(u  => { setToken(saved); setUser(u) })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false))
  }, [])

  function login(newToken: string, newUser: AuthUser) {
    localStorage.setItem(TOKEN_KEY, newToken)
    setToken(newToken)
    setUser(newUser)
  }

  async function logout() {
    const t = localStorage.getItem(TOKEN_KEY)
    if (t) await logoutApi(t).catch(() => {})
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
