import { Fragment, useMemo, useState } from 'react'
import type { AdvanceLedger, AdvanceVendor } from '../api/sales'
import { fmtVND, fmtVNDFull } from '../utils/format'

type Props = {
  data:    AdvanceLedger | null
  loading: boolean
}

type Sort = 'name' | 'closing_desc'

const PAGE_SIZE = 10

export function AdvanceLedgerTable({ data, loading }: Props) {
  const [search,   setSearch]   = useState('')
  const [sort,     setSort]     = useState<Sort>('closing_desc')
  const [page,     setPage]     = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)

  const vendors: AdvanceVendor[] = data?.vendors ?? []
  const summary = data?.summary ?? null

  const filtered = useMemo(() => {
    let list = vendors
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(v => v.name.toLowerCase().includes(q) || v.account_num.toLowerCase().includes(q))
    }
    return [...list].sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : Math.abs(b.closing_balance) - Math.abs(a.closing_balance)
    )
  }, [vendors, search, sort])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageData   = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function toggleExpand(accountNum: string) {
    setExpanded(prev => prev === accountNum ? null : accountNum)
  }

  if (loading) {
    return <p className="table-placeholder">Đang tải...</p>
  }
  if (!summary) {
    return <p className="table-placeholder">Không có dữ liệu</p>
  }

  const netChange = summary.total_closing - summary.total_opening

  return (
    <>
      <div className="kpi-grid">
        <div className="card kpi-card">
          <p className="kpi-card__label">Nhân viên tạm ứng</p>
          <p className="kpi-card__value">{summary.vendor_count.toLocaleString('vi-VN')}</p>
          <p className="kpi-card__sub">có phát sinh trong kỳ</p>
        </div>
        <div className="card kpi-card">
          <p className="kpi-card__label">Số dư đầu kỳ</p>
          <p className="kpi-card__value">{fmtVND(summary.total_opening)}</p>
        </div>
        <div className="card kpi-card">
          <p className="kpi-card__label">Số dư cuối kỳ</p>
          <p className="kpi-card__value">{fmtVND(summary.total_closing)}</p>
        </div>
        <div className="card kpi-card">
          <p className="kpi-card__label">Biến động trong kỳ</p>
          <p className="kpi-card__value" style={{ color: netChange >= 0 ? '#dc2626' : '#16a34a' }}>
            {netChange >= 0 ? '+' : ''}{fmtVND(netChange)}
          </p>
        </div>
      </div>

      <div className="card">
        <div className="leaderboard__toolbar">
          <h2 className="card__title" style={{ marginBottom: 0 }}>Chi tiết TK 1411 — Tạm ứng cho nhân viên</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="leaderboard__team-select"
              placeholder="Tìm nhân viên..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0) }}
            />
            <select
              className="leaderboard__team-select"
              value={sort}
              onChange={e => setSort(e.target.value as Sort)}
            >
              <option value="closing_desc">Số dư cuối kỳ (cao → thấp)</option>
              <option value="name">Tên (A → Z)</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="table-placeholder">Không có nhân viên khớp điều kiện lọc</p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="leaderboard">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'right' }}>#</th>
                    <th>Nhân viên</th>
                    <th style={{ textAlign: 'right' }}>Số dư đầu kỳ</th>
                    <th style={{ textAlign: 'right' }}>Số dư cuối kỳ</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.map((v, i) => (
                    <Fragment key={v.account_num}>
                      <tr>
                        <td className="leaderboard__rank">{page * PAGE_SIZE + i + 1}</td>
                        <td className="leaderboard__name">
                          {v.name}
                          <div style={{ fontSize: 11, color: 'var(--text)' }}>{v.account_num}</div>
                        </td>
                        <td className="leaderboard__value">{fmtVNDFull(v.opening_balance)}</td>
                        <td className="leaderboard__value">{fmtVNDFull(v.closing_balance)}</td>
                        <td>
                          <button className="pagination__btn" onClick={() => toggleExpand(v.account_num)}>
                            {expanded === v.account_num ? 'Ẩn CT ▴' : 'Xem CT ▾'}
                          </button>
                        </td>
                      </tr>
                      {expanded === v.account_num && (
                        <tr className="cost-bom-row">
                          <td colSpan={5}>
                            <AdvanceDetail transactions={v.transactions} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
  )
}

function AdvanceDetail({ transactions }: { transactions: AdvanceVendor['transactions'] }) {
  if (transactions.length === 0) {
    return <p className="table-placeholder">Không có phát sinh trong kỳ</p>
  }

  const totalAdvance = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const totalSettle  = transactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)

  return (
    <>
      <p className="cost-bom-detail__note" style={{ margin: '0 0 10px' }}>
        Tổng tạm ứng thêm trong kỳ: <strong style={{ color: '#dc2626' }}>{fmtVNDFull(totalAdvance)}</strong>
        {' · '}
        Tổng cấn trừ/hoàn trả trong kỳ: <strong style={{ color: '#16a34a' }}>{fmtVNDFull(totalSettle)}</strong>
      </p>
      <table className="leaderboard">
        <thead>
          <tr>
            <th>Ngày phát sinh</th>
            <th>Diễn giải</th>
            <th style={{ textAlign: 'right' }}>Số tiền</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t, ti) => (
            <tr key={ti}>
              <td>{t.date}</td>
              <td className="leaderboard__name">{t.description || '—'}</td>
              <td className="leaderboard__value">{fmtVNDFull(t.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
