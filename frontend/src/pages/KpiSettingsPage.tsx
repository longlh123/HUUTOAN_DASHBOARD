import { useEffect, useRef, useState } from 'react'
import type { CrmUser, KpiPerformance, KpiTarget } from '../api/sales'
import {
  createKpiTarget,
  deleteKpiTarget,
  fetchCrmUsers,
  fetchKpiPerformance,
  fetchKpiTargets,
  updateKpiTarget,
} from '../api/sales'
import { fmtVNDFull } from '../utils/format'

const CURRENT_YEAR    = new Date().getFullYear()
const CURRENT_QUARTER = `q${Math.ceil((new Date().getMonth() + 1) / 3)}` as 'q1' | 'q2' | 'q3' | 'q4'
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i)


function toStr(v: number | null): string {
  return v ? v.toLocaleString('vi-VN') : ''
}

function formatInput(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  const n = parseInt(digits, 10)
  return isNaN(n) ? '' : n.toLocaleString('vi-VN')
}

function fromStr(s: string): number | null {
  const digits = s.replace(/\./g, '').replace(/\s/g, '')
  const n = parseInt(digits, 10)
  return isNaN(n) || n <= 0 ? null : n
}

type EditState = { q1: string; q2: string; q3: string; q4: string }

function targetToEdit(t: KpiTarget): EditState {
  return { q1: toStr(t.q1), q2: toStr(t.q2), q3: toStr(t.q3), q4: toStr(t.q4) }
}

type NewRow = { crm_user_id: string; user_name: string; q1: string; q2: string; q3: string; q4: string }

