import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { loginWithCredentials } from '../api/auth'

export function LoginPage() {
  const { login }   = useAuth()
  const navigate    = useNavigate()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token, user } = await loginWithCredentials(email, password)
      login(token, user)
      navigate('/dashboard/sales', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__brand">Hữu Toàn</div>
        <h1 className="login-card__title">Dashboard</h1>
        <p className="login-card__sub">Đăng nhập bằng tài khoản nội bộ</p>
        <form className="login-card__form" onSubmit={handleSubmit}>
          <div>
            <label className="login-card__label" htmlFor="email">Email</label>
            <input
              id="email"
              className="login-card__input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="login-card__label" htmlFor="password">Mật khẩu</label>
            <input
              id="password"
              className="login-card__input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="login-card__error">{error}</p>}
          <button className="login-card__submit" type="submit" disabled={loading}>
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  )
}
