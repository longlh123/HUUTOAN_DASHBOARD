import { useEffect, useMemo, useState } from 'react'
import {
  PieChart, Pie, Cell, Tooltip as PieTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as BarTooltip, ResponsiveContainer,
} from 'recharts'
import type { DeviceProductLineData, AgreementOverview, AgreementItem, AlertRecord, MaintenanceScheduleData, MaintenanceScheduleItem, ServiceCenter, WorkOrderPartsData, WorkOrderPartsSummaryRow } from '../api/device'
import { fetchDeviceByProductLine, fetchAgreementOverview, fetchAgreements, fetchMaintenanceSchedule, fetchServiceCenters, fetchWorkOrderParts, fetchWorkOrdersPartsSummary } from '../api/device'
import { getYearRange } from '../utils/date'
import { fmtVND } from '../utils/format'

/* ── constants ─────────────────────────────────────────────────────────── */

const CURRENT_YEAR = new Date().getFullYear()
const YEARS        = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i)
const PAGE_SIZE    = 20
const SUMMARY_PAGE_SIZE = 10

const PIE_COLORS = ['#C8102E', '#1e40af', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#be185d', '#6b7280']

const BAR_COLORS: Record<string, string> = {
  Active:  '#16a34a',
  Expired: '#9ca3af',
  Draft:   '#3b82f6',
  Lost:    '#dc2626',
}

const TYPES    = ['PM', 'WEL', 'Rental']
const STATUSES = ['Active', 'Expired', 'Draft', 'Lost']

const CRM_BASE = 'https://huutoan-test.crm5.dynamics.com'
function crmUrl(entity: string, id: string): string {
  return `${CRM_BASE}/main.aspx?etn=${entity}&id=${encodeURIComponent(id)}&pagetype=entityrecord`
}

type Tab = 'overview' | 'list' | 'schedule' | 'centers'

const CURRENT_QUARTER = Math.ceil((new Date().getMonth() + 1) / 3)
const CURRENT_MONTH_IN_QUARTER = Math.min(2, Math.max(0, (new Date().getMonth() + 1) - (CURRENT_QUARTER - 1) * 3 - 1))
const QUARTERS = [1, 2, 3, 4]

const WO_STATUS_COLORS: Record<number, string> = {
  500000000: '#dc2626',
  500000001: '#16a34a',
  500000002: '#2563eb',
  500000003: '#9ca3af',
  500000006: '#0891b2',
}

const MONTH_NAMES = [
  'Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
  'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12',
]

const CAL_LEGEND = [
  { label: 'Chưa phân công', color: '#dc2626' },
  { label: 'Đã lên lịch',    color: '#16a34a' },
  { label: 'Đang thực hiện', color: '#2563eb' },
  { label: 'Hoàn thành',     color: '#9ca3af' },
  { label: 'Đã xác nhận',    color: '#0891b2' },
]

const UNASSIGNED_KEY = '—'

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function defaultSummaryFrom(): string {
  const d = new Date()
  d.setDate(d.getDate() - 6)
  return toDateStr(d)
}

function woStatusClass(code: number): string {
  if (code === 500000000) return 'win-rate win-rate--low'
  if (code === 500000001 || code === 500000006) return 'win-rate win-rate--high'
  if (code === 500000002) return 'speed-badge speed-badge--mid'
  return 'win-rate'
}

function cellBg(items: MaintenanceScheduleItem[]): string | undefined {
  if (!items.length) return undefined
  if (items.some(i => i.status_code === 500000000)) return 'rgba(220,38,38,0.12)'
  if (items.some(i => i.status_code === 500000002)) return 'rgba(37,99,235,0.12)'
  if (items.some(i => i.status_code === 500000001 || i.status_code === 500000006)) return 'rgba(22,163,74,0.12)'
  return 'rgba(156,163,175,0.12)'
}

function cellDot(items: MaintenanceScheduleItem[]): string {
  if (!items.length) return '#9ca3af'
  if (items.some(i => i.status_code === 500000000)) return '#dc2626'
  if (items.some(i => i.status_code === 500000002)) return '#2563eb'
  if (items.some(i => i.status_code === 500000001 || i.status_code === 500000006)) return '#16a34a'
  return '#9ca3af'
}

/* ── small helpers ──────────────────────────────────────────────────────── */

function statusClass(s: string): string {
  if (s === 'Active')  return 'win-rate win-rate--high'
  if (s === 'Expired') return 'win-rate win-rate--low'
  if (s === 'Draft')   return 'speed-badge speed-badge--mid'
  if (s === 'Lost')    return 'win-rate win-rate--low'
  return 'win-rate'
}

function ProgressCell({ actual, total }: { actual: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round(actual / total * 100)) : 0
  return (
    <div className="bar-cell">
      <div className="bar-track" style={{ flex: 1 }}>
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="bar-pct">{actual}/{total}</span>
    </div>
  )
}

function PieLabel({ cx, cy, midAngle, outerRadius, pct, name }: {
  cx: number; cy: number; midAngle: number; outerRadius: number; pct: number; name: string
}) {
  if (pct < 3) return null
  const RADIAN = Math.PI / 180
  const r = outerRadius + 28
  const x = cx + r * Math.cos(-midAngle * RADIAN)
  const y = cy + r * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central"
      fontSize={12} fill="var(--text-primary)">
      {name} {pct}%
    </text>
  )
}

/* ── AlertTable ─────────────────────────────────────────────────────────── */

const ALERT_PAGE_SIZE = 10