// ── Combobox ─────────────────────────────────────────────────────────────────
function UserCombobox({
  users,
  value,
  onChange,
}: {
  users:    CrmUser[]
  value:    CrmUser | null
  onChange: (u: CrmUser) => void
}) {
  const [query,  setQuery]  = useState(value?.name ?? '')
  const [open,   setOpen]   = useState(false)
  const wrapRef             = useRef<HTMLDivElement>(null)

  const filtered = query.trim() === ''
    ? users
    : users.filter(u =>
        u.name.toLowerCase().includes(query.toLowerCase()) ||
        u.team.toLowerCase().includes(query.toLowerCase())
      )

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery(value?.name ?? '')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [value])

  function select(u: CrmUser) {
    onChange(u)
    setQuery(u.name)
    setOpen(false)
  }

  return (
    <div className="combobox" ref={wrapRef}>
      <input
        className="kpi-settings__input combobox__input"
        type="text"
        placeholder="Tìm nhân viên..."
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="combobox__list">
          {filtered.map(u => (
            <li
              key={u.id}
              className={`combobox__item${value?.id === u.id ? ' combobox__item--active' : ''}`}
              onMouseDown={() => select(u)}
            >
              <span className="combobox__item-name">{u.name}</span>
              <span className="combobox__item-meta">{u.team} · {u.territory}</span>
            </li>
          ))}
        </ul>
      )}
      {open && filtered.length === 0 && (
        <div className="combobox__empty">Không tìm thấy</div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function KpiSettingsPage() {
  const [tab,        setTab]        = useState<'targets' | 'performance'>('targets')
  const [year,       setYear]       = useState(CURRENT_YEAR)
  const [targets,    setTargets]    = useState<KpiTarget[]>([])
  const [users,      setUsers]      = useState<CrmUser[]>([])
  const [edits,      setEdits]      = useState<Record<string, EditState>>({})
  const [saving,     setSaving]     = useState<Record<string, boolean>>({})
  const [deleting,   setDeleting]   = useState<Record<string, boolean>>({})
  const [newRow,     setNewRow]     = useState<NewRow | null>(null)
  const [adding,     setAdding]     = useState(false)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [perf,        setPerf]        = useState<KpiPerformance[]>([])
  const [perfLoading, setPerfLoading] = useState(false)
  const [perfQuarter, setPerfQuarter] = useState<'all' | 'q1' | 'q2' | 'q3' | 'q4'>(CURRENT_QUARTER)

  useEffect(() => {
    setLoading(true)
    setNewRow(null)
    Promise.all([fetchKpiTargets(year), fetchCrmUsers()])
      .then(([ts, us]) => {
        setTargets(ts)
        setEdits(Object.fromEntries(ts.map(t => [t.id, targetToEdit(t)])))
        setUsers(us)
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [year])

  useEffect(() => {
    if (tab !== 'performance') return
    setPerfLoading(true)
    fetchKpiPerformance(year)
      .then(setPerf)
      .catch(e => setError((e as Error).message))
      .finally(() => setPerfLoading(false))
  }, [tab, year])

  const usedIds   = new Set(targets.map(t => t.crm_user_id))
  const available = users.filter(u => !usedIds.has(u.id))

  function startAdd() {
    setNewRow({ crm_user_id: '', user_name: '', q1: '', q2: '', q3: '', q4: '' })
  }

  function cancelAdd() {
    setNewRow(null)
  }

  async function confirmAdd() {
    if (!newRow?.crm_user_id) return
    setAdding(true)
    setError(null)
    try {
      const created = await createKpiTarget({
        crm_user_id: newRow.crm_user_id,
        user_name:   newRow.user_name,
        year:        year,
        q1:          fromStr(newRow.q1),
        q2:          fromStr(newRow.q2),
        q3:          fromStr(newRow.q3),
        q4:          fromStr(newRow.q4),
      })
      setTargets(prev => [...prev, created])
      setEdits(prev => ({ ...prev, [created.id]: targetToEdit(created) }))
      setNewRow(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAdding(false)
    }
  }

  async function saveRow(id: string) {
    setSaving(prev => ({ ...prev, [id]: true }))
    setError(null)
    try {
      const e       = edits[id]
      const updated = await updateKpiTarget(id, {
        year: year,
        q1:   fromStr(e.q1),
        q2:   fromStr(e.q2),
        q3:   fromStr(e.q3),
        q4:   fromStr(e.q4),
      })
      setTargets(prev => prev.map(t => t.id === id ? updated : t))
      setEdits(prev => ({ ...prev, [id]: targetToEdit(updated) }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(prev => ({ ...prev, [id]: false }))
    }
  }

  async function removeRow(id: string) {
    setDeleting(prev => ({ ...prev, [id]: true }))
    try {
      await deleteKpiTarget(id, year)
      setTargets(prev => prev.filter(t => t.id !== id))
      setEdits(prev => { const n = { ...prev }; delete n[id]; return n })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDeleting(prev => ({ ...prev, [id]: false }))
    }
  }

  const newRowSum = newRow
    ? (['q1', 'q2', 'q3', 'q4'] as const).reduce((acc, q) => acc + (fromStr(newRow[q]) ?? 0), 0)
    : 0

  const totalSum = targets.reduce((acc, t) => {
    const e = edits[t.id] ?? targetToEdit(t)
    return acc + (['q1', 'q2', 'q3', 'q4'] as const).reduce((s, q) => s + (fromStr(e[q]) ?? 0), 0)
  }, 0) + newRowSum

  if (loading) return <div className="dashboard"><p className="table-placeholder">Đang tải...</p></div>

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <div className="dashboard__title-row">
          <div className="date-filter__presets">
            <button
              className={`date-filter__btn${tab === 'targets' ? ' date-filter__btn--active' : ''}`}
              onClick={() => setTab('targets')}
            >Đặt mục tiêu</button>
            <button
              className={`date-filter__btn${tab === 'performance' ? ' date-filter__btn--active' : ''}`}
              onClick={() => setTab('performance')}
            >Hiệu suất</button>
          </div>
          <div className="kpi-settings__header-actions">
            <select
              className="kpi-settings__year-select"
              value={year}
              onChange={e => setYear(Number(e.target.value))}
            >
              {YEAR_OPTIONS.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            {tab === 'targets' && (
              <button
                className="kpi-settings__add-btn"
                onClick={startAdd}
                disabled={!!newRow || available.length === 0}
              >
                + Thêm
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="dashboard__error">{error}</div>}

      {tab === 'targets' && <div className="card">
        <div className="kpi-settings__total-bar">
          <span className="kpi-settings__total-label">Tổng KPI cả năm ({targets.length + (newRow ? 1 : 0)} thành viên)</span>
          <span className="kpi-settings__total-value">{totalSum > 0 ? fmtVNDFull(totalSum) : '—'}</span>
        </div>
        <table className="leaderboard kpi-settings__table">
          <thead>
            <tr>
              <th>Nhân viên</th>
              <th style={{ textAlign: 'right' }}>Q1</th>
              <th style={{ textAlign: 'right' }}>Q2</th>
              <th style={{ textAlign: 'right' }}>Q3</th>
              <th style={{ textAlign: 'right' }}>Q4</th>
              <th style={{ textAlign: 'right' }}>Cả năm</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {targets.map(t => {
              const e   = edits[t.id] ?? targetToEdit(t)
              const sum = (['q1', 'q2', 'q3', 'q4'] as const)
                .reduce((acc, q) => acc + (fromStr(e[q]) ?? 0), 0)
              return (
                <tr key={t.id}>
                  <td className="leaderboard__name">{t.user_name}</td>
                  {(['q1', 'q2', 'q3', 'q4'] as const).map(q => (
                    <td key={q} style={{ textAlign: 'right' }}>
                      <input
                        className="kpi-settings__input kpi-settings__input--sm"
                        type="text"
                        inputMode="numeric"
                        placeholder="—"
                        value={e[q]}
                        onChange={ev => setEdits(prev => ({
                          ...prev,
                          [t.id]: { ...prev[t.id], [q]: formatInput(ev.target.value) },
                        }))}
                      />
                    </td>
                  ))}
                  <td className="leaderboard__value">{sum > 0 ? fmtVNDFull(sum) : '—'}</td>
                  <td className="kpi-settings__actions-cell">
                    <button
                      className="kpi-settings__save-btn"
                      onClick={() => saveRow(t.id)}
                      disabled={saving[t.id]}
                    >
                      {saving[t.id] ? '...' : 'Lưu'}
                    </button>
                    <button
                      className="kpi-settings__del-btn"
                      onClick={() => removeRow(t.id)}
                      disabled={deleting[t.id]}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              )
            })}

            {newRow && (
              <tr className="kpi-settings__new-row">
                <td style={{ minWidth: 220 }}>
                  <UserCombobox
                    users={available}
                    value={available.find(u => u.id === newRow.crm_user_id) ?? null}
                    onChange={u => setNewRow(prev => prev
                      ? { ...prev, crm_user_id: u.id, user_name: u.name }
                      : null
                    )}
                  />
                </td>
                {(['q1', 'q2', 'q3', 'q4'] as const).map(q => (
                  <td key={q} style={{ textAlign: 'right' }}>
                    <input
                      className="kpi-settings__input kpi-settings__input--sm"
                      type="text"
                      inputMode="numeric"
                      placeholder="—"
                      value={newRow[q]}
                      onChange={e => setNewRow(prev => prev ? { ...prev, [q]: formatInput(e.target.value) } : null)}
                    />
                  </td>
                ))}
                <td className="leaderboard__value">{newRowSum > 0 ? fmtVNDFull(newRowSum) : '—'}</td>
                <td className="kpi-settings__actions-cell">
                  <button
                    className="kpi-settings__save-btn"
                    onClick={confirmAdd}
                    disabled={adding || !newRow.crm_user_id}
                  >
                    {adding ? '...' : 'Lưu'}
                  </button>
                  <button className="kpi-settings__del-btn" onClick={cancelAdd}>✕</button>
                </td>
              </tr>
            )}

            {targets.length === 0 && !newRow && (
              <tr>
                <td colSpan={7} className="table-placeholder">
                  Chưa có KPI nào. Nhấn "+ Thêm" để bắt đầu.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>}

      {tab === 'performance' && (
        <div className="card">
          <div className="date-filter__presets" style={{ marginBottom: 16 }}>
            {(['all', 'q1', 'q2', 'q3', 'q4'] as const).map(q => (
              <button
                key={q}
                className={`date-filter__btn${perfQuarter === q ? ' date-filter__btn--active' : ''}`}
                onClick={() => setPerfQuarter(q)}
              >
                {q === 'all' ? 'Cả năm' : q.toUpperCase()}
              </button>
            ))}
          </div>
          {perfLoading
            ? <p className="table-placeholder">Đang tải...</p>
            : perf.length === 0
              ? <p className="table-placeholder">Chưa có dữ liệu KPI cho năm {year}.</p>
              : <table className="leaderboard kpi-settings__table kpi-perf__table">
                  <thead>
                    <tr>
                      <th>Nhân viên</th>
                      <th style={{ textAlign: 'right' }}>Mục tiêu</th>
                      <th style={{ textAlign: 'right' }}>Thực tế</th>
                      <th style={{ textAlign: 'right' }}>% Đạt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perf.map(row => {
                      const tgt = perfQuarter === 'all'
                        ? (['q1', 'q2', 'q3', 'q4'] as const).reduce((s, q) => s + row.quarters[q].effective, 0)
                        : row.quarters[perfQuarter].effective
                      const act = perfQuarter === 'all'
                        ? (['q1', 'q2', 'q3', 'q4'] as const).reduce((s, q) => s + row.quarters[q].actual, 0)
                        : row.quarters[perfQuarter].actual
                      const pct    = tgt > 0 ? act / tgt : 0
                      const actCls = act === 0 ? 'kpi-perf__actual--zero' : pct >= 1 ? 'kpi-perf__actual--ok' : 'kpi-perf__actual--behind'
                      return (
                        <tr key={row.user_id}>
                          <td className="leaderboard__name">{row.name}</td>
                          <td style={{ textAlign: 'right' }}>{tgt > 0 ? fmtVNDFull(tgt) : '—'}</td>
                          <td style={{ textAlign: 'right' }}>
                            <span className={actCls}>{act > 0 ? fmtVNDFull(act) : '—'}</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span className={actCls}>{tgt > 0 ? `${(pct * 100).toFixed(1)}%` : '—'}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="kpi-perf__total-row">
                      <td><strong>Tổng</strong></td>
                      {(() => {
                        const totTgt = perf.reduce((s, r) => s + (perfQuarter === 'all'
                          ? (['q1', 'q2', 'q3', 'q4'] as const).reduce((qs, q) => qs + r.quarters[q].effective, 0)
                          : r.quarters[perfQuarter].effective), 0)
                        const totAct = perf.reduce((s, r) => s + (perfQuarter === 'all'
                          ? (['q1', 'q2', 'q3', 'q4'] as const).reduce((qs, q) => qs + r.quarters[q].actual, 0)
                          : r.quarters[perfQuarter].actual), 0)
                        const pct = totTgt > 0 ? totAct / totTgt : 0
                        const cls = totAct === 0 ? 'kpi-perf__actual--zero' : pct >= 1 ? 'kpi-perf__actual--ok' : 'kpi-perf__actual--behind'
                        return <>
                          <td style={{ textAlign: 'right' }}><strong>{fmtVNDFull(totTgt)}</strong></td>
                          <td style={{ textAlign: 'right' }}><strong className={cls}>{fmtVNDFull(totAct)}</strong></td>
                          <td style={{ textAlign: 'right' }}><strong className={cls}>{totTgt > 0 ? `${(pct * 100).toFixed(1)}%` : '—'}</strong></td>
                        </>
                      })()}
                    </tr>
                  </tfoot>
                </table>
          }
        </div>
      )}
    </div>
  )
}
