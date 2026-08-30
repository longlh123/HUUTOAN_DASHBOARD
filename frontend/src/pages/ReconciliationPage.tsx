import { useEffect, useState } from 'react'
import type { ReconciliationRow, DateRange } from '../api/sales'
import { fetchErpReconciliation } from '../api/sales'
import { fmtVNDFull } from '../utils/format'
import { getFullWeekRange, getFullMonthRange } from '../utils/date'

const PAGE_SIZE = 20
const DEPARTMENTS = ['ALL', 'NNC', 'SS'] as const
type DeptFilter = typeof DEPARTMENTS[number]

function fmtDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function sourceLabel(source: ReconciliationRow['source']): string {
  return source === 'onaccount' ? 'On Account' : 'SO → Invoice'
}

function exportCsv(rows: ReconciliationRow[], range: DateRange, department: DeptFilter) {
  const header = [
    'Invoice Number', 'Ledger Voucher', 'LastSettleVoucher', 'Invoice Date',
    'Amount SF Included', 'SF Amount', 'Amount SF Excluded', 'SF %',
    'Salesman ID', 'Salesman', 'F2-Department', 'F6-Sales chanel',
    'Project', 'Project Name', 'SO', 'Customer Account', 'Organization Name',
    'Service type', 'Sum Project Sales Price', 'Sum Project SF', 'Is Settle?',
  ]
  const csvRows = rows.map(r => [
    r.invoice_number, r.ledger_voucher, r.last_settle_voucher, fmtDate(r.invoice_date),
    r.amount_included, r.sf_amount, r.amount_excluded, r.sf_percent,
    r.salesman_id, r.salesman, r.f2_department, r.sales_channel,
    r.project, r.project_name, r.so_number, r.customer_account, r.customer_name,
    r.service_type, r.sum_project_sales_price ?? '', r.sum_project_sf ?? '',
    r.is_settled ? 'Yes' : 'No',
  ])

  // Dung dau ";" lam delimiter (khong phai ",") vi Excel o may Windows/VN mac dinh dung
  // dau "," lam decimal separator — giong pattern trong KpiSettingsPage.exportKpiExcel()
  const escape = (v: string | number) => {
    const s = String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [header, ...csvRows].map(row => row.map(escape).join(';')).join('\r\n')

  // BOM de Excel doc dung UTF-8 (khong bi loi font tieng Viet)
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `doi-chieu-doanh-so-${range.from}_${range.to}${department !== 'ALL' ? `-${department}` : ''}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function ReconciliationPage() {
  const [department, setDepartment] = useState<DeptFilter>('ALL')
  const [range,       setRange]      = useState<DateRange>(() => getFullWeekRange())
  const [rows,        setRows]       = useState<ReconciliationRow[]>([])
  const [loading,     setLoading]    = useState(true)
  const [error,       setError]      = useState<string | null>(null)
  const [page,        setPage]       = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchErpReconciliation(range, department === 'ALL' ? undefined : department)
      .then(data => { if (!cancelled) { setRows(data); setPage(0) } })
      .catch(e => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [range, department])

  const totalAmount = rows.reduce((s, r) => s + r.amount_excluded, 0)
  const totalPages  = Math.ceil(rows.length / PAGE_SIZE)
  const pageRows    = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1 className="dashboard__title">Đối chiếu doanh số ERP</h1>
        <div className="dashboard__filters">
          <button
            className="kpi-settings__export-btn"
            onClick={() => exportCsv(rows, range, department)}
            disabled={rows.length === 0}
          >
            Xuất Excel
          </button>
          <div className="date-filter__presets">
            {DEPARTMENTS.map(d => (
              <button
                key={d}
                className={`date-filter__btn${department === d ? ' date-filter__btn--active' : ''}`}
                onClick={() => setDepartment(d)}
              >
                {d === 'ALL' ? 'Tất cả' : d}
              </button>
            ))}
          </div>
          <div className="date-filter">
            <div className="date-filter__presets">
              <button className="date-filter__btn" onClick={() => setRange(getFullWeekRange())}>Tuần này</button>
              <button className="date-filter__btn" onClick={() => setRange(getFullMonthRange())}>Tháng này</button>
            </div>
            <div className="date-filter__custom">
              <input
                type="date"
                className="date-filter__input"
                value={range.from}
                max={range.to}
                onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
              />
              <span className="date-filter__sep">–</span>
              <input
                type="date"
                className="date-filter__input"
                value={range.to}
                min={range.from}
                onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
              />
            </div>
          </div>
        </div>
      </div>

      <p className="dashboard__source-note">
        Chi tiết từng dòng hóa đơn ERP (NNC: SO → Invoice, SS: On Account) để đối chiếu với số liệu Sales tự tổng hợp.
      </p>

      {error && <div className="dashboard__error">{error}</div>}

      <div className="card">
        {loading && rows.length === 0 ? (
          <p className="table-placeholder">Đang tải...</p>
        ) : rows.length === 0 ? (
          <p className="table-placeholder">Không có dữ liệu.</p>
        ) : (
          <>
            <div className={`table-wrap${loading ? ' chart-wrap--loading' : ''}`}>
              <table className="leaderboard">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'right' }}>#</th>
                    <th>Invoice Number</th>
                    <th>Ledger Voucher</th>
                    <th>LastSettleVoucher</th>
                    <th>Invoice Date</th>
                    <th style={{ textAlign: 'right' }}>Amount SF Included</th>
                    <th style={{ textAlign: 'right' }}>SF Amount</th>
                    <th style={{ textAlign: 'right' }}>Amount SF Excluded</th>
                    <th style={{ textAlign: 'right' }}>SF %</th>
                    <th>Salesman ID</th>
                    <th>Salesman</th>
                    <th>F2-Department</th>
                    <th>F6-Sales chanel</th>
                    <th>Project</th>
                    <th>Project Name</th>
                    <th>SO</th>
                    <th>Customer Account</th>
                    <th>Organization Name</th>
                    <th>Service type</th>
                    <th style={{ textAlign: 'right' }}>Sum Project Sales Price</th>
                    <th style={{ textAlign: 'right' }}>Sum Project SF</th>
                    <th>Is Settle?</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="leaderboard__grand-total">
                    <td colSpan={5}>Tổng cộng ({rows.length} dòng)</td>
                    <td className="leaderboard__num"></td>
                    <td className="leaderboard__num"></td>
                    <td className="leaderboard__num">{fmtVNDFull(totalAmount)}</td>
                    <td colSpan={14}></td>
                  </tr>
                  {pageRows.map((r, i) => (
                    <tr key={`${r.source}-${r.invoice_number}-${i}`}>
                      <td className="leaderboard__rank">{page * PAGE_SIZE + i + 1}</td>
                      <td className="leaderboard__name" title={sourceLabel(r.source)}>{r.invoice_number}</td>
                      <td>{r.ledger_voucher}</td>
                      <td>{r.last_settle_voucher || '—'}</td>
                      <td>{fmtDate(r.invoice_date)}</td>
                      <td className="leaderboard__num">{fmtVNDFull(r.amount_included)}</td>
                      <td className="leaderboard__num">{fmtVNDFull(r.sf_amount)}</td>
                      <td className="leaderboard__num">{fmtVNDFull(r.amount_excluded)}</td>
                      <td className="leaderboard__num">{r.sf_percent}%</td>
                      <td>{r.salesman_id}</td>
                      <td className="leaderboard__name">{r.salesman}</td>
                      <td>{r.f2_department}</td>
                      <td>{r.sales_channel}</td>
                      <td>{r.project || '—'}</td>
                      <td className="leaderboard__name">{r.project_name || '—'}</td>
                      <td>{r.so_number || '—'}</td>
                      <td>{r.customer_account}</td>
                      <td className="leaderboard__name">{r.customer_name || '—'}</td>
                      <td>{r.service_type || '—'}</td>
                      <td className="leaderboard__num">{r.sum_project_sales_price !== null ? fmtVNDFull(r.sum_project_sales_price) : '—'}</td>
                      <td className="leaderboard__num">{r.sum_project_sf !== null ? fmtVNDFull(r.sum_project_sf) : '—'}</td>
                      <td>
                        <span className={`win-rate win-rate--${r.is_settled ? 'high' : 'low'}`}>
                          {r.is_settled ? 'Yes' : 'No'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="pagination__btn"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                >
                  ← Trước
                </button>
                <span className="pagination__info">{page + 1} / {totalPages}</span>
                <button
                  className="pagination__btn"
                  disabled={page === totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                >
                  Sau →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