function AlertTable({ rows, emptyMsg }: { rows: AlertRecord[]; emptyMsg: string }) {
  const [teamFilter, setTeamFilter] = useState('')
  const [page,       setPage]       = useState(1)

  const teams = useMemo(() => {
    const s = new Set(rows.map(r => r.team).filter(Boolean))
    return Array.from(s).sort()
  }, [rows])

  const filtered = useMemo(() => {
    if (!teamFilter) return rows
    return rows.filter(r => r.team === teamFilter)
  }, [rows, teamFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ALERT_PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageItems  = filtered.slice((safePage - 1) * ALERT_PAGE_SIZE, safePage * ALERT_PAGE_SIZE)

  if (rows.length === 0) {
    return <p style={{ color: 'var(--text-muted)', padding: '12px 0', fontSize: 14 }}>{emptyMsg}</p>
  }

  return (
    <div>
      <div style={{ marginBottom: '0.75rem' }}>
        <select className="date-filter__input" value={teamFilter}
          onChange={e => { setTeamFilter(e.target.value); setPage(1) }}>
          <option value="">Tất cả team</option>
          {teams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th style={{ textAlign: 'left',  padding: '6px 10px' }}>Mã HĐ</th>
              <th style={{ textAlign: 'left',  padding: '6px 10px' }}>Loại</th>
              <th style={{ textAlign: 'left',  padding: '6px 10px' }}>Thiết bị</th>
              <th style={{ textAlign: 'left',  padding: '6px 10px' }}>Khách hàng</th>
              <th style={{ textAlign: 'right', padding: '6px 10px' }}>Tổng BT theo HĐ</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>Không có dữ liệu</td></tr>
            )}
            {pageItems.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '7px 10px', fontWeight: 500 }}>
                  <a href={crmUrl('ab_agreement_device', r.id)} target="_blank" rel="noreferrer"
                     style={{ color: 'var(--accent)', textDecoration: 'none' }}>{r.code}</a>
                </td>
                <td style={{ padding: '7px 10px' }}>{r.type}</td>
                <td style={{ padding: '7px 10px', color: 'var(--text-muted)' }}>{r.device || '—'}</td>
                <td style={{ padding: '7px 10px' }}>{r.customer || '—'}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right' }}>{r.total_times}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: '1rem' }}>
          <button className="date-filter__btn" disabled={safePage <= 1}
            onClick={() => setPage(p => p - 1)}>← Trước</button>
          <span style={{ lineHeight: '32px', fontSize: 13 }}>Trang {safePage} / {totalPages}</span>
          <button className="date-filter__btn" disabled={safePage >= totalPages}
            onClick={() => setPage(p => p + 1)}>Tiếp →</button>
        </div>
      )}
    </div>
  )
}

/* ── WorkOrderPartsPanel ────────────────────────────────────────────────── */

