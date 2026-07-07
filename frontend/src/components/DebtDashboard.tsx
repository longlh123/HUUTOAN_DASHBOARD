import { useMemo, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import type { DebtAging, DebtAgingItem } from '../api/sales'
import { fmtVND, fmtVNDFull } from '../utils/format'

type Props = {
  data:    DebtAging | null
  loading: boolean
}

type Side   = 'ar' | 'ap'
type Bucket = 'all' | 'not_due' | 'd1_30' | 'd31_60' | 'd61_90' | 'over90'
type Sort   = 'overdue' | 'amount'

const PAGE_SIZE = 10

const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'all',     label: 'Tất cả aging' },
  { key: 'not_due', label: 'Chưa đến hạn' },
  { key: 'd1_30',   label: '1-30 ngày' },
  { key: 'd31_60',  label: '31-60 ngày' },
  { key: 'd61_90',  label: '61-90 ngày' },
  { key: 'over90',  label: '>90 ngày' },
]

const BUCKET_COLORS: Record<Exclude<Bucket, 'all'>, string> = {
  not_due: '#16a34a',
  d1_30:   '#eab308',
  d31_60:  '#f97316',
  d61_90:  '#dc2626',
  over90:  '#57534e',
}

function agingBucket(days: number | null): Exclude<Bucket, 'all'> {
  if (days === null || days <= 0) return 'not_due'
  if (days <= 30) return 'd1_30'
  if (days <= 60) return 'd31_60'
  if (days <= 90) return 'd61_90'
  return 'over90'
}

function agingLevel(daysOverdue: number | null): 'overdue' | 'soon' | 'ok' {
  if (daysOverdue === null) return 'ok'
  if (daysOverdue > 0) return 'overdue'
  if (daysOverdue >= -7) return 'soon'
  return 'ok'
}

function agingLabel(daysOverdue: number | null): string {
  if (daysOverdue === null) return '—'
  if (daysOverdue > 0) return `Quá hạn ${daysOverdue} ngày`
  if (daysOverdue === 0) return 'Đến hạn hôm nay'
  return `Còn ${-daysOverdue} ngày`
}

