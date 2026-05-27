export function LoginPage() {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__brand">Hữu Toàn</div>
        <h1 className="login-card__title">Dashboard</h1>
        <p className="login-card__sub">Đăng nhập bằng tài khoản Microsoft công ty</p>
        <a href="/api/auth/azure/redirect" className="login-card__btn">
          <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
            <rect x="1"  y="1"  width="9" height="9" fill="#f25022"/>
            <rect x="11" y="1"  width="9" height="9" fill="#7fba00"/>
            <rect x="1"  y="11" width="9" height="9" fill="#00a4ef"/>
            <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
          </svg>
          Đăng nhập với Microsoft
        </a>
      </div>
    </div>
  )
}
