import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  authLogin,
  authMe,
  authRegister,
  clearToken,
  getToken,
  setToken,
  type User,
} from '../api'

interface AuthContextValue {
  user: User | null
  /** true while the stored token is being verified on first load */
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // On mount: remove legacy mock-auth keys from the old localStorage-based system.
  useEffect(() => {
    localStorage.removeItem('jeevakosha_user')
    localStorage.removeItem('jeevakosha_users')
  }, [])

  // On mount: only verify the token if one is actually stored.
  // Calling /auth/me with no token would loop: 401 → interceptor → reload → repeat.
  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }
    authMe()
      .then(u => setUser(u))
      .catch(() => clearToken())   // expired / invalid → treat as logged out
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { access_token, user: u } = await authLogin(email, password)
    setToken(access_token)
    setUser(u)
  }, [])

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const { access_token, user: u } = await authRegister(name, email, password)
    setToken(access_token)
    setUser(u)
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
