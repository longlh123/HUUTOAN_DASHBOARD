import { useEffect, useState } from 'react'
import ExcelJS from 'exceljs'
import type { ItemRow, ItemStats, ProductGroup } from '../api/items'
import { fetchItemCategories, fetchItems, fetchItemStats, fetchLifecycleStates, fetchProductGroups } from '../api/items'
import { fmtVNDFull } from '../utils/format'

const PAGE_SIZE = 20

const EXPORT_HEADERS = [
  'TT', 'Mã vật tư', 'Tên vật tư', 'Nhóm sản phẩm', 'ĐVT', 'Số lần bán',
  'Lần bán cuối (all time)', 'Lần XNK cuối (all time)', 'Lần bán cuối (3 năm)', 'Lần XNK cuối (3 năm)',
  'Tồn hiện tại', 'Giá vốn', 'Trạng thái F&O', 'Category hierarchy', 'Category', 'Gợi ý',
]
const EXPORT_COL_WIDTHS = [5, 14, 36, 24, 8, 12, 16, 16, 16, 16, 12, 14, 16, 24, 30, 24]

function exportCategoryHierarchyCell(r: ItemRow): string {
  const parts: string[] = []
  if (r.procurement_category) parts.push('HTG Procurement Categories')
  if (r.sales_category) parts.push('HTG Sales Categories')
  return parts.join('\n')
}

function exportCategoryCell(r: ItemRow): string {
  const parts: string[] = []
  if (r.procurement_category) parts.push(r.procurement_category)
  if (r.sales_category) parts.push(r.sales_category)
  return parts.join('\n')
}

