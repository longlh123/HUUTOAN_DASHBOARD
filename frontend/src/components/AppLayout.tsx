import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const NAV_ITEMS = [
  { to: '/dashboard/sales',    label: 'Dashboard',     adminOnly: false },
  { to: '/dashboard/services', label: 'Services',      adminOnly: false },
  { to: '/dashboard/finance',  label: 'Finance',       adminOnly: false },
  { to: '/opp-quality',        label: 'Chat luong Opp', adminOnly: false },
  { to: '/users',              label: 'Users',         adminOnly: true },
  { to: '/settings/kpi',       label: 'Cai dat KPI',   adminOnly: true },
]

export function AppLayout() {
  const [open, setOpen] = useState(false)
  const { user, logout } = useAuth()

  return (
    <div className="app-shell">
      {open && <div className="sidebar-overlay" onClick={() => setOpen(false)} />}

      <nav className={`sidebar${open ? ' sidebar--open' : ''}`}>
        <div className="sidebar__brand">
          Hữu Toàn
          <button className="sidebar__close" onClick={() => setOpen(false)}>✕</button>
        </div>
        <ul className="sidebar__nav">
          {NAV_ITEMS.filter(item => !item.adminOnly || (user?.is_admin ?? true)).map(item => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  'sidebar__link' + (isActive ? ' sidebar__link--active' : '')
                }
                onClick={() => setOpen(false)}
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>

        {user && (
          <div className="sidebar__user">
            <div className="sidebar__user-name">{user.name}</div>
            {user.department && (
              <div className="sidebar__user-territory">{user.department}</div>
            )}
            {user.territory && (
              <div className="sidebar__user-territory">{user.territory}</div>
            )}
            <button className="sidebar__logout" onClick={logout}>Đăng xuất</button>
          </div>
        )}
      </nav>

      <main className="app-content">
        <button className="mobile-menu-btn" onClick={() => setOpen(true)}>☰</button>
        <Outlet />
      </main>
    </div>
  )
}
