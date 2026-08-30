import { useEffect, useRef, useState } from 'react'
import type { CrmUser, KpiCompanyTarget, KpiPerformance, KpiTarget, KpiTeamTarget, UserDetail } from '../api/sales'
import {
  createKpiTarget,
  createKpiTeamTarget,
  deleteKpiTarget,
  deleteKpiTeamTarget,
  fetchCrmUsers,
  fetchKpiCompanyTarget,
  fetchKpiPerformance,
  fetchKpiTargets,
  fetchKpiTeamTargets,
  fetchUserList,
  saveKpiCompanyTarget,
  updateKpiTarget,
  updateKpiTeamTarget,
} from '../api/sales'
import { fmtVNDFull } from '../utils/format'

const CURRENT_YEAR    = new Date().getFullYear()
const CURRENT_QUARTER = `q${Math.ceil((new Date().getMonth() + 1) / 3)}` as 'q1' | 'q2' | 'q3' | 'q4'
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i)

type TeamEditState = { q1: string; q2: string; q3: string; q4: string }

function teamTargetToEdit(t: KpiTeamTarget): TeamEditState {
  return { q1: toStr(t.q1), q2: toStr(t.q2), q3: toStr(t.q3), q4: toStr(t.q4) }
}

function teamRowSum(e: TeamEditState): number {
  return (['q1', 'q2', 'q3', 'q4'] as const).reduce((acc, q) => acc + (fromStr(e[q]) ?? 0), 0)
}

type NewTeamRow = { team_id: string; team_name: string; q1: string; q2: string; q3: string; q4: string }
type TeamOption = { id: string; name: string }


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

type EditState = { team_id: string; team_name: string; q1: string; q2: string; q3: string; q4: string }

function targetToEdit(t: KpiTarget): EditState {
  return {
    team_id:   t.team_id ?? '',
    team_name: t.team_name ?? '',
    q1: toStr(t.q1), q2: toStr(t.q2), q3: toStr(t.q3), q4: toStr(t.q4),
  }
}

type NewRow = { crm_user_id: string; user_name: string; team_id: string; team_name: string; q1: string; q2: string; q3: string; q4: string }

// Icon riêng cho nút Xóa — tách khỏi ✕ (Hủy) để không nhầm giữa "hủy sửa" và "xóa hẳn".
function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

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
              <span className="combobox__item-meta">
                {u.team} · {u.territory}
                {!u.department && <span style={{ color: '#ea580c' }}> · Chưa gán phòng ban</span>}
              </span>
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

