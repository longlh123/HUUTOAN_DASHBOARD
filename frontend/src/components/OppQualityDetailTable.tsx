import { useMemo, useState } from 'react'
import type { OppQualityDetailRow } from '../api/sales'
import { fmtVNDFull } from '../utils/format'

type Props = {
  data:    OppQualityDetailRow[]
  loading: boolean
}

const PAGE_SIZE = 10

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`
}

function StatusBadges({ opp }: { opp: OppQualityDetailRow }) {
  const badges: { text: string; cls: string }[] = []
  if (!opp.has_quote) badges.push({ text: 'Chua co Quote', cls: 'speed-badge--slow' })
  if (!opp.complete) badges.push({ text: 'Thieu thong tin', cls: 'speed-badge--mid' })
  if (opp.has_quote && opp.no_activity_30d) badges.push({ text: 'Im lang 30 ngay', cls: 'speed-badge--slow' })
  if (opp.backdated) badges.push({ text: 'Nghi nhap tre', cls: 'speed-badge--mid' })

  if (badges.length === 0) {
    return <span className="speed-badge speed-badge--fast">On</span>
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {badges.map((b, i) => (
        <span key={i} className={`speed-badge ${b.cls}`}>{b.text}</span>
      ))}
    </div>
  )
}

export function OppQualityDetailTable({ data, loading }: Props) {
  const [ownerFilter, setOwnerFilter] = useState('ALL')
  const [page, setPage] = useState(0)

  const owners = useMemo(
    () => Array.from(new Set(data.map(o => o.owner))).sort(),
    [data]
  )

  const filtered = useMemo(
    () => ownerFilter === 'ALL' ? data : data.filter(o => o.owner === ownerFilter),
    [data, ownerFilter]
  )

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  if (loading && data.length === 0) {
    return <p className="table-placeholder">Dang tai...</p>
  }
  if (data.length === 0) {
    return <p className="table-placeholder">Khong co du lieu</p>
  }

  return (
    <div className="card">
      <div className="leaderboard__toolbar">
        <h2 className="card__title" style={{ marginBottom: 0 }}>Danh sach Opp — chi tiet</h2>
        <select
          className="leaderboard__team-select"
          value={ownerFilter}
          onChange={e => { setOwnerFilter(e.target.value); setPage(0) }}
        >
          <option value="ALL">Tat ca salesperson</option>
          {owners.map(o => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>
      <p className="card__desc">Bam vao ma Opp de mo tren CRM, kiem tra va cap nhat thong tin</p>

      <div className="table-wrap">
        <table className="leaderboard">
          <thead>
            <tr>
              <th style={{ textAlign: 'right' }}>#</th>
              <th>Ma</th>
              <th>Co hoi</th>
              <th>Salesperson</th>
              <th style={{ textAlign: 'right' }}>Ngay tao</th>
              <th style={{ textAlign: 'right' }}>Du kien chot</th>
              <th style={{ textAlign: 'right' }}>Gia tri</th>
              <th>Trang thai</th>
            </tr>
          </thead>
          <tbody>
            {pageData.length === 0 ? (
              <tr><td colSpan={8} className="table-placeholder">Khong co Opp nao khop dieu kien loc</td></tr>
            ) : pageData.map((opp, i) => (
              <tr key={opp.opportunity_id}>
                <td className="leaderboard__rank">{page * PAGE_SIZE + i + 1}</td>
                <td>
                  {opp.crm_link
                    ? <a href={opp.crm_link} target="_blank" rel="noreferrer" className="crm-link">
                        {opp.opp_number || 'Xem CRM'} ↗
                      </a>
                    : <span>{opp.opp_number || '—'}</span>
                  }
                </td>
                <td className="leaderboard__name">{opp.name}</td>
                <td>{opp.owner}</td>
                <td className="leaderboard__num">{fmtDate(opp.created_on)}</td>
                <td className="leaderboard__num">{fmtDate(opp.estimated_close)}</td>
                <td className="leaderboard__value">{fmtVNDFull(opp.estimated_value)}</td>
                <td><StatusBadges opp={opp} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button className="pagination__btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            &laquo; Truoc
          </button>
          <span className="pagination__info">Trang {page + 1} / {totalPages} ({filtered.length} Opp)</span>
          <button className="pagination__btn" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
            Tiep &raquo;
          </button>
        </div>
      )}
    </div>
  )
}