export function DebtDashboard({ data, loading }: Props) {
  const [side,   setSide]   = useState<Side>('ar')
  const [bucket, setBucket] = useState<Bucket>('all')
  const [search, setSearch] = useState('')
  const [sort,   setSort]   = useState<Sort>('overdue')
  const [page,   setPage]   = useState(0)

  const rows: DebtAgingItem[] = side === 'ar' ? (data?.ar ?? []) : (data?.ap ?? [])

  const summary = useMemo(() => {
    const total    = rows.reduce((s, r) => s + Math.abs(r.amount), 0)
    const overdue  = rows.filter(r => (r.days_overdue ?? 0) > 0).reduce((s, r) => s + Math.abs(r.amount), 0)
    const badDebt  = rows.filter(r => (r.days_overdue ?? 0) > 90)
    const notDue   = rows.filter(r => (r.days_overdue ?? 0) <= 0)
    return {
      total,
      overdue,
      overduePct: total > 0 ? Math.round(overdue / total * 100) : 0,
      badDebtAmount: badDebt.reduce((s, r) => s + Math.abs(r.amount), 0),
      badDebtCustomers: new Set(badDebt.map(r => r.account_num)).size,
      notDueAmount: notDue.reduce((s, r) => s + Math.abs(r.amount), 0),
      notDueCustomers: new Set(notDue.map(r => r.account_num)).size,
      totalCustomers: new Set(rows.map(r => r.account_num)).size,
    }
  }, [rows])

  const bucketData = useMemo(() => {
    const sums: Record<Exclude<Bucket, 'all'>, number> = { not_due: 0, d1_30: 0, d31_60: 0, d61_90: 0, over90: 0 }
    rows.forEach(r => { sums[agingBucket(r.days_overdue)] += Math.abs(r.amount) })
    return (Object.keys(sums) as Exclude<Bucket, 'all'>[])
      .map(key => ({ key, label: BUCKETS.find(b => b.key === key)!.label, value: sums[key], fill: BUCKET_COLORS[key] }))
  }, [rows])

  const top5 = useMemo(() => {
    const byCustomer = new Map<string, number>()
    rows.forEach(r => byCustomer.set(r.name, (byCustomer.get(r.name) ?? 0) + Math.abs(r.amount)))
    return Array.from(byCustomer.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
      .reverse() // Recharts horizontal bar vẽ từ dưới lên — reverse để hạng 1 nằm trên cùng
  }, [rows])

  const filtered = useMemo(() => {
    let list = rows
    if (bucket !== 'all') list = list.filter(r => agingBucket(r.days_overdue) === bucket)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(r => r.name.toLowerCase().includes(q))
    }
    return [...list].sort((a, b) =>
      sort === 'amount'
        ? Math.abs(b.amount) - Math.abs(a.amount)
        : (b.days_overdue ?? -Infinity) - (a.days_overdue ?? -Infinity)
    )
  }, [rows, bucket, search, sort])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageData   = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function switchSide(s: Side) {
    setSide(s)
    setBucket('all')
    setSearch('')
    setPage(0)
  }

  return (
    <>
      <div className="date-filter" style={{ marginBottom: 16 }}>
        <div className="date-filter__presets">
          <button
            className={`date-filter__btn${side === 'ar' ? ' date-filter__btn--active' : ''}`}
            onClick={() => switchSide('ar')}
          >
            Phải thu ({data?.ar.length ?? 0})
          </button>
          <button
            className={`date-filter__btn${side === 'ap' ? ' date-filter__btn--active' : ''}`}
            onClick={() => switchSide('ap')}
          >
            Phải trả ({data?.ap.length ?? 0})
          </button>
        </div>
      </div>

      {loading ? (
        <p className="table-placeholder">Đang tải...</p>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="card kpi-card">
              <p className="kpi-card__label">Tổng nợ</p>
              <p className="kpi-card__value">{fmtVND(summary.total)}</p>
              <p className="kpi-card__sub">{summary.totalCustomers} khách hàng</p>
            </div>
            <div className="card kpi-card">
              <p className="kpi-card__label">Quá hạn</p>
              <p className="kpi-card__value" style={{ color: '#dc2626' }}>{fmtVND(summary.overdue)}</p>
              <p className="kpi-card__sub">{summary.overduePct}% tổng nợ</p>
            </div>
            <div className="card kpi-card">
              <p className="kpi-card__label">Nợ xấu (&gt;90 ngày)</p>
              <p className="kpi-card__value" style={{ color: '#57534e' }}>{fmtVND(summary.badDebtAmount)}</p>
              <p className="kpi-card__sub">{summary.badDebtCustomers} khách hàng</p>
            </div>
            <div className="card kpi-card">
              <p className="kpi-card__label">Chưa đến hạn</p>
              <p className="kpi-card__value" style={{ color: '#16a34a' }}>{fmtVND(summary.notDueAmount)}</p>
              <p className="kpi-card__sub">{summary.notDueCustomers} khách hàng</p>
            </div>
          </div>

          <div className="row-2col">
            <div className="card">
              <h2 className="card__title">Phân bổ aging</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie data={bucketData} dataKey="value" nameKey="label" innerRadius={55} outerRadius={90} paddingAngle={1} strokeWidth={0}>
                      {bucketData.map(d => <Cell key={d.key} fill={d.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => fmtVND(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex: 1, fontSize: 13 }}>
                  {bucketData.map(d => (
                    <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.fill, flexShrink: 0 }} />
                      <span style={{ color: 'var(--text)', flex: 1 }}>{d.label}</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-h)' }}>{fmtVND(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card">
              <h2 className="card__title">Top 5 {side === 'ar' ? 'khách hàng' : 'nhà cung cấp'} nợ nhiều nhất</h2>
              {top5.length === 0 ? (
                <p className="table-placeholder">Không có dữ liệu</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={top5} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" tickFormatter={v => fmtVND(Number(v))} tick={{ fontSize: 11, fill: 'var(--text)' }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={140}
                      tick={{ fontSize: 11, fill: 'var(--text)' }}
                      tickFormatter={(v: string) => v.length > 20 ? v.slice(0, 20) + '…' : v}
                    />
                    <Tooltip formatter={(v: unknown) => fmtVND(Number(v))} />
                    <Bar dataKey="value" fill="var(--accent)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="card">
            <div className="leaderboard__toolbar">
              <h2 className="card__title" style={{ marginBottom: 0 }}>Chi tiết công nợ</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select
                  className="leaderboard__team-select"
                  value={bucket}
                  onChange={e => { setBucket(e.target.value as Bucket); setPage(0) }}
                >
                  {BUCKETS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                </select>
                <input
                  className="leaderboard__team-select"
                  placeholder="Tìm khách hàng..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0) }}
                />
                <select
                  className="leaderboard__team-select"
                  value={sort}
                  onChange={e => setSort(e.target.value as Sort)}
                >
                  <option value="overdue">Quá hạn nhiều nhất</option>
                  <option value="amount">Nợ nhiều nhất</option>
                </select>
              </div>
            </div>

            {filtered.length === 0 ? (
              <p className="table-placeholder">Không có công nợ khớp điều kiện lọc</p>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="leaderboard">
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'right' }}>#</th>
                        <th>{side === 'ar' ? 'Khách hàng' : 'Nhà cung cấp'}</th>
                        <th className="hide-sm">Diễn giải</th>
                        <th className="hide-sm">Ngày GD</th>
                        <th>Hạn thanh toán</th>
                        <th style={{ textAlign: 'right' }}>Số tiền</th>
                        <th>Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageData.map((item, i) => (
                        <tr key={`${item.account_num}-${item.due_date}-${page * PAGE_SIZE + i}`}>
                          <td className="leaderboard__rank">{page * PAGE_SIZE + i + 1}</td>
                          <td className="leaderboard__name">{item.name}</td>
                          <td className="hide-sm">{item.description || '—'}</td>
                          <td className="hide-sm">{item.trans_date ?? '—'}</td>
                          <td>{item.due_date ?? '—'}</td>
                          <td className="leaderboard__value">{fmtVNDFull(item.amount)}</td>
                          <td>
                            <span className={`debt-badge debt-badge--${agingLevel(item.days_overdue)}`}>
                              {agingLabel(item.days_overdue)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="pagination">
                    <button className="pagination__btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Trước</button>
                    <span className="pagination__info">{page + 1} / {totalPages}</span>
                    <button className="pagination__btn" disabled={page === totalPages - 1} onClick={() => setPage(p => p + 1)}>Sau →</button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}