async function exportItemsExcel(rows: ItemRow[]) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Vật tư')
  ws.columns = EXPORT_COL_WIDTHS.map(width => ({ width }))

  EXPORT_HEADERS.forEach((label, i) => {
    const cell = ws.getCell(1, i + 1)
    cell.value = label
    cell.font = { bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })

  rows.forEach((r, idx) => {
    const rowIdx = 2 + idx
    const values = [
      idx + 1, r.item_number, r.name ?? '', r.product_group_name ?? '', r.unit ?? '',
      r.has_ever_sold ? r.sale_count_all_time : 'Chưa từng bán',
      r.last_sale_date_all_time ?? '', r.last_inventory_txn_date_all_time ?? '',
      r.last_sale_date ?? '', r.last_inventory_txn_date ?? '',
      r.on_hand_qty, r.unit_cost > 0 ? r.unit_cost : '', r.lifecycle_state ?? '',
      exportCategoryHierarchyCell(r), exportCategoryCell(r),
      r.candidate_to_close ? 'Nên xem xét đóng' : '',
    ]
    values.forEach((v, i) => {
      const cell = ws.getCell(rowIdx, i + 1)
      cell.value = v
      cell.alignment = { wrapText: true, vertical: 'top' }
      if (i === 11) cell.numFmt = '#,##0'
    })
  })

  const buffer = await wb.xlsx.writeBuffer()
  const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href       = url
  a.download   = `vat-tu_${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

const LIFECYCLE_LABEL: Record<string, string> = {
  Active:     'Đang dùng',
  Blocked:    'Ngưng',
  'In-Review': 'Đang xét duyệt',
  'No Route':  'Thiếu Route',
  'BOM Ready': 'Sẵn sàng BOM',
}

function lifecycleBadge(state: string | null) {
  if (!state) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  const label = LIFECYCLE_LABEL[state] ?? state
  const color = state === 'Active' ? '#16a34a' : state === 'Blocked' ? '#ea580c' : '#6b7280'
  return <span style={{ color, fontWeight: 500 }}>{label}</span>
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

function saleCountCell(r: ItemRow) {
  if (!r.has_ever_sold) {
    return <span style={{ color: 'var(--text-muted)' }}>Chưa từng bán</span>
  }
  return <span style={{ color: 'var(--text)' }}>{r.sale_count_all_time}</span>
}

// Cot "(3 nam)" — chi hien khi item CO giao dich trong 3 nam gan nhat.
function withinCell(within3y: string | null) {
  if (!within3y) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  return <span style={{ color: 'var(--text)' }}>{fmtDate(within3y)}</span>
}

// Cot "(all time)" — chi hien khi item KHONG co giao dich trong 3 nam gan nhat (tranh trung lap
// voi cot "(3 nam)"), lay ngay that su gan nhat tu truoc toi gio.
function allTimeCell(within3y: string | null, allTime: string | null) {
  if (within3y || !allTime) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  return <span style={{ color: 'var(--text)' }}>{fmtDate(allTime)}</span>
}

function n(v: number): string {
  return v.toLocaleString('vi-VN')
}

// Thong ke tren bang vat tu — ho tro quyet dinh "co can block vat tu nay khong" theo 3 nhom:
// thanh pham / ban thanh pham / vat tu-NVL khac, trong cua so 3 nam gan nhat.
function ItemStatsCards({ stats, loading }: { stats: ItemStats | null; loading: boolean }) {
  const cards = [
    {
      label: 'Thành phẩm',
      value: stats ? n(stats.by_type.finished.total) : '—',
      sub: stats ? `${n(stats.by_type.finished.active_3y)} đang hoạt động (3 năm)` : '',
    },
    {
      label: `Thành phẩm tồn kho, không bán ${stats?.years ?? 3} năm`,
      value: stats ? n(stats.finished_unsold_with_stock.count) : '—',
      sub: stats ? `${fmtVNDFull(stats.finished_unsold_with_stock.stock_value)} tồn kho` : '',
    },
    {
      label: 'Bán thành phẩm',
      value: stats ? n(stats.by_type.semi_finished.total) : '—',
      sub: stats ? `${n(stats.by_type.semi_finished.active_3y)} đang hoạt động (3 năm)` : '',
    },
    {
      label: 'Bán thành phẩm tạo ra nhưng chưa từng dùng',
      value: stats ? n(stats.semi_finished_dormant.count) : '—',
      sub: stats
        ? `${n(stats.semi_finished_dormant.stock_count)} còn tồn kho · ${fmtVNDFull(stats.semi_finished_dormant.stock_value)}`
        : '',
    },
    {
      label: `Vật tư tồn kho, không xuất dùng ${stats?.years ?? 3} năm`,
      value: stats ? n(stats.material_unused_with_stock.count) : '—',
      sub: stats ? `${fmtVNDFull(stats.material_unused_with_stock.stock_value)} tồn kho` : '',
    },
  ]

  return (
    <div className="kpi-grid kpi-grid--5">
      {cards.map(card => (
        <div key={card.label} className={`card kpi-card${loading ? ' kpi-card--loading' : ''}`}>
          <p className="kpi-card__label">{card.label}</p>
          <p className="kpi-card__value">{card.value}</p>
          <p className="kpi-card__sub">{card.sub}</p>
        </div>
      ))}
    </div>
  )
}

export function ItemsPage() {
  const [rows,           setRows]           = useState<ItemRow[]>([])
  const [total,          setTotal]          = useState(0)
  const [lastPage,       setLastPage]       = useState(1)
  const [page,           setPage]           = useState(1)
  const [search,         setSearch]         = useState('')
  const [candidateOnly,  setCandidateOnly]  = useState(false)
  const [category,       setCategory]       = useState('')
  const [categories,     setCategories]     = useState<string[]>([])
  const [productGroup,   setProductGroup]   = useState('')
  const [productGroups,  setProductGroups]  = useState<ProductGroup[]>([])
  const [lifecycleState, setLifecycleState] = useState('')
  const [lifecycleStates, setLifecycleStates] = useState<string[]>([])
  const [excludeNeverSold, setExcludeNeverSold] = useState(false)
  const [finishedUnsoldOnly, setFinishedUnsoldOnly] = useState(false)
  const [materialUnusedOnly, setMaterialUnusedOnly] = useState(false)
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState<string | null>(null)
  const [exporting,      setExporting]      = useState(false)
  const [stats,          setStats]          = useState<ItemStats | null>(null)
  const [statsLoading,   setStatsLoading]   = useState(true)

  useEffect(() => {
    fetchItemCategories().then(setCategories).catch(() => { /* ignore — filter chi la tien ich */ })
    fetchProductGroups().then(setProductGroups).catch(() => { /* ignore — filter chi la tien ich */ })
    fetchLifecycleStates().then(setLifecycleStates).catch(() => { /* ignore — filter chi la tien ich */ })
    fetchItemStats().then(setStats).catch(() => { /* ignore — thong ke chi la tien ich */ }).finally(() => setStatsLoading(false))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchItems({
      q: search || undefined, page, per_page: PAGE_SIZE,
      candidate_only: candidateOnly || undefined, category: category || undefined,
      product_group: productGroup || undefined, lifecycle_state: lifecycleState || undefined,
      exclude_never_sold: excludeNeverSold || undefined,
      finished_unsold_only: finishedUnsoldOnly || undefined,
      material_unused_only: materialUnusedOnly || undefined,
    })
      .then(res => {
        if (cancelled) return
        setRows(res.data)
        setTotal(res.meta.total)
        setLastPage(res.meta.last_page)
      })
      .catch(e => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page, search, candidateOnly, category, productGroup, lifecycleState, excludeNeverSold, finishedUnsoldOnly, materialUnusedOnly])

  async function handleExport() {
    setExporting(true)
    try {
      // API gioi han cung per_page toi da 100/request — lap qua tung trang cho toi khi lay het.
      const allRows: ItemRow[] = []
      let exportPage = 1
      let exportLastPage = 1
      do {
        const res = await fetchItems({
          q: search || undefined, page: exportPage, per_page: 100,
          candidate_only: candidateOnly || undefined, category: category || undefined,
          product_group: productGroup || undefined, lifecycle_state: lifecycleState || undefined,
          exclude_never_sold: excludeNeverSold || undefined,
          finished_unsold_only: finishedUnsoldOnly || undefined,
          material_unused_only: materialUnusedOnly || undefined,
        })
        allRows.push(...res.data)
        exportLastPage = res.meta.last_page
        exportPage += 1
      } while (exportPage <= exportLastPage)
      await exportItemsExcel(allRows)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard__header" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h1 className="dashboard__title">Danh sách vật tư</h1>
          <button
            className="kpi-settings__export-btn"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? 'Đang xuất...' : 'Xuất Excel'}
          </button>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
          Lần bán cuối / xuất-nhập-tồn cuối tính trong 3 năm gần nhất — dữ liệu đồng bộ định kỳ từ F&amp;O, không phải thời gian thực.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="search"
            className="kpi-settings__input"
            placeholder="Tìm theo mã vật tư hoặc tên..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            style={{ width: 280, textAlign: 'left' }}
          />
          <select
            className="kpi-settings__input"
            value={category}
            onChange={e => { setCategory(e.target.value); setPage(1) }}
            style={{ width: 200, textAlign: 'left' }}
          >
            <option value="">Tất cả nhóm ngành hàng</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            className="kpi-settings__input"
            value={productGroup}
            onChange={e => { setProductGroup(e.target.value); setPage(1) }}
            style={{ width: 220, textAlign: 'left' }}
          >
            <option value="">Tất cả nhóm sản phẩm</option>
            {productGroups.map(g => <option key={g.id} value={g.id}>{g.id} — {g.name}</option>)}
          </select>
          <select
            className="kpi-settings__input"
            value={lifecycleState}
            onChange={e => { setLifecycleState(e.target.value); setPage(1) }}
            style={{ width: 180, textAlign: 'left' }}
          >
            <option value="">Tất cả trạng thái F&amp;O</option>
            <option value="__none__">(Chưa phân loại)</option>
            {lifecycleStates.map(s => <option key={s} value={s}>{LIFECYCLE_LABEL[s] ?? s}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)' }}>
            <input
              type="checkbox"
              checked={candidateOnly}
              onChange={e => { setCandidateOnly(e.target.checked); setPage(1) }}
            />
            Chỉ hiện ứng viên dọn kho (không bán / không XNK / hết tồn trong 3 năm)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)' }}>
            <input
              type="checkbox"
              checked={excludeNeverSold}
              onChange={e => { setExcludeNeverSold(e.target.checked); setPage(1) }}
            />
            Bỏ qua vật tư chưa từng bán
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)' }}>
            <input
              type="checkbox"
              checked={finishedUnsoldOnly}
              onChange={e => { setFinishedUnsoldOnly(e.target.checked); setPage(1) }}
            />
            Chỉ hiện thành phẩm tồn kho, không bán trong 3 năm
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)' }}>
            <input
              type="checkbox"
              checked={materialUnusedOnly}
              onChange={e => { setMaterialUnusedOnly(e.target.checked); setPage(1) }}
            />
            Chỉ hiện vật tư tồn kho, không xuất dùng trong 3 năm
          </label>
        </div>
      </div>

      <ItemStatsCards stats={stats} loading={statsLoading} />

      {error && <div className="dashboard__error">{error}</div>}

      <div className="card">
        {loading ? (
          <p className="table-placeholder">Đang tải...</p>
        ) : rows.length === 0 ? (
          <p className="table-placeholder">Không tìm thấy vật tư nào.</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="leaderboard">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Mã vật tư</th>
                    <th>Tên vật tư</th>
                    <th style={{ textAlign: 'right' }}>Số lần bán</th>
                    <th>Lần bán cuối<br />(all time)</th>
                    <th>Lần XNK cuối<br />(all time)</th>
                    <th>Lần bán cuối<br />(3 năm)</th>
                    <th>Lần XNK cuối<br />(3 năm)</th>
                    <th style={{ textAlign: 'right' }}>Tồn hiện tại</th>
                    <th className="hide-sm" style={{ textAlign: 'right' }}>Giá vốn</th>
                    <th className="hide-sm">Trạng thái F&amp;O</th>
                    <th className="hide-sm" style={{ maxWidth: 180 }}>Category hierarchy</th>
                    <th className="hide-sm" style={{ maxWidth: 240 }}>Category</th>
                    <th>Gợi ý</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.item_number} style={r.candidate_to_close ? { background: 'rgba(234, 88, 12, 0.06)' } : undefined}>
                      <td className="leaderboard__rank">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.item_number}</td>
                      <td className="leaderboard__name">
                        <div>{r.name || '—'}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {r.product_group_name || '—'}{r.unit ? ` · ${r.unit}` : ''}
                        </div>
                      </td>
                      <td className="leaderboard__value">{saleCountCell(r)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{allTimeCell(r.last_sale_date, r.last_sale_date_all_time)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{allTimeCell(r.last_inventory_txn_date, r.last_inventory_txn_date_all_time)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{withinCell(r.last_sale_date)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{withinCell(r.last_inventory_txn_date)}</td>
                      <td className="leaderboard__value">{r.on_hand_qty}</td>
                      <td className="hide-sm leaderboard__value">{r.unit_cost > 0 ? fmtVNDFull(r.unit_cost) : '—'}</td>
                      <td className="hide-sm">{lifecycleBadge(r.lifecycle_state)}</td>
                      <td className="hide-sm" style={{ maxWidth: 180, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                        {r.procurement_category && <div>HTG Procurement Categories</div>}
                        {r.sales_category && <div>HTG Sales Categories</div>}
                        {!r.procurement_category && !r.sales_category && '—'}
                      </td>
                      <td className="hide-sm" style={{ maxWidth: 240, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                        {r.procurement_category && <div>{r.procurement_category}</div>}
                        {r.sales_category && <div>{r.sales_category}</div>}
                        {!r.procurement_category && !r.sales_category && '—'}
                      </td>
                      <td>
                        {r.candidate_to_close
                          ? <span style={{ color: '#ea580c', fontWeight: 500 }}>Nên xem xét đóng</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {lastPage > 1 && (
              <div className="leaderboard__pagination">
                <button className="leaderboard__page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>←</button>
                <span className="leaderboard__page-info">{page} / {lastPage} ({total} vật tư)</span>
                <button className="leaderboard__page-btn" disabled={page === lastPage} onClick={() => setPage(p => p + 1)}>→</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
