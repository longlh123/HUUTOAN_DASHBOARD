import { useEffect, useMemo, useState } from 'react'
import type { UserDetail } from '../api/sales'
import { fetchUserList, updateUser } from '../api/sales'

const PAGE_SIZE = 20

type EditForm = {
  business_unit_id: string
  department_id:    string
  territory_id:     string
  cost_center_id:   string
  is_disabled:      boolean
}

type DimOption = { id: string; name: string }

export function UsersPage() {
  const [users,      setUsers]      = useState<UserDetail[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [search,     setSearch]     = useState('')
  const [department, setDepartment] = useState('')
  const [territory,  setTerritory]  = useState('')
  const [page,       setPage]       = useState(1)

  const [editUser,  setEditUser]  = useState<UserDetail | null>(null)
  const [editForm,  setEditForm]  = useState<EditForm>({ business_unit_id: '', department_id: '', territory_id: '', cost_center_id: '', is_disabled: false })
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    fetchUserList()
      .then(setUsers)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [])

  const departments = useMemo(() =>
    ['', ...Array.from(new Set(users.map(u => u.department).filter(Boolean))).sort()],
    [users]
  )
  const territories = useMemo(() =>
    ['', ...Array.from(new Set(users.map(u => u.territory).filter(Boolean))).sort()],
    [users]
  )

  const deptOptions = useMemo<DimOption[]>(() => {
    const map = new Map<string, string>()
    users.forEach(u => { if (u.department_id && u.department) map.set(u.department_id, u.department) })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [users])

  const terrOptions = useMemo<DimOption[]>(() => {
    const map = new Map<string, string>()
    users.forEach(u => { if (u.territory_id && u.territory) map.set(u.territory_id, u.territory) })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [users])

  const ccOptions = useMemo<DimOption[]>(() => {
    const map = new Map<string, string>()
    users.forEach(u => { if (u.cost_center_id && u.cost_center) map.set(u.cost_center_id, u.cost_center) })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [users])

  const buOptions = useMemo<DimOption[]>(() => {
    const map = new Map<string, string>()
    users.forEach(u => { if (u.business_unit_id && u.business_unit) map.set(u.business_unit_id, u.business_unit) })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [users])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return users.filter(u =>
      (!department || u.department === department) &&
      (!territory  || u.territory  === territory)  &&
      (!q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    )
  }, [users, search, department, territory])

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const rows        = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function reset() { setPage(1) }

  function openEdit(u: UserDetail) {
    setEditUser(u)
    setEditForm({
      business_unit_id: u.business_unit_id ?? '',
      department_id:    u.department_id    ?? '',
      territory_id:     u.territory_id     ?? '',
      cost_center_id:   u.cost_center_id   ?? '',
      is_disabled:      u.is_disabled,
    })
    setSaveError(null)
  }

  async function handleSave() {
    if (!editUser) return
    setSaving(true)
    setSaveError(null)
    try {
      await updateUser(editUser.id, {
        business_unit_id: editForm.business_unit_id || null,
        department_id:    editForm.department_id    || null,
        territory_id:     editForm.territory_id     || null,
        cost_center_id:   editForm.cost_center_id   || null,
        is_disabled:      editForm.is_disabled,
      })
      setUsers(prev => prev.map(u => u.id !== editUser.id ? u : {
        ...u,
        is_disabled:      editForm.is_disabled,
        business_unit_id: editForm.business_unit_id || null,
        business_unit:    buOptions.find(o => o.id === editForm.business_unit_id)?.name  ?? u.business_unit,
        department_id:    editForm.department_id    || null,
        department:       deptOptions.find(o => o.id === editForm.department_id)?.name   ?? u.department,
        territory_id:     editForm.territory_id     || null,
        territory:        terrOptions.find(o => o.id === editForm.territory_id)?.name    ?? u.territory,
        cost_center_id:   editForm.cost_center_id   || null,
        cost_center:      ccOptions.find(o => o.id === editForm.cost_center_id)?.name    ?? u.cost_center,
      }))
      setEditUser(null)
    } catch (e) {
      setSaveError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard__header" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <h1 className="dashboard__title">Danh sách nhân viên</h1>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              className="kpi-settings__year-select"
              style={{ width: 'auto', minWidth: 160 }}
              value={department}
              onChange={e => { setDepartment(e.target.value); reset() }}
            >
              <option value="">Tất cả phòng ban</option>
              {departments.filter(Boolean).map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <select
              className="kpi-settings__year-select"
              style={{ width: 'auto', minWidth: 140 }}
              value={territory}
              onChange={e => { setTerritory(e.target.value); reset() }}
            >
              <option value="">Tất cả vùng</option>
              {territories.filter(Boolean).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <input
            className="kpi-settings__input"
            type="search"
            placeholder="Tìm tên, email..."
            value={search}
            onChange={e => { setSearch(e.target.value); reset() }}
            style={{ width: 240, textAlign: 'left' }}
          />
        </div>
      </div>

      {error && <div className="dashboard__error">{error}</div>}

      <div className="card">
        {loading ? (
          <p className="table-placeholder">Đang tải...</p>
        ) : filtered.length === 0 ? (
          <p className="table-placeholder">Không tìm thấy nhân viên nào.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="leaderboard">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Họ tên</th>
                    <th>Title</th>
                    <th>Email</th>
                    <th>Mobile</th>
                    <th style={{ textAlign: 'center' }}>D365 Status</th>
                    <th style={{ textAlign: 'center' }}>Azure Status</th>
                    <th>Business Unit</th>
                    <th>F3 Phòng ban</th>
                    <th>F5 Vùng</th>
                    <th>F4 Cost Center</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u, i) => (
                    <tr key={u.id}>
                      <td className="leaderboard__rank">{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="leaderboard__name">{u.full_name || '—'}</td>
                      <td>{u.title || '—'}</td>
                      <td>{u.email || '—'}</td>
                      <td>{u.mobile || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`win-rate ${u.is_disabled ? 'win-rate--low' : 'win-rate--high'}`}>
                          {u.is_disabled ? 'Disabled' : 'Active'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`win-rate ${u.azure_state === 0 ? 'win-rate--high' : 'win-rate--low'}`}>
                          {u.azure_state === 0 ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td>{u.business_unit || '—'}</td>
                      <td>{u.department || <span style={{ color: '#ea580c' }}>Thiếu</span>}</td>
                      <td>{u.territory || <span style={{ color: '#ea580c' }}>Thiếu</span>}</td>
                      <td>{u.cost_center || '—'}</td>
                      <td>
                        <button
                          className="leaderboard__page-btn"
                          style={{ fontSize: 13, padding: '2px 10px' }}
                          onClick={() => openEdit(u)}
                        >
                          Sửa
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="leaderboard__pagination">
                <button
                  className="leaderboard__page-btn"
                  disabled={currentPage === 1}
                  onClick={() => setPage(p => p - 1)}
                >←</button>
                <span className="leaderboard__page-info">
                  {currentPage} / {totalPages} ({filtered.length} người)
                </span>
                <button
                  className="leaderboard__page-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => setPage(p => p + 1)}
                >→</button>
              </div>
            )}
          </>
        )}
      </div>

      {editUser && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={e => { if (e.target === e.currentTarget) setEditUser(null) }}
        >
          <div className="card" style={{ width: 440, maxWidth: '92vw', margin: 0, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 className="card__title" style={{ margin: 0 }}>Chỉnh sửa — {editUser.full_name}</h2>
              <button className="sidebar__close" onClick={() => setEditUser(null)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                Business Unit
                <select
                  className="kpi-settings__year-select"
                  style={{ width: '100%' }}
                  value={editForm.business_unit_id}
                  onChange={e => setEditForm(f => ({ ...f, business_unit_id: e.target.value }))}
                >
                  <option value="">— Chọn business unit —</option>
                  {buOptions.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                F3 Phòng ban
                <select
                  className="kpi-settings__year-select"
                  style={{ width: '100%' }}
                  value={editForm.department_id}
                  onChange={e => setEditForm(f => ({ ...f, department_id: e.target.value }))}
                >
                  <option value="">— Chọn phòng ban —</option>
                  {deptOptions.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                F5 Vùng
                <select
                  className="kpi-settings__year-select"
                  style={{ width: '100%' }}
                  value={editForm.territory_id}
                  onChange={e => setEditForm(f => ({ ...f, territory_id: e.target.value }))}
                >
                  <option value="">— Chọn vùng —</option>
                  {terrOptions.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                F4 Cost Center
                <select
                  className="kpi-settings__year-select"
                  style={{ width: '100%' }}
                  value={editForm.cost_center_id}
                  onChange={e => setEditForm(f => ({ ...f, cost_center_id: e.target.value }))}
                >
                  <option value="">— Chọn cost center —</option>
                  {ccOptions.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                D365 Status
                <select
                  className="kpi-settings__year-select"
                  style={{ width: '100%' }}
                  value={editForm.is_disabled ? '1' : '0'}
                  onChange={e => setEditForm(f => ({ ...f, is_disabled: e.target.value === '1' }))}
                >
                  <option value="0">Active</option>
                  <option value="1">Disabled</option>
                </select>
              </label>
            </div>

            {saveError && (
              <p style={{ color: '#ea580c', fontSize: 13, marginTop: 12 }}>{saveError}</p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button
                className="leaderboard__page-btn"
                onClick={() => setEditUser(null)}
                disabled={saving}
              >
                Hủy
              </button>
              <button
                className="kpi-settings__save-btn"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
