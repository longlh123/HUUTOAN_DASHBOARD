import { Fragment, useMemo, useState } from 'react'
import type { CostComparison, CostComparisonItem, CostBomBreakdown } from '../api/sales'
import { fetchCostBomBreakdown } from '../api/sales'
import { fmtVNDFull } from '../utils/format'

type Props = {
  data:    CostComparison | null
  loading: boolean
}

type Sort = 'diff_desc' | 'diff_asc'

const PAGE_SIZE = 10

function diffLevel(pct: number | null): 'overdue' | 'soon' | 'ok' {
  const abs = Math.abs(pct ?? 0)
  if (abs >= 20) return 'overdue'
  if (abs >= 10) return 'soon'
  return 'ok'
}

export function CostComparisonTable({ data, loading }: Props) {
  const [search, setSearch] = useState('')
  const [sort,   setSort]   = useState<Sort>('diff_desc')
  const [page,   setPage]   = useState(0)

  const [expanded,    setExpanded]    = useState<string | null>(null)
  const [bomCache,    setBomCache]    = useState<Record<string, CostBomBreakdown>>({})
  const [bomLoading,  setBomLoading]  = useState<string | null>(null)

  function toggleExpand(itemNumber: string) {
    if (expanded === itemNumber) {
      setExpanded(null)
      return
    }
    setExpanded(itemNumber)
    if (!bomCache[itemNumber]) {
      setBomLoading(itemNumber)
      fetchCostBomBreakdown(itemNumber)
        .then(r => setBomCache(prev => ({ ...prev, [itemNumber]: r })))
        .catch(() => {})
        .finally(() => setBomLoading(null))
    }
  }

  const items: CostComparisonItem[] = data?.items ?? []
  const summary = data?.summary ?? null

  const filtered = useMemo(() => {
    let list = items
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(r => r.name.toLowerCase().includes(q) || r.item_number.toLowerCase().includes(q))
    }
    return [...list].sort((a, b) =>
      sort === 'diff_asc'
        ? (a.diff_pct ?? 0) - (b.diff_pct ?? 0)
        : (b.diff_pct ?? 0) - (a.diff_pct ?? 0)
    )
  }, [items, search, sort])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageData   = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <>
      {loading ? (
        <p className="table-placeholder">Đang tải... (lần đầu có thể mất 1-2 phút do dữ liệu giá lớn)</p>
      ) : !summary ? (
        <p className="table-placeholder">Không có dữ liệu</p>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="card kpi-card">
              <p className="kpi-card__label">Có đủ giá để so sánh</p>
              <p className="kpi-card__value">{summary.both_prices.toLocaleString('vi-VN')}</p>
              <p className="kpi-card__sub">/ {summary.total_items.toLocaleString('vi-VN')} item có giá</p>
            </div>
            <div className="card kpi-card">
              <p className="kpi-card__label">Thực sự lệch giá</p>
              <p className="kpi-card__value" style={{ color: '#dc2626' }}>{summary.different.toLocaleString('vi-VN')}</p>
              <p className="kpi-card__sub">
                {summary.both_prices > 0 ? Math.round(summary.different / summary.both_prices * 100) : 0}% số item so sánh được
              </p>
            </div>
            <div className="card kpi-card">
              <p className="kpi-card__label">Đã khớp giá</p>
              <p className="kpi-card__value" style={{ color: '#16a34a' }}>{summary.exact_match.toLocaleString('vi-VN')}</p>
              <p className="kpi-card__sub">Standard = Planned</p>
            </div>
            <div className="card kpi-card">
              <p className="kpi-card__label">Thiếu dữ liệu</p>
              <p className="kpi-card__value" style={{ color: '#ca8a04' }}>
                {(summary.only_standard + summary.only_planned).toLocaleString('vi-VN')}
              </p>
              <p className="kpi-card__sub">
                {summary.only_standard.toLocaleString('vi-VN')} thiếu Planned · {summary.only_planned.toLocaleString('vi-VN')} thiếu Standard
              </p>
            </div>
          </div>

          <div className="card">
            <div className="leaderboard__toolbar">
              <h2 className="card__title" style={{ marginBottom: 0 }}>So sánh Standard vs Planned cost</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  className="leaderboard__team-select"
                  placeholder="Tìm sản phẩm..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0) }}
                />
                <select
                  className="leaderboard__team-select"
                  value={sort}
                  onChange={e => setSort(e.target.value as Sort)}
                >
                  <option value="diff_desc">Chênh lệch % (cao → thấp)</option>
                  <option value="diff_asc">Chênh lệch % (thấp → cao)</option>
                </select>
              </div>
            </div>

            {filtered.length === 0 ? (
              <p className="table-placeholder">Không có item khớp điều kiện lọc</p>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="leaderboard">
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'right' }}>#</th>
                        <th>Sản phẩm</th>
                        <th style={{ textAlign: 'right' }}>Standard cost</th>
                        <th className="hide-sm">Ngày cập nhật</th>
                        <th style={{ textAlign: 'right' }}>Planned cost</th>
                        <th className="hide-sm">Ngày cập nhật</th>
                        <th style={{ textAlign: 'right' }}>Chênh lệch</th>
                        <th style={{ textAlign: 'right' }}>%</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageData.map((item, i) => (
                        <Fragment key={item.item_number}>
                          <tr>
                            <td className="leaderboard__rank">{page * PAGE_SIZE + i + 1}</td>
                            <td className="leaderboard__name">
                              {item.name}
                              <div style={{ fontSize: 11, color: 'var(--text)' }}>{item.item_number}</div>
                            </td>
                            <td className="leaderboard__value">{fmtVNDFull(item.standard_price)}</td>
                            <td className="hide-sm">{item.standard_date ?? '—'}</td>
                            <td className="leaderboard__value">{fmtVNDFull(item.planned_price)}</td>
                            <td className="hide-sm">{item.planned_date ?? '—'}</td>
                            <td className="leaderboard__value">{fmtVNDFull(item.diff)}</td>
                            <td>
                              <span className={`debt-badge debt-badge--${diffLevel(item.diff_pct)}`}>
                                {item.diff_pct !== null ? `${item.diff_pct > 0 ? '+' : ''}${item.diff_pct}%` : '—'}
                              </span>
                            </td>
                            <td>
                              {item.has_bom && (
                                <button
                                  className="pagination__btn"
                                  onClick={() => toggleExpand(item.item_number)}
                                >
                                  {expanded === item.item_number ? 'Ẩn BOM ▴' : 'Xem BOM ▾'}
                                </button>
                              )}
                            </td>
                          </tr>
                          {expanded === item.item_number && (
                            <tr className="cost-bom-row">
                              <td colSpan={9}>
                                <CostBomDetail
                                  loading={bomLoading === item.item_number}
                                  data={bomCache[item.item_number] ?? null}
                                />
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
      )}
    </>
  )
}

type BomDetailProps = {
  loading: boolean
  data:    CostBomBreakdown | null
}

function CostBomDetail({ loading, data }: BomDetailProps) {
  if (loading) {
    return <p className="table-placeholder">Đang tải BOM...</p>
  }
  if (!data || data.components.length === 0) {
    return (
      <p className="table-placeholder">
        Không có dữ liệu linh kiện (BOM chưa từng phát sinh production order)
      </p>
    )
  }

  const rollupDiff = data.rollup_planned - data.rollup_standard

  return (
    <div className="cost-bom-detail">
      <p className="cost-bom-detail__title">
        BOM {data.bom_id} — linh kiện cấu thành {data.item_name}
      </p>
      <table className="leaderboard">
        <thead>
          <tr>
            <th>Linh kiện</th>
            <th style={{ textAlign: 'right' }}>Định mức</th>
            <th style={{ textAlign: 'right' }}>Standard/đv</th>
            <th style={{ textAlign: 'right' }}>Planned/đv</th>
            <th style={{ textAlign: 'right' }}>Chênh lệch (theo định mức)</th>
          </tr>
        </thead>
        <tbody>
          {data.components.map(c => (
            <tr key={c.item_number}>
              <td className="leaderboard__name">
                {c.name}
                <div style={{ fontSize: 11, color: 'var(--text)' }}>{c.item_number}</div>
              </td>
              <td className="leaderboard__num">{c.qty} {c.unit}</td>
              <td className="leaderboard__value">{c.standard_price !== null ? fmtVNDFull(c.standard_price) : '—'}</td>
              <td className="leaderboard__value">{c.planned_price !== null ? fmtVNDFull(c.planned_price) : '—'}</td>
              <td className="leaderboard__value">{c.diff !== null ? fmtVNDFull(c.diff) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="cost-bom-detail__note">
        Tổng roll-up từ linh kiện: Standard {fmtVNDFull(data.rollup_standard)} · Planned {fmtVNDFull(data.rollup_planned)} · Chênh lệch {fmtVNDFull(rollupDiff)}
        <br />
        (chỉ tính chi phí nguyên vật liệu trực tiếp — chưa gồm nhân công/overhead, có thể không khớp 100% với giá standard/planned của item cha)
      </p>
    </div>
  )
}