function WorkOrderPartsPanel({ workOrderId }: { workOrderId: string }) {
  const [data,    setData]    = useState<WorkOrderPartsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setError(null)
    fetchWorkOrderParts(workOrderId)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [workOrderId])

  const rowLabel = (p: WorkOrderPartsData['all'][number]) => (
    <>
      {p.item_number && <span style={{ color: 'var(--text-muted)' }}>{p.item_number} — </span>}
      {p.name}
      <span style={{ color: 'var(--text-muted)' }}> ×{p.qty_needed}</span>
    </>
  )

  return (
    <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--border)' }}>
      {loading && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Đang tải vật tư…</p>}
      {error && <p style={{ fontSize: 11, color: '#ea580c', margin: 0 }}>{error}</p>}
      {!loading && !error && data && data.all.length === 0 && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Không có vật tư nào cho WO này</p>
      )}
      {!loading && !error && data && data.all.length > 0 && (
        <>
          {data.shortage.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                ⚠ Thiếu hàng ({data.shortage.length})
              </div>
              {data.shortage.map((p, i) => (
                <div key={i} style={{ fontSize: 11, padding: '2px 0', color: 'var(--text)' }}>
                  {rowLabel(p)}
                  <span style={{ color: '#dc2626', fontWeight: 600, marginLeft: 4 }}>(thiếu {p.shortage})</span>
                </div>
              ))}
            </div>
          )}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
              Tất cả vật tư ({data.all.length})
            </div>
            {data.all.map((p, i) => (
              <div key={i} style={{ fontSize: 11, padding: '2px 0', display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ color: 'var(--text)' }}>{rowLabel(p)}</span>
                {p.sufficient === true && <span style={{ color: '#16a34a', fontSize: 10, whiteSpace: 'nowrap' }}>Đủ</span>}
                {p.sufficient === false && <span style={{ color: '#dc2626', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>Thiếu {p.shortage}</span>}
                {p.is_write_in && <span style={{ color: 'var(--text-muted)', fontSize: 10, whiteSpace: 'nowrap' }}>Mua ngoài</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ── Main component ─────────────────────────────────────────────────────── */

export function DeviceDashboard() {
  const [tab, setTab] = useState<Tab>('overview')

  /* --- Tab 1: Overview --- */
  const [year,            setYear]            = useState(CURRENT_YEAR)
  const [pieData,         setPieData]         = useState<DeviceProductLineData | null>(null)
  const [overview,        setOverview]        = useState<AgreementOverview | null>(null)
  const [pieLoading,      setPieLoading]      = useState(true)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [pieError,        setPieError]        = useState<string | null>(null)
  const [overviewError,   setOverviewError]   = useState<string | null>(null)

  /* --- Tab 3: Maintenance Schedule --- */
  const [schedYear,     setSchedYear]     = useState(CURRENT_YEAR)
  const [schedQuarter,  setSchedQuarter]  = useState(CURRENT_QUARTER)
  const [schedData,     setSchedData]     = useState<MaintenanceScheduleData | null>(null)
  const [schedLoading,  setSchedLoading]  = useState(false)
  const [schedError,    setSchedError]    = useState<string | null>(null)
  const [schedSearch,   setSchedSearch]   = useState('')
  const [schedRegion,   setSchedRegion]   = useState('')
  const [schedStatus,   setSchedStatus]   = useState<number | ''>('')
  const [schedCalMonth, setSchedCalMonth] = useState(CURRENT_MONTH_IN_QUARTER)
  const [selectedDay,   setSelectedDay]   = useState<{ engineer: string; dateKey: string; items: MaintenanceScheduleItem[] } | null>(null)
  const [expandedWO,    setExpandedWO]    = useState<string | null>(null)

  /* --- Tab 3: Parts summary table --- */
  const [summaryFrom,    setSummaryFrom]    = useState(defaultSummaryFrom())
  const [summaryTo,      setSummaryTo]      = useState(toDateStr(new Date()))
  const [summaryData,    setSummaryData]    = useState<WorkOrderPartsSummaryRow[] | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError,   setSummaryError]   = useState<string | null>(null)
  const [summaryVisited, setSummaryVisited] = useState(false)
  const [summaryTypeFilter, setSummaryTypeFilter] = useState('')
  const [summaryPage,       setSummaryPage]       = useState(1)

  /* --- Tab 2: Agreement List --- */
  const [typeFilter,   setTypeFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search,       setSearch]       = useState('')
  const [listPage,     setListPage]     = useState(1)
  const [agreements,   setAgreements]   = useState<AgreementItem[]>([])
  const [listLoading,  setListLoading]  = useState(false)
  const [listError,    setListError]    = useState<string | null>(null)
  const [listVisited,  setListVisited]  = useState(false)

  /* --- Tab 4: Service Centers --- */
  const [centers,        setCenters]        = useState<ServiceCenter[]>([])
  const [centersLoading, setCentersLoading] = useState(false)
  const [centersError,   setCentersError]   = useState<string | null>(null)
  const [centersVisited, setCentersVisited] = useState(false)

  /* --- Fetches --- */
  useEffect(() => {
    setPieLoading(true); setPieError(null)
    fetchDeviceByProductLine(getYearRange(year))
      .then(setPieData).catch((e: Error) => setPieError(e.message)).finally(() => setPieLoading(false))
  }, [year])

  useEffect(() => {
    setOverviewLoading(true); setOverviewError(null)
    fetchAgreementOverview()
      .then(setOverview).catch((e: Error) => setOverviewError(e.message)).finally(() => setOverviewLoading(false))
  }, [])

  useEffect(() => {
    if (tab !== 'list') return
    if (!listVisited) setListVisited(true)
    setListLoading(true); setListError(null); setListPage(1)
    fetchAgreements(typeFilter || undefined, statusFilter || undefined)
      .then(setAgreements).catch((e: Error) => setListError(e.message)).finally(() => setListLoading(false))
  }, [tab, typeFilter, statusFilter])

  useEffect(() => {
    if (tab !== 'schedule') return
    setSchedLoading(true); setSchedError(null)
    fetchMaintenanceSchedule(schedYear, schedQuarter)
      .then(setSchedData).catch((e: Error) => setSchedError(e.message)).finally(() => setSchedLoading(false))
  }, [tab, schedYear, schedQuarter])

  useEffect(() => { setExpandedWO(null) }, [selectedDay])

  useEffect(() => {
    if (tab !== 'centers') return
    if (!centersVisited) setCentersVisited(true)
    setCentersLoading(true); setCentersError(null)
    fetchServiceCenters()
      .then(setCenters).catch((e: Error) => setCentersError(e.message)).finally(() => setCentersLoading(false))
  }, [tab])

  function runSummarySearch() {
    setSummaryVisited(true)
    setSummaryLoading(true); setSummaryError(null)
    setSummaryTypeFilter(''); setSummaryPage(1)
    fetchWorkOrdersPartsSummary(summaryFrom, summaryTo)
      .then(setSummaryData)
      .catch((e: Error) => setSummaryError(e.message))
      .finally(() => setSummaryLoading(false))
  }

  useEffect(() => {
    if (tab !== 'schedule' || summaryVisited) return
    runSummarySearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  /* --- Derived: agreements --- */
  const filteredList = useMemo(() => {
    if (!search.trim()) return agreements
    const q = search.toLowerCase()
    return agreements.filter(a =>
      a.code.toLowerCase().includes(q) || a.device.toLowerCase().includes(q) || a.customer.toLowerCase().includes(q)
    )
  }, [agreements, search])

  const totalPages = Math.max(1, Math.ceil(filteredList.length / PAGE_SIZE))
  const safePage   = Math.min(listPage, totalPages)
  const pageItems  = filteredList.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  /* --- Derived: schedule filters --- */
  const schedRegions = useMemo(() => {
    const s = new Set((schedData?.items ?? []).map(i => i.region).filter(Boolean))
    return Array.from(s).sort()
  }, [schedData])

  const filteredSched = useMemo(() => {
    let rows: MaintenanceScheduleItem[] = schedData?.items ?? []
    if (schedRegion) rows = rows.filter(r => r.region === schedRegion)
    if (schedStatus !== '') rows = rows.filter(r => r.status_code === schedStatus)
    if (schedSearch.trim()) {
      const q = schedSearch.toLowerCase()
      rows = rows.filter(r =>
        r.code.toLowerCase().includes(q) || r.customer.toLowerCase().includes(q) || r.engineer.toLowerCase().includes(q)
      )
    }
    return rows
  }, [schedData, schedRegion, schedStatus, schedSearch])

  /* --- Derived: KTV calendar --- */
  const calMonth = (schedQuarter - 1) * 3 + 1 + schedCalMonth

  const schedMonthItems = useMemo(() => {
    return filteredSched.filter(i => {
      if (!i.planned_date) return false
      const d = new Date(i.planned_date)
      return d.getFullYear() === schedYear && d.getMonth() + 1 === calMonth
    })
  }, [filteredSched, schedYear, calMonth])

  const ktvDateMap = useMemo(() => {
    const map: Record<string, Record<string, MaintenanceScheduleItem[]>> = {}
    for (const item of schedMonthItems) {
      const eng = item.engineer || UNASSIGNED_KEY
      const key = new Date(item.planned_date).toLocaleDateString('sv-SE')
      if (!map[eng]) map[eng] = {}
      if (!map[eng][key]) map[eng][key] = []
      map[eng][key].push(item)
    }
    return map
  }, [schedMonthItems])

  // Tất cả KTV xuất hiện trong cả quý (không lọc filter)
  const allKtvsInQuarter = useMemo(() => {
    const names = new Set<string>()
    for (const item of schedData?.items ?? []) {
      names.add(item.engineer || UNASSIGNED_KEY)
    }
    return Array.from(names)
  }, [schedData])

  // KTV có WO trong tháng đang xem (dùng dữ liệu gốc, không qua filter)
  const ktvsWithMonthWOs = useMemo(() => {
    const names = new Set<string>()
    for (const item of schedData?.items ?? []) {
      if (!item.planned_date) continue
      const d = new Date(item.planned_date)
      if (d.getFullYear() === schedYear && d.getMonth() + 1 === calMonth) {
        names.add(item.engineer || UNASSIGNED_KEY)
      }
    }
    return names
  }, [schedData, schedYear, calMonth])

  const ktvList = useMemo(() => {
    const sortAlpha = (arr: string[]) => [
      ...arr.filter(k => k === UNASSIGNED_KEY),
      ...arr.filter(k => k !== UNASSIGNED_KEY).sort(),
    ]
    const withWOs    = allKtvsInQuarter.filter(k => ktvsWithMonthWOs.has(k))
    const withoutWOs = allKtvsInQuarter.filter(k => !ktvsWithMonthWOs.has(k))
    return [...sortAlpha(withWOs), ...sortAlpha(withoutWOs)]
  }, [allKtvsInQuarter, ktvsWithMonthWOs])

  const calDays = useMemo(() => {
    const last = new Date(schedYear, calMonth, 0).getDate()
    return Array.from({ length: last }, (_, i) => i + 1)
  }, [schedYear, calMonth])

  /* --- Derived: WO parts summary table --- */
  const summaryTypes = useMemo(() => {
    const s = new Set((summaryData ?? []).map(r => r.type).filter(Boolean))
    return Array.from(s).sort()
  }, [summaryData])

  const filteredSummary = useMemo(() => {
    if (!summaryTypeFilter) return summaryData ?? []
    return (summaryData ?? []).filter(r => r.type === summaryTypeFilter)
  }, [summaryData, summaryTypeFilter])

  const summaryTotalPages = Math.max(1, Math.ceil(filteredSummary.length / SUMMARY_PAGE_SIZE))
  const summarySafePage   = Math.min(summaryPage, summaryTotalPages)
  const summaryPageItems  = filteredSummary.slice(
    (summarySafePage - 1) * SUMMARY_PAGE_SIZE,
    summarySafePage * SUMMARY_PAGE_SIZE
  )

  const kpis = overview?.kpis

  return (
    <div className="dashboard">
      {/* ── Header ── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div className="date-filter__presets">
          {(['overview', 'list', 'schedule', 'centers'] as Tab[]).map((t, i) => (
            <button key={t}
              className={`date-filter__btn${tab === t ? ' date-filter__btn--active' : ''}`}
              onClick={() => setTab(t)}>
              {['Tổng quan', 'Danh sách hợp đồng', 'Lịch KTV', 'Trạm BH'][i]}
            </button>
          ))}
        </div>
        {tab === 'schedule' && (
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div className="date-filter__presets">
              {QUARTERS.map(q => (
                <button key={q}
                  className={`date-filter__btn${schedQuarter === q ? ' date-filter__btn--active' : ''}`}
                  onClick={() => { setSchedQuarter(q); setSchedCalMonth(0); setSelectedDay(null) }}>
                  Q{q}
                </button>
              ))}
            </div>
            <select className="date-filter__input" value={schedYear}
              onChange={e => { setSchedYear(Number(e.target.value)); setSelectedDay(null) }}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ════════ TAB 1 — OVERVIEW ════════ */}
      {tab === 'overview' && (
        <>
          <div className="kpi-grid">
            {[
              { label: 'Hợp đồng Active',        value: kpis?.active_count },
              { label: 'Chưa bảo dưỡng lần nào', value: kpis?.never_maintained },
              { label: 'Sắp hết hạn ≤ 30 ngày',  value: kpis?.expiring_soon },
              { label: 'Đã hết hạn',              value: kpis?.expired_count },
            ].map(card => (
              <div key={card.label} className="card kpi-card">
                <div className="kpi-card__label">{card.label}</div>
                <div className="kpi-card__value">
                  {overviewLoading ? '—' : (card.value ?? 0).toLocaleString('vi-VN')}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            <div className="card" style={{ flex: '1 1 460px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 className="card__title" style={{ margin: 0 }}>Thiết bị theo dòng sản phẩm</h2>
                <select className="date-filter__input" value={year} onChange={e => setYear(Number(e.target.value))}>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              {pieLoading && <p style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>Đang tải…</p>}
              {pieError   && <p style={{ textAlign: 'center', padding: '40px 0', color: '#ea580c' }}>{pieError}</p>}
              {!pieLoading && !pieError && (
                <div style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData?.items ?? []} dataKey="count" nameKey="name"
                        cx="50%" cy="50%" outerRadius={100} labelLine={false}
                        label={(props) => (
                          <PieLabel cx={props.cx ?? 0} cy={props.cy ?? 0}
                            midAngle={props.midAngle ?? 0} outerRadius={props.outerRadius ?? 100}
                            pct={(props.payload as { pct: number }).pct}
                            name={(props.payload as { name: string }).name} />
                        )}>
                        {(pieData?.items ?? []).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <PieTooltip formatter={(value, name, props) => [
                        `${Number(value ?? 0).toLocaleString('vi-VN')} máy (${(props.payload as { pct: number }).pct}%)`, name,
                      ]} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="card" style={{ flex: '1 1 460px', padding: '1.25rem' }}>
              <h2 className="card__title" style={{ marginBottom: '1rem' }}>Hợp đồng bảo trì theo loại</h2>
              {overviewLoading && <p style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>Đang tải…</p>}
              {overviewError   && <p style={{ textAlign: 'center', padding: '40px 0', color: '#ea580c' }}>{overviewError}</p>}
              {!overviewLoading && !overviewError && (
                <div style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overview?.by_type ?? []} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="type" tick={{ fontSize: 13 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <BarTooltip />
                      <Legend />
                      {(['Active', 'Expired', 'Draft', 'Lost'] as const).map(s => (
                        <Bar key={s} dataKey={s} fill={BAR_COLORS[s]} radius={[3, 3, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {!overviewLoading && !overviewError && (
            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
              <div className="card" style={{ flex: '1 1 460px', padding: '1.25rem' }}>
                <h2 className="card__title" style={{ marginBottom: '1rem' }}>
                  ⚠ Chưa bảo dưỡng lần nào
                  <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: 'var(--text-muted)' }}>
                    ({overview?.alerts.never_maintained.length ?? 0} hợp đồng Active)
                  </span>
                </h2>
                <AlertTable rows={overview?.alerts.never_maintained ?? []} emptyMsg="Không có hợp đồng nào chưa bảo dưỡng." />
              </div>
              <div className="card" style={{ flex: '1 1 460px', padding: '1.25rem' }}>
                <h2 className="card__title" style={{ marginBottom: '1rem' }}>
                  Draft chưa duyệt
                  <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: 'var(--text-muted)' }}>
                    ({overview?.alerts.drafts.length ?? 0} hợp đồng)
                  </span>
                </h2>
                <AlertTable rows={overview?.alerts.drafts ?? []} emptyMsg="Không có hợp đồng Draft." />
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════ TAB 2 — AGREEMENT LIST ════════ */}
      {tab === 'list' && (
        <div className="card" style={{ marginTop: '1.5rem', padding: '1.25rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem', alignItems: 'center' }}>
            <div className="date-filter__presets">
              <button className={`date-filter__btn${typeFilter === '' ? ' date-filter__btn--active' : ''}`}
                onClick={() => { setTypeFilter(''); setListPage(1) }}>Tất cả loại</button>
              {TYPES.map(t => (
                <button key={t}
                  className={`date-filter__btn${typeFilter === t ? ' date-filter__btn--active' : ''}`}
                  onClick={() => { setTypeFilter(t); setListPage(1) }}>{t}</button>
              ))}
            </div>
            <div className="date-filter__presets">
              <button className={`date-filter__btn${statusFilter === '' ? ' date-filter__btn--active' : ''}`}
                onClick={() => { setStatusFilter(''); setListPage(1) }}>Tất cả trạng thái</button>
              {STATUSES.map(s => (
                <button key={s}
                  className={`date-filter__btn${statusFilter === s ? ' date-filter__btn--active' : ''}`}
                  onClick={() => { setStatusFilter(s); setListPage(1) }}>{s}</button>
              ))}
            </div>
            <input type="text" placeholder="Tìm mã HĐ / thiết bị / khách hàng…"
              value={search} onChange={e => { setSearch(e.target.value); setListPage(1) }}
              style={{ flex: '1 1 240px', padding: '6px 12px', fontSize: 13,
                border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }} />
            <span style={{ color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
              {filteredList.length} kết quả
            </span>
          </div>

          {listLoading && <p style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>Đang tải…</p>}
          {listError   && <p style={{ textAlign: 'center', padding: '40px 0', color: '#ea580c' }}>{listError}</p>}
          {!listLoading && !listError && (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={{ textAlign: 'left',  padding: '8px 10px' }}>Mã HĐ</th>
                      <th style={{ textAlign: 'left',  padding: '8px 10px' }}>Thiết bị</th>
                      <th style={{ textAlign: 'left',  padding: '8px 10px' }}>Khách hàng</th>
                      <th style={{ textAlign: 'left',  padding: '8px 10px' }}>Loại</th>
                      <th style={{ textAlign: 'left',  padding: '8px 10px' }}>Trạng thái</th>
                      <th style={{ textAlign: 'left',  padding: '8px 10px', minWidth: 140 }}>Tiến độ BT</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px' }}>Giá trị</th>
                      <th style={{ textAlign: 'left',  padding: '8px 10px' }}>Team</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.length === 0 && (
                      <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>Không có dữ liệu</td></tr>
                    )}
                    {pageItems.map(a => (
                      <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 500 }}>
                          <a href={crmUrl('ab_agreement_device', a.id)} target="_blank" rel="noreferrer"
                             style={{ color: 'var(--accent)', textDecoration: 'none' }}>{a.code}</a>
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{a.device || '—'}</td>
                        <td style={{ padding: '8px 10px' }}>{a.customer || '—'}</td>
                        <td style={{ padding: '8px 10px' }}>{a.type}</td>
                        <td style={{ padding: '8px 10px' }}><span className={statusClass(a.status)}>{a.status}</span></td>
                        <td style={{ padding: '8px 10px' }}><ProgressCell actual={a.actual_times} total={a.total_times} /></td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{a.value > 0 ? fmtVND(a.value) : '—'}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-muted)' }}>{a.team}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: '1.25rem' }}>
                  <button className="date-filter__btn" disabled={safePage <= 1} onClick={() => setListPage(p => p - 1)}>← Trước</button>
                  <span style={{ lineHeight: '32px', fontSize: 13 }}>Trang {safePage} / {totalPages}</span>
                  <button className="date-filter__btn" disabled={safePage >= totalPages} onClick={() => setListPage(p => p + 1)}>Tiếp →</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ════════ TAB 3 — MAINTENANCE SCHEDULE ════════ */}
      {tab === 'schedule' && (
        <>

          {schedLoading && <p style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>Đang tải…</p>}
          {schedError   && <p style={{ textAlign: 'center', padding: '40px 0', color: '#ea580c' }}>{schedError}</p>}

          {!schedLoading && !schedError && schedData && (
            <div className="card" style={{ marginTop: '1.25rem', padding: '1.25rem' }}>
              {/* Filters */}
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem', alignItems: 'center' }}>
                <select className="date-filter__input" value={schedRegion}
                  onChange={e => { setSchedRegion(e.target.value); setSelectedDay(null) }}>
                  <option value="">Tất cả địa điểm BH</option>
                  {schedRegions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <div className="date-filter__presets">
                  {([
                    { label: 'Tất cả',         code: '' as '' },
                    { label: 'Chưa phân công', code: 500000000 as number },
                    { label: 'Đã lên lịch',    code: 500000001 as number },
                    { label: 'Đang thực hiện', code: 500000002 as number },
                  ]).map(s => (
                    <button key={s.label}
                      className={`date-filter__btn${schedStatus === s.code ? ' date-filter__btn--active' : ''}`}
                      onClick={() => { setSchedStatus(s.code); setSelectedDay(null) }}>{s.label}</button>
                  ))}
                </div>
                <input type="text" placeholder="Tìm mã WO / khách hàng / KTV…"
                  value={schedSearch} onChange={e => { setSchedSearch(e.target.value); setSelectedDay(null) }}
                  style={{ flex: '1 1 220px', padding: '6px 12px', fontSize: 13,
                    border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }} />
                <span style={{ color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
                  {filteredSched.length} kết quả
                </span>
              </div>

              {/* ── LỊCH KTV ── */}
              <>
                  {/* Month picker */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div className="date-filter__presets">
                      {[0, 1, 2].map(i => {
                        const m = (schedQuarter - 1) * 3 + 1 + i
                        return (
                          <button key={i}
                            className={`date-filter__btn${schedCalMonth === i ? ' date-filter__btn--active' : ''}`}
                            onClick={() => { setSchedCalMonth(i); setSelectedDay(null) }}>
                            {MONTH_NAMES[m - 1]}
                          </button>
                        )
                      })}
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {schedMonthItems.length} WO · {ktvsWithMonthWOs.size} / {ktvList.filter(k => k !== UNASSIGNED_KEY).length} KTV có lịch
                    </span>
                  </div>

                  {/* Split: calendar (left) + info panel (right) */}
                  <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>

                    {/* Left: calendar grid + legend */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr>
                              <th style={{
                                position: 'sticky', left: 0, zIndex: 3,
                                background: 'var(--bg-card, #fff)',
                                padding: '6px 12px', textAlign: 'left',
                                borderBottom: '2px solid var(--border)',
                                borderRight: '2px solid var(--border)',
                                minWidth: 170, fontWeight: 600, fontSize: 12,
                              }}>
                                KTV
                              </th>
                              {calDays.map(d => {
                                const dow     = new Date(schedYear, calMonth - 1, d).getDay()
                                const isSun   = dow === 0
                                const isSat   = dow === 6
                                const mm      = String(calMonth).padStart(2, '0')
                                const dd      = String(d).padStart(2, '0')
                                const isToday = `${schedYear}-${mm}-${dd}` === new Date().toISOString().slice(0, 10)
                                return (
                                  <th key={d} style={{
                                    padding: '4px 0', textAlign: 'center',
                                    width: 40, minWidth: 40,
                                    borderBottom: '2px solid var(--border)',
                                    color: isToday ? 'var(--accent)' : (isSun || isSat) ? '#9ca3af' : 'var(--text-muted)',
                                    fontWeight: isToday ? 700 : 500, fontSize: 11,
                                    background: isToday ? 'rgba(200,16,46,0.05)' : undefined,
                                  }}>
                                    <div>{d}</div>
                                    <div style={{ fontSize: 9, fontWeight: 400, marginTop: 1 }}>
                                      {['CN','T2','T3','T4','T5','T6','T7'][dow]}
                                    </div>
                                  </th>
                                )
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {ktvList.length === 0 && (
                              <tr>
                                <td colSpan={calDays.length + 1}
                                  style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                                  Không có WO nào trong tháng này
                                </td>
                              </tr>
                            )}
                            {ktvList.map((ktv, idx) => {
                              const isFirstWithout = !ktvsWithMonthWOs.has(ktv) &&
                                (idx === 0 || ktvsWithMonthWOs.has(ktvList[idx - 1]))
                              return (<>
                              {isFirstWithout && (
                                <tr key={`divider-${ktv}`}>
                                  <td colSpan={calDays.length + 1} style={{
                                    padding: '4px 12px', fontSize: 11, fontWeight: 600,
                                    color: 'var(--text-muted)', background: 'var(--bg)',
                                    borderTop: '2px solid var(--border)',
                                    letterSpacing: '0.05em', textTransform: 'uppercase',
                                  }}>
                                    Chưa có lịch trong tháng
                                  </td>
                                </tr>
                              )}
                              <tr key={ktv} style={{ borderBottom: '1px solid var(--border)', opacity: ktvsWithMonthWOs.has(ktv) ? 1 : 0.5 }}>
                                <td style={{
                                  position: 'sticky', left: 0, zIndex: 1,
                                  background: 'var(--bg-card, #fff)',
                                  padding: '5px 12px',
                                  borderRight: '2px solid var(--border)',
                                  fontWeight: 500, fontSize: 12,
                                  color: ktv === UNASSIGNED_KEY ? '#dc2626' : 'var(--text)',
                                  whiteSpace: 'nowrap',
                                  maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>
                                  {ktv === UNASSIGNED_KEY ? '⚠ Chưa phân công' : ktv}
                                </td>
                                {calDays.map(d => {
                                  const mm        = String(calMonth).padStart(2, '0')
                                  const dd        = String(d).padStart(2, '0')
                                  const dateKey   = `${schedYear}-${mm}-${dd}`
                                  const dayItems  = ktvDateMap[ktv]?.[dateKey] ?? []
                                  const count     = dayItems.length
                                  const dow       = new Date(schedYear, calMonth - 1, d).getDay()
                                  const isWeekend = dow === 0 || dow === 6
                                  const isSelected = selectedDay?.engineer === ktv && selectedDay?.dateKey === dateKey

                                  if (count === 0) {
                                    return (
                                      <td key={d} style={{
                                        border: '1px solid var(--border)',
                                        width: 40,
                                        background: isWeekend ? 'rgba(0,0,0,0.02)' : undefined,
                                      }} />
                                    )
                                  }

                                  return (
                                    <td key={d}
                                      onClick={() => setSelectedDay({ engineer: ktv, dateKey, items: dayItems })}
                                      style={{
                                        border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                                        width: 40, textAlign: 'center',
                                        cursor: 'pointer',
                                        background: cellBg(dayItems),
                                        verticalAlign: 'middle',
                                        padding: '4px 0',
                                      }}
                                      title={`${ktv === UNASSIGNED_KEY ? 'Chưa phân công' : ktv} — ${count} WO ngày ${d}/${calMonth}`}
                                    >
                                      <div style={{
                                        width: 22, height: 22, borderRadius: '50%',
                                        background: cellDot(dayItems),
                                        color: '#fff', fontSize: 10, fontWeight: 700,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        margin: '0 auto',
                                      }}>
                                        {count}
                                      </div>
                                    </td>
                                  )
                                })}
                              </tr>
                            </>)
                          })}
                          </tbody>
                        </table>
                      </div>

                      {/* Legend */}
                      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                        {CAL_LEGEND.map(l => (
                          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
                            <span style={{ color: 'var(--text-muted)' }}>{l.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right: info panel */}
                    <div style={{ width: 280, flexShrink: 0, borderLeft: '1px solid var(--border)', paddingLeft: '1.25rem' }}>
                      {!selectedDay ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: 13, paddingTop: '2rem', textAlign: 'center' }}>
                          Click vào ô trong lịch để xem danh sách WO
                        </p>
                      ) : (
                        <>
                          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                            {selectedDay.engineer === UNASSIGNED_KEY
                              ? <span style={{ color: '#dc2626' }}>⚠ Chưa phân công</span>
                              : selectedDay.engineer}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: '1rem' }}>
                            {new Date(selectedDay.dateKey + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}
                            {' · '}{selectedDay.items.length} WO
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto', maxHeight: 480 }}>
                            {selectedDay.items.map(item => (
                              <div key={item.id} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                  <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: WO_STATUS_COLORS[item.status_code] ?? '#9ca3af' }} />
                                  <a href={crmUrl('ab_work_order', item.id)} target="_blank" rel="noreferrer"
                                     style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontSize: 12, flex: 1 }}>
                                    {item.code}
                                  </a>
                                  <span className={woStatusClass(item.status_code)} style={{ fontSize: 10 }}>{item.status}</span>
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text)' }}>
                                  {item.type && <span style={{ color: 'var(--text-muted)' }}>{item.type} · </span>}
                                  {item.customer || '—'}
                                </div>
                                {(item.region || item.city || item.address) && (
                                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                                    {[item.region, item.city].filter(Boolean).join(' / ')}
                                    {item.address && <span>{item.region || item.city ? ' — ' : ''}{item.address}</span>}
                                  </div>
                                )}
                                <button
                                  onClick={() => setExpandedWO(id => id === item.id ? null : item.id)}
                                  style={{
                                    marginTop: 5, padding: 0, border: 'none', background: 'none',
                                    color: 'var(--accent)', fontSize: 11, cursor: 'pointer',
                                  }}
                                >
                                  {expandedWO === item.id ? 'Ẩn vật tư ▴' : 'Xem vật tư cần chuẩn bị ▾'}
                                </button>
                                {expandedWO === item.id && <WorkOrderPartsPanel workOrderId={item.id} />}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </>
            </div>
          )}

          {/* ── Bang vat tu theo WO (filter theo khoang ngay) ── */}
          <div className="card" style={{ marginTop: '1.25rem', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
              <h2 className="card__title" style={{ margin: 0 }}>Bảng vật tư theo WO</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="date" value={summaryFrom} onChange={e => setSummaryFrom(e.target.value)} className="date-filter__input" />
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>đến</span>
                <input type="date" value={summaryTo} onChange={e => setSummaryTo(e.target.value)} className="date-filter__input" />
                <button className="date-filter__btn date-filter__btn--active" onClick={runSummarySearch} disabled={summaryLoading}>
                  {summaryLoading ? 'Đang tra cứu…' : 'Tra cứu'}
                </button>
                {summaryData && summaryData.length > 0 && (
                  <select
                    className="date-filter__input"
                    value={summaryTypeFilter}
                    onChange={e => { setSummaryTypeFilter(e.target.value); setSummaryPage(1) }}
                  >
                    <option value="">Tất cả loại WO</option>
                    {summaryTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                )}
              </div>
            </div>

            {summaryLoading && <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>Đang tải…</p>}
            {summaryError   && <p style={{ textAlign: 'center', padding: '30px 0', color: '#ea580c' }}>{summaryError}</p>}
            {!summaryLoading && !summaryError && summaryData && (
              <>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  {filteredSummary.length} WO có phát sinh vật tư
                </p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '6px 10px' }}>Mã WO</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px' }}>Loại</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px' }}>KTV</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', minWidth: 220 }}>Vật tư thiếu</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', minWidth: 260 }}>Tất cả vật tư cần</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSummary.length === 0 && (
                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>Không có WO nào phát sinh vật tư trong khoảng ngày này</td></tr>
                      )}
                      {summaryPageItems.map(row => (
                        <tr key={row.id} style={{ borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                            <a href={crmUrl('ab_work_order', row.id)} target="_blank" rel="noreferrer"
                               style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>{row.code}</a>
                          </td>
                          <td style={{ padding: '8px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{row.type || '—'}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{row.engineer || '—'}</td>
                          <td style={{ padding: '8px 10px' }}>
                            {row.shortage.length === 0
                              ? <span style={{ color: 'var(--text-muted)' }}>—</span>
                              : row.shortage.map((p, i) => (
                                  <div key={i} style={{ color: '#dc2626', marginBottom: 2 }}>
                                    {p.item_number && <span>{p.item_number} — </span>}{p.name} <strong>(thiếu {p.shortage})</strong>
                                  </div>
                                ))
                            }
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            {row.all.map((p, i) => (
                              <div key={i} style={{ marginBottom: 2, color: p.sufficient === false ? '#dc2626' : 'var(--text)' }}>
                                {p.item_number && <span style={{ color: 'var(--text-muted)' }}>{p.item_number} — </span>}
                                {p.name} ×{p.qty_needed}
                                {p.sufficient === true  && <span style={{ color: '#16a34a' }}> (đủ)</span>}
                                {p.sufficient === false && <strong> (thiếu {p.shortage})</strong>}
                                {p.is_write_in && <span style={{ color: 'var(--text-muted)' }}> (mua ngoài)</span>}
                              </div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {summaryTotalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: '1.25rem' }}>
                    <button className="date-filter__btn" disabled={summarySafePage <= 1}
                      onClick={() => setSummaryPage(p => p - 1)}>← Trước</button>
                    <span style={{ lineHeight: '32px', fontSize: 13 }}>Trang {summarySafePage} / {summaryTotalPages}</span>
                    <button className="date-filter__btn" disabled={summarySafePage >= summaryTotalPages}
                      onClick={() => setSummaryPage(p => p + 1)}>Tiếp →</button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ════════ TAB 4 — SERVICE CENTERS ════════ */}
      {tab === 'centers' && (
        <div style={{ marginTop: '1.5rem' }}>
          {centersLoading && <p style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>Đang tải…</p>}
          {centersError   && <p style={{ textAlign: 'center', padding: '40px 0', color: '#ea580c' }}>{centersError}</p>}
          {!centersLoading && !centersError && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
              {centers.map(c => (
                <div key={c.id} className="card" style={{ padding: '1.25rem', opacity: c.is_active ? 1 : 0.55 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>{c.name}</h3>
                    <span className={c.is_active ? 'win-rate win-rate--high' : 'win-rate win-rate--low'}
                      style={{ marginLeft: 8, flexShrink: 0, fontSize: 11 }}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                    {c.address && (
                      <div style={{ color: 'var(--text-muted)' }}>📍 {c.address}</div>
                    )}
                    {c.maps_url && (
                      <div>
                        <a href={c.maps_url} target="_blank" rel="noreferrer"
                           style={{ color: 'var(--accent)', fontSize: 12, textDecoration: 'none' }}>
                          🗺 Xem trên Google Maps ({c.latitude?.toFixed(5)}, {c.longitude?.toFixed(5)})
                        </a>
                      </div>
                    )}
                    {c.dispatcher && (
                      <div style={{ color: 'var(--text-muted)' }}>
                        <span style={{ color: 'var(--text)', fontWeight: 500 }}>Điều phối:</span> {c.dispatcher}
                      </div>
                    )}
                    {c.site && (
                      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        Site: {c.site}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {centers.length === 0 && (
                <p style={{ color: 'var(--text-muted)', gridColumn: '1/-1', textAlign: 'center', padding: '40px 0' }}>
                  Không có trạm bảo hành nào.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
