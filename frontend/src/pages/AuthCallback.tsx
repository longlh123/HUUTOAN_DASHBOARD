import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fetchMe } from '../api/auth'

export function AuthCallback() {
  const { login } = useAuth()
  const navigate  = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token  = params.get('token')

    if (!token) { navigate('/login'); return }

    fetchMe(token)
      .then(user => { login(token, user); navigate('/dashboard/sales', { replace: true }) })
      .catch(() => navigate('/login', { replace: true }))
  }, [login, navigate])

  return (
    <div className="login-page">
      <div className="login-card">
        <p className="login-card__sub">Đang xác thực...</p>
      </div>
    </div>
  )
}
