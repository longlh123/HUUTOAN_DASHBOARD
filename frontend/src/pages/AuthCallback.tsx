import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function AuthCallback() {
  const { login } = useAuth()
  const navigate  = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token  = params.get('token')

    if (!token) { navigate('/login'); return }

    login(token)
      .then(() => navigate('/dashboard/sales', { replace: true }))
      .catch(() => navigate('/login', { replace: true }))
  }, [])

  return (
    <div className="login-page">
      <div className="login-card">
        <p className="login-card__sub">Đang xác thực...</p>
      </div>
    </div>
  )
}
