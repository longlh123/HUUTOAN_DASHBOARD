import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { ProjectTimeline, ProjectTransaction } from '../api/sales'
import { fetchProjectTimeline } from '../api/sales'
import { fmtVNDFull } from '../utils/format'

function fmtDate(s: string): string {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

function kindLabel(t: ProjectTransaction): string {
  if (t.type === 'OnAccount') return 'Xuất hoá đơn mốc'
  if (t.type === 'Item') return `Xuất vật tư${t.category ? ` — ${t.category}` : ''}`
  return `Chi phí${t.category ? ` — ${t.category}` : ''}`
}

type Group = { date: string; items: ProjectTransaction[] }

function groupByDate(transactions: ProjectTransaction[]): Group[] {
  const groups: Group[] = []
  for (const t of transactions) {
    const last = groups[groups.length - 1]
    if (last && last.date === t.date) last.items.push(t)
    else groups.push({ date: t.date, items: [t] })
  }
  return groups
}

const GAP_THRESHOLD_DAYS = 60

export function ProjectTimelinePage() {
  const { code } = useParams<{ code: string }>()
  const [data,    setData]    = useState<ProjectTimeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!code) return
    let cancelled = false
    setLoading(true)
    fetchProjectTimeline(code)
      .then(res => { if (!cancelled) setData(res) })
      .catch(e => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [code])

  if (loading) return <div className="dashboard"><p className="table-placeholder">Đang tải...</p></div>
  if (error)   return <div className="dashboard"><div className="dashboard__error">{error}</div></div>
  if (!data)   return null

  const groups = groupByDate(data.transactions)

  return (
    <div className="dashboard">
      <div className="dashboard__header" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <Link to="/dashboard/sales/projects" className="project-timeline__back">← Danh sách dự án</Link>
        <h1 className="dashboard__title">{data.project.description || data.project.code}</h1>
        <p className="project-timeline__sub">
          Mã dự án <b>{data.project.code}</b> · Khách hàng <b>{data.project.customer || '—'}</b> · Phụ trách <b>{data.project.owner || '—'}</b>
        </p>
        <div className="project-timeline__badges">
          <span className="badge badge--status">● {data.project.status || '—'}</span>
          <span className="badge">Bắt đầu {data.project.start_date ? fmtDate(data.project.start_date) : '—'}</span>
        </div>
      </div>

      <div className="card project-timeline__stats">
        <div>
          <p className="project-timeline__stat-label">Giá trị báo giá</p>
          <p className="project-timeline__stat-value">{data.project.quote_amount != null ? fmtVNDFull(data.project.quote_amount) : '—'}</p>
        </div>
        <div>
          <p className="project-timeline__stat-label">Đã xuất hoá đơn</p>
          <p className="project-timeline__stat-value project-timeline__stat-value--accent">{fmtVNDFull(data.totals.revenue)}</p>
        </div>
        <div>
          <p className="project-timeline__stat-label">Giá vốn vật tư</p>
          <p className="project-timeline__stat-value project-timeline__stat-value--cost">{fmtVNDFull(data.totals.material_cost)}</p>
        </div>
        <div>
          <p className="project-timeline__stat-label">Chi phí nhân công / dịch vụ</p>
          <p className="project-timeline__stat-value project-timeline__stat-value--cost">{fmtVNDFull(data.totals.labor_cost)}</p>
        </div>
        <p className="project-timeline__stat-note">
          Giá trị báo giá không dùng để tính "% hoàn thành" — báo giá gốc chưa xác nhận là đáng tin làm mốc so sánh,
          chỉ để tham chiếu quy mô dự án. "Giá vốn vật tư" (xuất kho máy/vật tư) tách riêng khỏi "Chi phí nhân công/dịch vụ"
          (thầu phụ, công tác phí...) — cộng 2 ô này lại mới ra tổng giá vốn thật của dự án.
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="table-placeholder">Chưa có giao dịch nào ghi nhận cho dự án này.</p>
      ) : (
        <div className="project-timeline">
          {groups.map((g, i) => {
            const prev = groups[i - 1]
            const gapDays = prev ? Math.round((new Date(g.date).getTime() - new Date(prev.date).getTime()) / 86400000) : 0
            const hasMilestone = g.items.some(t => t.type === 'OnAccount')
            const groupRevenue = g.items.filter(t => t.type === 'OnAccount').reduce((s, t) => s + t.amount, 0)
            const groupCost = g.items.filter(t => t.type === 'Cost' || t.type === 'Item').reduce((s, t) => s + t.amount, 0)
            const who = g.items.find(t => t.who)?.who

            return (
              <div key={g.date}>
                {gapDays >= GAP_THRESHOLD_DAYS && (
                  <div className="project-timeline__gap">
                    <b>{gapDays} ngày</b> không có giao dịch nào — {fmtDate(prev.date)} → {fmtDate(g.date)}
                  </div>
                )}
                <div className={`project-timeline__node${hasMilestone ? ' project-timeline__node--milestone' : ''}`}>
                  <div className="project-timeline__dot" />
                  <div className="project-timeline__card">
                    <div className="project-timeline__card-top">
                      <span className="project-timeline__kind">
                        {g.items.length === 1 ? kindLabel(g.items[0]) : `${g.items.length} giao dịch`}
                      </span>
                      {hasMilestone
                        ? <span className="project-timeline__amount project-timeline__amount--accent">+{fmtVNDFull(groupRevenue)}</span>
                        : groupCost > 0 && <span className="project-timeline__amount project-timeline__amount--cost">{fmtVNDFull(groupCost)}</span>
                      }
                    </div>
                    <span className="project-timeline__date">{fmtDate(g.date)}</span>
                    {who && <p className="project-timeline__who">{who}</p>}
                    {g.items.length > 1 && (
                      <div className="project-timeline__lines">
                        {g.items.map((t, j) => (
                          <div className="project-timeline__line" key={j}>
                            <span>{kindLabel(t)}</span>
                            <span>{fmtVNDFull(t.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