function TeamCombobox({
  teams,
  value,
  onChange,
}: {
  teams:    TeamOption[]
  value:    TeamOption | null
  onChange: (t: TeamOption) => void
}) {
  const [query,  setQuery]  = useState(value?.name ?? '')
  const [open,   setOpen]   = useState(false)
  const wrapRef             = useRef<HTMLDivElement>(null)

  const filtered = query.trim() === ''
    ? teams
    : teams.filter(t => t.name.toLowerCase().includes(query.toLowerCase()))

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

  function select(t: TeamOption) {
    onChange(t)
    setQuery(t.name)
    setOpen(false)
  }

  return (
    <div className="combobox" ref={wrapRef}>
      <input
        className="kpi-settings__input combobox__input"
        type="text"
        placeholder="Tìm team..."
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="combobox__list">
          {filtered.map(t => (
            <li
              key={t.id}
              className={`combobox__item${value?.id === t.id ? ' combobox__item--active' : ''}`}
              onMouseDown={() => select(t)}
            >
              <span className="combobox__item-name">{t.name}</span>
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
  const [teamFilter, setTeamFilter] = useState<string>('ALL')
  const [nameFilter, setNameFilter] = useState('')
  const [targets,    setTargets]    = useState<KpiTarget[]>([])
  const [users,      setUsers]      = useState<CrmUser[]>([])
  const [edits,        setEdits]        = useState<Record<string, EditState>>({})
  const [editingRows,  setEditingRows]  = useState<Set<string>>(new Set())
  const [saving,     setSaving]     = useState<Record<string, boolean>>({})
  const [deleting,   setDeleting]   = useState<Record<string, boolean>>({})
  const [newRow,     setNewRow]     = useState<NewRow | null>(null)
  const [adding,     setAdding]     = useState(false)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [perf,        setPerf]        = useState<KpiPerformance[]>([])
  const [perfLoading, setPerfLoading] = useState(false)
  const [perfQuarter, setPerfQuarter] = useState<'all' | 'q1' | 'q2' | 'q3' | 'q4'>(CURRENT_QUARTER)
  const [userDetails, setUserDetails] = useState<UserDetail[]>([])

  const [companyTarget,        setCompanyTarget]        = useState<KpiCompanyTarget | null>(null)
  const [companyTargetInput,   setCompanyTargetInput]   = useState('')
  const [savingCompanyTarget,  setSavingCompanyTarget]  = useState(false)
  const [teamTargets,          setTeamTargets]          = useState<KpiTeamTarget[]>([])
  const [teamEdits,            setTeamEdits]            = useState<Record<number, TeamEditState>>({})
  const [editingTeamRows,      setEditingTeamRows]      = useState<Set<number>>(new Set())
  const [teamSaving,           setTeamSaving]           = useState<Record<number, boolean>>({})
  const [teamDeleting,         setTeamDeleting]         = useState<Record<number, boolean>>({})
  const [newTeamRow,           setNewTeamRow]           = useState<NewTeamRow | null>(null)
  const [addingTeamRow,        setAddingTeamRow]        = useState(false)

  useEffect(() => {
    fetchUserList().then(setUserDetails).catch(() => {})
  }, [])

  const statusById = new Map(userDetails.map(u => [u.id, u]))

  useEffect(() => {
    setLoading(true)
    setNewRow(null)
    setNewTeamRow(null)
    // Team filter chọn ở năm cũ có thể không còn tồn tại ở năm mới (chưa có target team) — reset
    // về "Tất cả team" để tránh label/filter kẹt vào 1 team đã không còn hợp lệ.
    setTeamFilter('ALL')
    Promise.all([fetchKpiTargets(year), fetchCrmUsers(), fetchKpiCompanyTarget(year), fetchKpiTeamTargets(year)])
      .then(([ts, us, ct, tts]) => {
        setTargets(ts)
        setEdits(Object.fromEntries(ts.map(t => [t.id, targetToEdit(t)])))
        setUsers(us)
        setCompanyTarget(ct)
        setCompanyTargetInput(ct ? toStr(ct.target_amount) : '')
        setTeamTargets(tts)
        setTeamEdits(Object.fromEntries(tts.map(t => [t.id, teamTargetToEdit(t)])))
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

  const teamOptions: TeamOption[] = Array.from(
    new Map(users.filter(u => u.team_id).map(u => [u.team_id, { id: u.team_id, name: u.team }])).values()
  ).sort((a, b) => a.name.localeCompare(b.name))

  const teamFilterName = teamOptions.find(t => t.id === teamFilter)?.name ?? ''

  function changeTeam(teamId: string) {
    setTeamFilter(teamId)
    setNewRow(null)
  }

  const teamTargetIds = new Set(teamTargets.map(t => t.team_id))
  // Chỉ cho lọc theo team đã có target team ở bảng trên — team chưa nhập KPI
  // thì không có gì để lọc/đối chiếu trong bảng KPI cá nhân bên dưới.
  const filterableTeamOptions = teamOptions.filter(t => teamTargetIds.has(t.id))

  const usedIds   = new Set(targets.map(t => t.crm_user_id))
  const available = users.filter(u =>
    !usedIds.has(u.id) &&
    // Cho chon: (a) user thuộc 1 team đã có target team ở bảng trên, HOẶC (b) user chưa có
    // team CRM nào (vd CCO) — trường hợp này gán team hoàn toàn qua ô Team ở dòng thêm mới,
    // không lọc theo team_id sống vì mục đích của cột Team là để gán độc lập với team CRM.
    // Không giới hạn theo teamFilter đang xem — đang xem team A vẫn được chọn người ở team B
    // rồi gán qua team A (đúng case chuyển target cho người ngoài team).
    (!u.team_id || teamTargetIds.has(u.team_id))
  )

  // Team ma target duoc TINH VAO (luu tren chinh row target) — khong join song qua CRM team
  // cua nguoi giu target, vi target co the da duoc chuyen cho nguoi ngoai team.
  const targetTeamById = new Map(targets.map(t => [t.crm_user_id, t.team_id]))

  const filteredTargets = targets.filter(t =>
    (teamFilter === 'ALL' || t.team_id === teamFilter) &&
    (!nameFilter.trim() || t.user_name.toLowerCase().includes(nameFilter.trim().toLowerCase()))
  )

  const filteredPerf = perf.filter(r =>
    (teamFilter === 'ALL' || targetTeamById.get(r.user_id) === teamFilter) &&
    (!nameFilter.trim() || r.name.toLowerCase().includes(nameFilter.trim().toLowerCase()))
  )

  function startAdd() {
    // Đang xem 1 team cụ thể → mặc định gán luôn vào team đó (đúng ý định "thêm người vào team này"),
    // kể cả khi người được chọn sau đó thuộc team CRM khác.
    const defaultTeam = teamFilter !== 'ALL' ? filterableTeamOptions.find(o => o.id === teamFilter) : null
    setNewRow({
      crm_user_id: '', user_name: '',
      team_id: defaultTeam?.id ?? '', team_name: defaultTeam?.name ?? '',
      q1: '', q2: '', q3: '', q4: '',
    })
  }

  function cancelAdd() {
    setNewRow(null)
  }

  async function confirmAdd() {
    if (!newRow?.crm_user_id || !newRow.team_id) return
    setAdding(true)
    setError(null)
    try {
      const created = await createKpiTarget({
        crm_user_id: newRow.crm_user_id,
        user_name:   newRow.user_name,
        team_id:     newRow.team_id,
        team_name:   newRow.team_name,
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

  function startEditRow(id: string) {
    setEditingRows(prev => new Set(prev).add(id))
  }

  function cancelEditRow(id: string, original: KpiTarget) {
    setEdits(prev => ({ ...prev, [id]: targetToEdit(original) }))
    setEditingRows(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  async function saveRow(id: string) {
    setSaving(prev => ({ ...prev, [id]: true }))
    setError(null)
    try {
      const e       = edits[id]
      const updated = await updateKpiTarget(id, {
        year: year,
        team_id:   e.team_id,
        team_name: e.team_name,
        q1:   fromStr(e.q1),
        q2:   fromStr(e.q2),
        q3:   fromStr(e.q3),
        q4:   fromStr(e.q4),
      })
      setTargets(prev => prev.map(t => t.id === id ? updated : t))
      setEdits(prev => ({ ...prev, [id]: targetToEdit(updated) }))
      setEditingRows(prev => { const n = new Set(prev); n.delete(id); return n })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(prev => ({ ...prev, [id]: false }))
    }
  }

  function confirmRemoveRow(t: KpiTarget) {
    if (window.confirm(`Xóa KPI của "${t.user_name}"?`)) removeRow(t.id)
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

  async function saveCompanyTarget() {
    const amount = fromStr(companyTargetInput)
    if (!amount) return
    setSavingCompanyTarget(true)
    setError(null)
    try {
      const saved = await saveKpiCompanyTarget(year, amount)
      setCompanyTarget(saved)
      setCompanyTargetInput(toStr(saved.target_amount))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSavingCompanyTarget(false)
    }
  }

  function startAddTeamRow() {
    setNewTeamRow({ team_id: '', team_name: '', q1: '', q2: '', q3: '', q4: '' })
  }

  function cancelAddTeamRow() {
    setNewTeamRow(null)
  }

  async function confirmAddTeamRow() {
    if (!newTeamRow?.team_id) return
    setAddingTeamRow(true)
    setError(null)
    try {
      const created = await createKpiTeamTarget({
        year,
        team_id:   newTeamRow.team_id,
        team_name: newTeamRow.team_name,
        q1: fromStr(newTeamRow.q1) ?? 0,
        q2: fromStr(newTeamRow.q2) ?? 0,
        q3: fromStr(newTeamRow.q3) ?? 0,
        q4: fromStr(newTeamRow.q4) ?? 0,
      })
      setTeamTargets(prev => [...prev, created])
      setTeamEdits(prev => ({ ...prev, [created.id]: teamTargetToEdit(created) }))
      setNewTeamRow(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAddingTeamRow(false)
    }
  }

  function startEditTeamRow(id: number) {
    setEditingTeamRows(prev => new Set(prev).add(id))
  }

  function cancelEditTeamRow(id: number, original: KpiTeamTarget) {
    setTeamEdits(prev => ({ ...prev, [id]: teamTargetToEdit(original) }))
    setEditingTeamRows(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  async function saveTeamRow(id: number) {
    setTeamSaving(prev => ({ ...prev, [id]: true }))
    setError(null)
    try {
      const e       = teamEdits[id]
      const updated = await updateKpiTeamTarget(id, {
        q1: fromStr(e.q1) ?? 0,
        q2: fromStr(e.q2) ?? 0,
        q3: fromStr(e.q3) ?? 0,
        q4: fromStr(e.q4) ?? 0,
      })
      setTeamTargets(prev => prev.map(t => t.id === id ? updated : t))
      setTeamEdits(prev => ({ ...prev, [id]: teamTargetToEdit(updated) }))
      setEditingTeamRows(prev => { const n = new Set(prev); n.delete(id); return n })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setTeamSaving(prev => ({ ...prev, [id]: false }))
    }
  }

  async function removeTeamRow(id: number) {
    setTeamDeleting(prev => ({ ...prev, [id]: true }))
    try {
      await deleteKpiTeamTarget(id)
      setTeamTargets(prev => prev.filter(t => t.id !== id))
      setTeamEdits(prev => { const n = { ...prev }; delete n[id]; return n })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setTeamDeleting(prev => ({ ...prev, [id]: false }))
    }
  }

  function exportKpiExcel() {
    const header = ['Team', 'Name', 'KPI Q1', 'KPI Q2', 'KPI Q3', 'KPI Q4', 'CA NAM']
    const rows = filteredTargets.map(t => {
      const team = t.team_name ?? ''
      const e    = edits[t.id] ?? targetToEdit(t)
      const q1   = fromStr(e.q1) ?? 0
      const q2   = fromStr(e.q2) ?? 0
      const q3   = fromStr(e.q3) ?? 0
      const q4   = fromStr(e.q4) ?? 0
      return [team, t.user_name, q1, q2, q3, q4, q1 + q2 + q3 + q4]
    })

    // Dung dau ";" lam delimiter (khong phai ",") vi Excel o may Windows/VN mac dinh
    // dung dau "," lam decimal separator, nen se hieu "," trong CSV la phan cach thap phan
    // chu khong phai phan cach cot, lam ca dong don vao 1 o.
    const escape = (v: string | number) => {
      const s = String(v)
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [header, ...rows].map(row => row.map(escape).join(';')).join('\r\n')

    // BOM de Excel doc dung UTF-8 (khong bi loi font tieng Viet)
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `kpi-targets-${year}${teamFilter !== 'ALL' ? `-${teamFilterName}` : ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const newRowSum = newRow
    ? (['q1', 'q2', 'q3', 'q4'] as const).reduce((acc, q) => acc + (fromStr(newRow[q]) ?? 0), 0)
    : 0

  const totalSum = filteredTargets.reduce((acc, t) => {
    const e = edits[t.id] ?? targetToEdit(t)
    return acc + (['q1', 'q2', 'q3', 'q4'] as const).reduce((s, q) => s + (fromStr(e[q]) ?? 0), 0)
  }, 0) + newRowSum

  // Tổng KPI cá nhân đã nhập cho từng team — không phụ thuộc teamFilter/nameFilter đang chọn,
  // dùng để hiện cột Status trên bảng Target theo Team (đối chiếu allocated vs target của mỗi team).
  const individualSumByTeam = new Map<string, number>()
  for (const t of targets) {
    if (!t.team_id) continue
    const e   = edits[t.id] ?? targetToEdit(t)
    const sum = (['q1', 'q2', 'q3', 'q4'] as const).reduce((acc, q) => acc + (fromStr(e[q]) ?? 0), 0)
    individualSumByTeam.set(t.team_id, (individualSumByTeam.get(t.team_id) ?? 0) + sum)
  }

  // Số thành viên đã được gán KPI vào từng team — chặn xóa target team khi vẫn còn thành viên,
  // tránh xóa "mồ côi" khiến các dòng KPI cá nhân mất mốc target để đối chiếu.
  const memberCountByTeam = new Map<string, number>()
  for (const t of targets) {
    if (!t.team_id) continue
    memberCountByTeam.set(t.team_id, (memberCountByTeam.get(t.team_id) ?? 0) + 1)
  }

  function confirmRemoveTeamRow(t: KpiTeamTarget) {
    const memberCount = memberCountByTeam.get(t.team_id) ?? 0
    if (memberCount > 0) {
      window.alert(`Không thể xóa — team "${t.team_name}" hiện có ${memberCount} thành viên đã được gán KPI. Gỡ hoặc chuyển hết KPI cá nhân của team này sang team khác trước khi xóa.`)
      return
    }
    if (window.confirm(`Xóa target team "${t.team_name}"?`)) removeTeamRow(t.id)
  }

  const newTeamRowSum = newTeamRow ? teamRowSum(newTeamRow) : 0
  const savedTeamTargetSum = teamTargets.reduce((acc, t) => acc + teamRowSum(teamEdits[t.id] ?? teamTargetToEdit(t)), 0)
  const teamAllocatedSum = savedTeamTargetSum + newTeamRowSum
  const teamVsCompanyDiff = companyTarget ? teamAllocatedSum - companyTarget.target_amount : 0

  // Target team đang đối chiếu với tổng KPI cá nhân — theo đúng team đang loc,
  // hoặc tổng tất cả team đã có target neu dang xem "Tất cả team".
  const currentTeamTarget = teamFilter === 'ALL'
    ? savedTeamTargetSum
    : (() => {
        const t = teamTargets.find(tt => tt.team_id === teamFilter)
        return t ? teamRowSum(teamEdits[t.id] ?? teamTargetToEdit(t)) : 0
      })()
  const individualVsTeamDiff = totalSum - currentTeamTarget

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
          </div>
        </div>
      </div>

      {error && <div className="dashboard__error">{error}</div>}

      {tab === 'targets' && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="kpi-settings__total-bar">
            <span className="kpi-settings__total-label">Target tổng công ty — năm {year}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 16px' }}>
            <input
              className="kpi-settings__input"
              type="text"
              inputMode="numeric"
              placeholder="Nhập target cả năm..."
              value={companyTargetInput}
              onChange={e => setCompanyTargetInput(formatInput(e.target.value))}
              style={{ width: 240, textAlign: 'left' }}
            />
            <button
              className="kpi-settings__save-btn"
              onClick={saveCompanyTarget}
              disabled={savingCompanyTarget || !fromStr(companyTargetInput)}
            >
              {savingCompanyTarget ? '...' : 'Lưu'}
            </button>
            {companyTarget && (
              <span style={{ color: 'var(--text)', fontSize: 13 }}>
                Đã lưu: <strong>{fmtVNDFull(companyTarget.target_amount)}</strong>
              </span>
            )}
          </div>
        </div>
      )}

      {tab === 'targets' && !companyTarget && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <p className="table-placeholder">Nhập target tổng công ty ở trên trước khi chia target cho từng team.</p>
        </div>
      )}

      {tab === 'targets' && companyTarget && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="kpi-settings__total-bar">
            <span className="kpi-settings__total-label">Target theo Team — năm {year} ({teamTargets.length + (newTeamRow ? 1 : 0)} team)</span>
            <span className="kpi-settings__total-value">{teamAllocatedSum > 0 ? fmtVNDFull(teamAllocatedSum) : '—'}</span>
          </div>
          <div style={{ padding: '8px 16px', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
            <span className={teamVsCompanyDiff === 0 ? 'kpi-perf__actual--ok' : 'kpi-perf__actual--behind'}>
              Đã phân bổ {fmtVNDFull(teamAllocatedSum)} / {fmtVNDFull(companyTarget.target_amount)} target công ty
              {teamVsCompanyDiff !== 0 && (
                <> ({teamVsCompanyDiff > 0 ? 'vượt' : 'thiếu'} {fmtVNDFull(Math.abs(teamVsCompanyDiff))})</>
              )}
            </span>
          </div>
          <table className="leaderboard kpi-settings__table">
            <thead>
              <tr>
                <th>Team</th>
                <th style={{ textAlign: 'center' }}>Trạng thái nhập KPI</th>
                <th style={{ textAlign: 'right' }}>Q1</th>
                <th style={{ textAlign: 'right' }}>Q2</th>
                <th style={{ textAlign: 'right' }}>Q3</th>
                <th style={{ textAlign: 'right' }}>Q4</th>
                <th style={{ textAlign: 'right' }}>Cả năm</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {teamTargets.map(t => {
                const e        = teamEdits[t.id] ?? teamTargetToEdit(t)
                const sum      = teamRowSum(e)
                const editing  = editingTeamRows.has(t.id)
                const allocated = individualSumByTeam.get(t.team_id) ?? 0
                const diff      = allocated - sum
                return (
                  <tr key={t.id}>
                    <td className="leaderboard__name">{t.team_name}</td>
                    <td style={{ textAlign: 'center' }}>
                      {allocated === 0
                        ? <span className="win-rate win-rate--low">Chưa nhập</span>
                        : diff === 0
                          ? <span className="win-rate win-rate--high">Đủ</span>
                          : diff < 0
                            ? <span className="win-rate win-rate--low">Thiếu {fmtVNDFull(Math.abs(diff))}</span>
                            : <span className="win-rate win-rate--mid">Vượt {fmtVNDFull(diff)}</span>
                      }
                    </td>
                    {(['q1', 'q2', 'q3', 'q4'] as const).map(q => (
                      <td key={q} style={{ textAlign: 'right' }}>
                        {editing
                          ? <input
                              className="kpi-settings__input kpi-settings__input--sm"
                              type="text"
                              inputMode="numeric"
                              placeholder="—"
                              value={e[q]}
                              onChange={ev => setTeamEdits(prev => ({
                                ...prev,
                                [t.id]: { ...prev[t.id], [q]: formatInput(ev.target.value) },
                              }))}
                            />
                          : (t[q] ? fmtVNDFull(t[q]) : '—')
                        }
                      </td>
                    ))}
                    <td className="leaderboard__value">{sum > 0 ? fmtVNDFull(sum) : '—'}</td>
                    <td className="kpi-settings__actions-cell">
                      {editing ? (
                        <>
                          <button
                            className="kpi-settings__save-btn"
                            onClick={() => saveTeamRow(t.id)}
                            disabled={teamSaving[t.id]}
                            title="Lưu"
                          >
                            {teamSaving[t.id] ? '...' : '✓'}
                          </button>
                          <button
                            className="kpi-settings__del-btn"
                            onClick={() => cancelEditTeamRow(t.id, t)}
                            disabled={teamSaving[t.id]}
                            title="Hủy"
                          >
                            ✕
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="kpi-settings__edit-btn"
                            onClick={() => startEditTeamRow(t.id)}
                            title="Sửa"
                          >
                            ✎
                          </button>
                          <button
                            className="kpi-settings__del-btn"
                            onClick={() => confirmRemoveTeamRow(t)}
                            disabled={teamDeleting[t.id]}
                            title="Xóa"
                          >
                            <TrashIcon />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}

              {newTeamRow && (
                <tr className="kpi-settings__new-row">
                  <td style={{ minWidth: 260 }}>
                    <TeamCombobox
                      teams={teamOptions}
                      value={newTeamRow.team_id ? { id: newTeamRow.team_id, name: newTeamRow.team_name } : null}
                      onChange={t => setNewTeamRow(prev => prev
                        ? { ...prev, team_id: t.id, team_name: t.name }
                        : null
                      )}
                    />
                  </td>
                  <td></td>
                  {(['q1', 'q2', 'q3', 'q4'] as const).map(q => (
                    <td key={q} style={{ textAlign: 'right' }}>
                      <input
                        className="kpi-settings__input kpi-settings__input--sm"
                        type="text"
                        inputMode="numeric"
                        placeholder="—"
                        value={newTeamRow[q]}
                        onChange={e => setNewTeamRow(prev => prev ? { ...prev, [q]: formatInput(e.target.value) } : null)}
                      />
                    </td>
                  ))}
                  <td className="leaderboard__value">{newTeamRowSum > 0 ? fmtVNDFull(newTeamRowSum) : '—'}</td>
                  <td className="kpi-settings__actions-cell">
                    <button
                      className="kpi-settings__save-btn"
                      onClick={confirmAddTeamRow}
                      disabled={addingTeamRow || !newTeamRow.team_id}
                      title="Lưu"
                    >
                      {addingTeamRow ? '...' : '✓'}
                    </button>
                    <button className="kpi-settings__del-btn" onClick={cancelAddTeamRow} title="Hủy">✕</button>
                  </td>
                </tr>
              )}

              {teamTargets.length === 0 && !newTeamRow && (
                <tr>
                  <td colSpan={8} className="table-placeholder">Chưa có target team nào cho năm {year}.</td>
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ padding: '12px 16px' }}>
            <button
              className="kpi-settings__add-btn"
              onClick={startAddTeamRow}
              disabled={!!newTeamRow}
            >
              + Thêm team
            </button>
          </div>
        </div>
      )}

      {tab === 'targets' && companyTarget && <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <input
            className="kpi-settings__input"
            type="search"
            placeholder="Tìm nhân viên..."
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
            style={{ width: 180, textAlign: 'left' }}
          />
          {filterableTeamOptions.length > 0 && (
            <select
              className="kpi-settings__year-select"
              value={teamFilter}
              onChange={e => changeTeam(e.target.value)}
              style={{ width: 'auto', minWidth: 140 }}
            >
              <option value="ALL">Tất cả team</option>
              {filterableTeamOptions.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
            <button
              className="kpi-settings__export-btn"
              onClick={exportKpiExcel}
              disabled={filteredTargets.length === 0}
            >
              Xuất Excel
            </button>
            <button
              className="kpi-settings__add-btn"
              onClick={startAdd}
              disabled={!!newRow || available.length === 0}
            >
              + Thêm
            </button>
          </div>
        </div>
        <div className="kpi-settings__total-bar">
          <span className="kpi-settings__total-label">
            Tổng KPI cả năm ({filteredTargets.length + (newRow ? 1 : 0)} thành viên
            {teamFilter !== 'ALL' ? ` · ${teamFilterName}` : ''})
          </span>
          <span className="kpi-settings__total-value">{totalSum > 0 ? fmtVNDFull(totalSum) : '—'}</span>
        </div>
        {currentTeamTarget > 0 && (
          <div style={{ padding: '8px 16px', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
            <span className={individualVsTeamDiff === 0 ? 'kpi-perf__actual--ok' : 'kpi-perf__actual--behind'}>
              Đã phân bổ {fmtVNDFull(totalSum)} / {fmtVNDFull(currentTeamTarget)} target team
              {teamFilter !== 'ALL' ? ` (${teamFilterName})` : ''}
              {individualVsTeamDiff !== 0 && (
                <> ({individualVsTeamDiff > 0 ? 'vượt' : 'thiếu'} {fmtVNDFull(Math.abs(individualVsTeamDiff))})</>
              )}
            </span>
          </div>
        )}
        <table className="leaderboard kpi-settings__table">
          <thead>
            <tr>
              <th>Nhân viên</th>
              <th>Team</th>
              <th style={{ textAlign: 'center' }}>D365 Status</th>
              <th style={{ textAlign: 'right' }}>Q1</th>
              <th style={{ textAlign: 'right' }}>Q2</th>
              <th style={{ textAlign: 'right' }}>Q3</th>
              <th style={{ textAlign: 'right' }}>Q4</th>
              <th style={{ textAlign: 'right' }}>Cả năm</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredTargets.map(t => {
              const e       = edits[t.id] ?? targetToEdit(t)
              const editing = editingRows.has(t.id)
              const sum = (['q1', 'q2', 'q3', 'q4'] as const)
                .reduce((acc, q) => acc + (fromStr(e[q]) ?? 0), 0)
              return (
                <tr key={t.id}>
                  <td className="leaderboard__name">{t.user_name}</td>
                  <td>
                    {editing
                      ? <select
                          className="kpi-settings__select"
                          value={e.team_id}
                          onChange={ev => {
                            const opt = filterableTeamOptions.find(o => o.id === ev.target.value)
                            setEdits(prev => ({
                              ...prev,
                              [t.id]: { ...prev[t.id], team_id: ev.target.value, team_name: opt?.name ?? '' },
                            }))
                          }}
                        >
                          <option value="">— Chưa gán team —</option>
                          {filterableTeamOptions.map(o => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                          ))}
                        </select>
                      : (t.team_name || <span style={{ color: '#ea580c' }}>Chưa gán team</span>)
                    }
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {(() => {
                      const u = statusById.get(t.crm_user_id)
                      if (!u) return '—'
                      return (
                        <span className={`win-rate ${u.is_disabled ? 'win-rate--low' : 'win-rate--high'}`}>
                          {u.is_disabled ? 'Disabled' : 'Active'}
                        </span>
                      )
                    })()}
                  </td>
                  {(['q1', 'q2', 'q3', 'q4'] as const).map(q => (
                    <td key={q} style={{ textAlign: 'right' }}>
                      {editing
                        ? <input
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
                        : (t[q] ? fmtVNDFull(t[q]) : '—')
                      }
                    </td>
                  ))}
                  <td className="leaderboard__value">{sum > 0 ? fmtVNDFull(sum) : '—'}</td>
                  <td className="kpi-settings__actions-cell">
                    {editing ? (
                      <>
                        <button
                          className="kpi-settings__save-btn"
                          onClick={() => saveRow(t.id)}
                          disabled={saving[t.id] || !e.team_id}
                          title="Lưu"
                        >
                          {saving[t.id] ? '...' : '✓'}
                        </button>
                        <button
                          className="kpi-settings__del-btn"
                          onClick={() => cancelEditRow(t.id, t)}
                          disabled={saving[t.id]}
                          title="Hủy"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="kpi-settings__edit-btn"
                          onClick={() => startEditRow(t.id)}
                          title="Sửa"
                        >
                          ✎
                        </button>
                        <button
                          className="kpi-settings__del-btn"
                          onClick={() => confirmRemoveRow(t)}
                          disabled={deleting[t.id]}
                          title="Xóa"
                        >
                          <TrashIcon />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}

            {newRow && (
              <tr className="kpi-settings__new-row">
                <td style={{ minWidth: 260 }}>
                  <UserCombobox
                    users={available}
                    value={available.find(u => u.id === newRow.crm_user_id) ?? null}
                    onChange={u => setNewRow(prev => prev
                      ? {
                          ...prev, crm_user_id: u.id, user_name: u.name,
                          // Đang xem "Tất cả team" → mặc định theo team CRM sống của người được chọn
                          // (sửa được ngay bên cạnh nếu cần chuyển target cho người ngoài team).
                          // Đang xem 1 team cụ thể → giữ nguyên team đang xem, không ghi đè.
                          ...(teamFilter === 'ALL' ? { team_id: u.team_id, team_name: u.team } : {}),
                        }
                      : null
                    )}
                  />
                </td>
                <td>
                  <select
                    className="kpi-settings__select"
                    value={newRow.team_id}
                    onChange={ev => {
                      const opt = filterableTeamOptions.find(o => o.id === ev.target.value)
                      setNewRow(prev => prev ? { ...prev, team_id: ev.target.value, team_name: opt?.name ?? '' } : null)
                    }}
                  >
                    <option value="">— Chọn team —</option>
                    {filterableTeamOptions.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span className="win-rate win-rate--high">Active</span>
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
                    disabled={adding || !newRow.crm_user_id || !newRow.team_id}
                    title="Lưu"
                  >
                    {adding ? '...' : '✓'}
                  </button>
                  <button className="kpi-settings__del-btn" onClick={cancelAdd} title="Hủy">✕</button>
                </td>
              </tr>
            )}

            {filteredTargets.length === 0 && !newRow && (
              <tr>
                <td colSpan={9} className="table-placeholder">
                  {nameFilter.trim()
                    ? `Không tìm thấy nhân viên nào khớp "${nameFilter.trim()}".`
                    : teamFilter !== 'ALL'
                      ? `Chưa có KPI nào cho team "${teamFilterName}".`
                      : 'Chưa có KPI nào. Nhấn "+ Thêm" để bắt đầu.'}
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
            : filteredPerf.length === 0
              ? <p className="table-placeholder">
                  {nameFilter.trim()
                    ? `Không tìm thấy nhân viên nào khớp "${nameFilter.trim()}".`
                    : teamFilter !== 'ALL'
                      ? `Chưa có dữ liệu KPI cho team "${teamFilterName}" năm ${year}.`
                      : `Chưa có dữ liệu KPI cho năm ${year}.`}
                </p>
              : <table className="leaderboard kpi-settings__table kpi-perf__table">
                  <thead>
                    <tr>
                      <th>Nhân viên</th>
                      <th style={{ textAlign: 'center' }}>D365 Status</th>
                      <th style={{ textAlign: 'right' }}>Mục tiêu</th>
                      <th style={{ textAlign: 'right' }}>Thực tế</th>
                      <th style={{ textAlign: 'right' }}>% Đạt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPerf.map(row => {
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
                          <td style={{ textAlign: 'center' }}>
                            {(() => {
                              const u = statusById.get(row.user_id)
                              if (!u) return '—'
                              return (
                                <span className={`win-rate ${u.is_disabled ? 'win-rate--low' : 'win-rate--high'}`}>
                                  {u.is_disabled ? 'Disabled' : 'Active'}
                                </span>
                              )
                            })()}
                          </td>
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
                      <td></td>
                      {(() => {
                        const totTgt = filteredPerf.reduce((s, r) => s + (perfQuarter === 'all'
                          ? (['q1', 'q2', 'q3', 'q4'] as const).reduce((qs, q) => qs + r.quarters[q].effective, 0)
                          : r.quarters[perfQuarter].effective), 0)
                        const totAct = filteredPerf.reduce((s, r) => s + (perfQuarter === 'all'
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
