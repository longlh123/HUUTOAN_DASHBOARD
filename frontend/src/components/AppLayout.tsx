import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { NavIcon } from './NavIcon'
import type { NavIconName } from './NavIcon'

const NAV_ITEMS: { to: string; label: string; icon: NavIconName; adminOnly: boolean }[] = [
  { to: '/dashboard/sales',    label: 'Dashboard',   icon: 'dashboard', adminOnly: false },
  { to: '/dashboard/sales/daily-report', label: 'Daily Report', icon: 'calendar', adminOnly: false },
  { to: '/dashboard/services', label: 'Services',    icon: 'wrench', adminOnly: false },
  { to: '/dashboard/finance',  label: 'Finance',     icon: 'finance', adminOnly: false },
  { to: '/dashboard/devices',  label: 'Device',      icon: 'device', adminOnly: false },
  { to: '/invoices',           label: 'Hóa đơn',     icon: 'invoice', adminOnly: false },
  { to: '/users',              label: 'Users',           icon: 'users', adminOnly: true },
  { to: '/settings/kpi',       label: 'Cai dat KPI',     icon: 'settings', adminOnly: true },
  { to: '/analytics/request-type', label: 'Loai yeu cau', icon: 'list', adminOnly: true },
]

const COLLAPSE_KEY = 'ht_sidebar_collapsed'

export function AppLayout() {
  const [open, setOpen]           = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')
  const { user, logout } = useAuth()

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  return (
    <div className="app-shell">
      {open && <div className="sidebar-overlay" onClick={() => setOpen(false)} />}

      <nav className={`sidebar${open ? ' sidebar--open' : ''}${collapsed ? ' sidebar--collapsed' : ''}`}>
        <div className="sidebar__brand">
          <span className="sidebar__brand-label">Hữu Toàn</span>
          <button
            className="sidebar__collapse-btn"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Mở rộng' : 'Thu nhỏ'}
          >
            <NavIcon name={collapsed ? 'chevron-right' : 'chevron-left'} size={16} />
          </button>
          <button className="sidebar__close" onClick={() => setOpen(false)}>✕</button>
        </div>
        <ul className="sidebar__nav">
          {NAV_ITEMS.filter(item => !item.adminOnly || (user?.is_admin ?? true)).map(item => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end
                className={({ isActive }) =>
                  'sidebar__link' + (isActive ? ' sidebar__link--active' : '')
                }
                onClick={() => setOpen(false)}
                title={collapsed ? item.label : undefined}
              >
                <NavIcon name={item.icon} />
                <span className="sidebar__link-label">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        {user && (
          <div className="sidebar__user">
            <div className="sidebar__user-label">
              <div className="sidebar__user-name">{user.name}</div>
              {user.department && (
                <div className="sidebar__user-territory">{user.department}</div>
              )}
              {user.territory && (
                <div className="sidebar__user-territory">{user.territory}</div>
              )}
            </div>
            <button className="sidebar__logout" onClick={logout} title={collapsed ? 'Đăng xuất' : undefined}>
              <NavIcon name="logout" size={16} />
              <span className="sidebar__logout-label">Đăng xuất</span>
            </button>
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
