import { useEffect, useState } from 'react'
import type { OppActivityRow, DateRange } from '../api/sales'
import { fetchOppActivity } from '../api/sales'
import { fmtVND } from '../utils/format'
import { getThisWeekRange, getThisMonthRange, getThisQuarterRange } from '../utils/date'

const PAGE_SIZE = 10

type LocalPreset = 'all' | 'week' | 'month' | 'quarter'

const PRESETS: { key: LocalPreset; label: string }[] = [
  { key: 'all',     label: 'Theo bộ lọc' },
  { key: 'week',    label: 'Tuần này' },
  { key: 'month',   label: 'Tháng này' },
  { key: 'quarter', label: 'Quý này' },
]

function resolveRange(preset: LocalPreset, parentRange: DateRange): DateRange {
  if (preset === 'week')    return getThisWeekRange()
  if (preset === 'month')   return getThisMonthRange()
  if (preset === 'quarter') return getThisQuarterRange()
  return parentRange
}

type Props = {
  range:      DateRange
  territory:  string
  department?: string
}

function daysAgo(iso: string | null): string {
  if (!iso) return '—'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return 'Hôm nay'
  if (days === 1) return 'Hôm qua'
  return `${days} ngày trước`
}

function activityLevel(opps: number): string {
  if (opps >= 10) return 'high'
  if (opps >= 4)  return 'mid'
  return 'low'
}

export function OppActivityTable({ range, territory, department }: Props) {
  const [data,        setData]        = useState<OppActivityRow[]>([])
  const [loading,     setLoading]     = useState(true)
  const [page,        setPage]        = useState(0)
  const [localPreset, setLocalPreset] = useState<LocalPreset>('all')

  const effectiveRange = resolveRange(localPreset, range)

  useEffect(() => {
    setLoading(true)
    setPage(0)
    fetchOppActivity(effectiveRange, territory, department)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [effectiveRange.from, effectiveRange.to, territory, department])

  if (loading) return (
    <div className="card">
      <h2 className="card__title">Muc do chu dong mo co hoi</h2>
      <p className="table-placeholder">Dang tai...</p>
    </div>
  )

  if (data.length === 0) return (
    <div className="card">
      <h2 className="card__title">Muc do chu dong mo co hoi</h2>
      <p className="table-placeholder">Khong co du lieu trong ky nay</p>
    </div>
  )

  const totalOpps      = data.reduce((s, r) => s + r.new_opps, 0)
  const totalPipeline  = data.reduce((s, r) => s + r.new_pipeline_value, 0)
  const totalCustomers = data.reduce((s, r) => s + r.new_customers, 0)

  const pages = Math.ceil(data.length / PAGE_SIZE)
  const slice = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="card">
      <div className="card__header-row">
        <div>
          <h2 className="card__title">Muc do chu dong mo co hoi</h2>
          <p className="card__desc">So opp moi tao trong ky — phan biet ai dang tich cuc prospecting</p>
        </div>
        <div className="date-filter__presets">
          {PRESETS.map(p => (
            <button
              key={p.key}
              className={`date-filter__btn${localPreset === p.key ? ' date-filter__btn--active' : ''}`}
              onClick={() => setLocalPreset(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <table className="leaderboard">
        <thead>
          <tr>
            <th style={{ textAlign: 'right' }}>#</th>
            <th>Salesperson</th>
            <th style={{ textAlign: 'right' }}>Opp moi</th>
            <th style={{ textAlign: 'right' }}>Gia tri pipeline moi</th>
            <th style={{ textAlign: 'right' }}>Khach hang tiep can</th>
            <th style={{ textAlign: 'right' }}>Opp gan nhat</th>
          </tr>
        </thead>
        <tbody>
          {slice.map((row, i) => (
            <tr key={row.owner_id}>
              <td className="leaderboard__rank">{page * PAGE_SIZE + i + 1}</td>
              <td className="leaderboard__name">{row.name}</td>
              <td className="leaderboard__num">
                <span className={`win-rate win-rate--${activityLevel(row.new_opps)}`}>
                  {row.new_opps}
                </span>
              </td>
              <td className="leaderboard__value">{fmtVND(row.new_pipeline_value)}</td>
              <td className="leaderboard__num">{row.new_customers}</td>
              <td className="leaderboard__num">{daysAgo(row.last_opp_created)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="kpi-perf__total-row">
            <td colSpan={2}><strong>Tong ({data.length} thanh vien)</strong></td>
            <td style={{ textAlign: 'right' }}><strong>{totalOpps}</strong></td>
            <td style={{ textAlign: 'right' }}><strong>{fmtVND(totalPipeline)}</strong></td>
            <td style={{ textAlign: 'right' }}><strong>{totalCustomers}</strong></td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      {pages > 1 && (
        <div className="pagination">
          <button className="pagination__btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            &laquo; Truoc
          </button>
          <span className="pagination__info">Trang {page + 1} / {pages}</span>
          <button className="pagination__btn" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>
            Tiep &raquo;
          </button>
        </div>
      )}
    </div>
  )
}
