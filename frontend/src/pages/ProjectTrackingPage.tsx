import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ProjectListItem, ProjectStatus } from '../api/sales'
import { fetchProjectList } from '../api/sales'
import { fmtVNDFull } from '../utils/format'

const STATUSES: ProjectStatus[] = ['In Process', 'Warranty', 'Closed', 'Estimated', 'Created']

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

function agingLevel(days: number | null): 'none' | 'ok' | 'watch' | 'stale' {
  if (days === null) return 'none'
  if (days <= 30) return 'ok'
  if (days <= 90) return 'watch'
  return 'stale'
}

export function ProjectTrackingPage() {
  const [status,  setStatus]  = useState<ProjectStatus>('In Process')
  const [rows,    setRows]    = useState<ProjectListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchProjectList('B2B', status)
      .then(data => { if (!cancelled) setRows(data) })
      .catch(e => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [status])

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1 className="dashboard__title">Theo dõi dự án B2B</h1>
        <div className="date-filter__presets">
          {STATUSES.map(s => (
            <button
              key={s}
              className={`date-filter__btn${status === s ? ' date-filter__btn--active' : ''}`}
              onClick={() => setStatus(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <p className="table-placeholder" style={{ padding: '0 0 16px', textAlign: 'left', color: 'var(--text)' }}>
        {status === 'In Process'
          ? 'Sắp xếp theo hoạt động gần nhất (lâu nhất lên đầu) — dự án nào lâu không có giao dịch mới đáng chú ý nhất. '
          : `Đang xem dự án trạng thái "${status}". `}
        Không có cột "% hoàn thành" vì giá trị hợp đồng gốc trong hệ thống hiện chưa đáng tin. Click 1 dòng để xem
        dòng thời gian giao dịch chi tiết.
      </p>

      {error && <div className="dashboard__error">{error}</div>}

      <div className="card">
        {loading ? (
          <p className="table-placeholder">Đang tải... (lần đầu có thể mất 20-30s do đối chiếu nhiều dự án)</p>
        ) : rows.length === 0 ? (
          <p className="table-placeholder">Không có dự án nào ở trạng thái này.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="leaderboard">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Dự án</th>
                  <th>Khách hàng</th>
                  <th>Phụ trách</th>
                  <th>Trạng thái</th>
                  <th>Bắt đầu</th>
                  <th>Hoạt động gần nhất</th>
                  <th style={{ textAlign: 'right' }}>Doanh thu đã ghi nhận</th>
                  <th style={{ textAlign: 'right' }}>Chi phí đã ghi nhận</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const level = agingLevel(r.days_since_activity)
                  return (
                    <tr
                      key={r.code}
                      onClick={() => navigate(`/dashboard/sales/projects/${encodeURIComponent(r.code)}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="leaderboard__rank">{i + 1}</td>
                      <td className="leaderboard__name">
                        <div>{r.code}</div>
                        <div style={{ fontSize: 12, color: 'var(--text)' }}>{r.description}</div>
                      </td>
                      <td>{r.customer || '—'}</td>
                      <td>{r.owner || '—'}</td>
                      <td><span className="badge badge--status">{r.status}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.start_date)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {r.last_activity_at ? (
                          <>
                            {fmtDate(r.last_activity_at)}{' '}
                            <span className={`debt-badge debt-badge--${level === 'ok' ? 'ok' : level === 'watch' ? 'soon' : 'overdue'}`}>
                              {r.days_since_activity} ngày trước
                            </span>
                          </>
                        ) : (
                          <span className="debt-badge debt-badge--overdue">Chưa có giao dịch</span>
                        )}
                      </td>
                      <td className="leaderboard__value">{fmtVNDFull(r.revenue_to_date)}</td>
                      <td className="leaderboard__value">{fmtVNDFull(r.cost_to_date)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
