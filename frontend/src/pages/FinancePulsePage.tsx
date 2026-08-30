import { fmtVND, fmtVNDFull } from '../utils/format'

/**
 * TODO: template dung du lieu gia dinh (MOCK_*) — cach tinh AR/AP/Inventory movement,
 * nguon fetch tung phan se quyet dinh sau. Thay MOCK_* bang fetch API that khi da chot
 * cong thuc, giu nguyen cau truc JSX/props ben duoi.
 */

type WcBar = { label: string; value: number; kind: 'driver' | 'net' }

type PnlMetric = {
  label: string
  status: 'good' | 'bad' | 'pending'
  value?: string
  pctLine?: string
  deltaLine?: string
  note?: string
}

// Revenue: SO LIEU THAT — tong resolved_value trong erp_synced_deals, so voi target tu
// crc83_kpitargetses (teamKpiPerformance(), rollover-adjusted theo quy). Target thang = target
// quy hien tai / 3 (chua co target rieng theo thang trong he thong, dung uoc luong pho bien —
// chia deu target quy). Cac chi so con lai (Gross Profit/Margin, Opex, Finance expense, Net
// profit) chua chot nguon/cong thuc — de "pending" cho toi khi thao luan tung chi so.
const MONTH_LABEL = 'Tháng 8/2026'
const MONTH_REVENUE_ACTUAL = 6_852_230_165 // 1/8 - 24/8/2026 (MTD)
const MONTH_REVENUE_TARGET = 63_443_685_836 // target Q3/2026 ÷ 3

const HALF_LABEL = 'Luỹ kế H2/2026'
const HALF_REVENUE_ACTUAL = 16_476_562_520 // 1/7 - 24/8/2026
const HALF_REVENUE_TARGET = 322_991_057_508 // target Q3 + Q4/2026

function buildPnlMetrics(revenueActual: number, revenueTarget: number): PnlMetric[] {
  return [
    {
      label: 'Doanh thu (Revenue)',
      status: revenueActual >= revenueTarget ? 'good' : 'bad',
      value: fmtVND(revenueActual),
      pctLine: `${Math.round(revenueActual / revenueTarget * 1000) / 10}% of Target (${fmtVND(revenueTarget)})`,
      deltaLine: `${fmtSignedLabel(revenueActual - revenueTarget)} vs Target`,
    },
    { label: 'Lợi nhuận gộp (Gross Profit)', status: 'pending', note: 'Chưa chốt nguồn/công thức' },
    { label: 'Biên lợi nhuận gộp (Gross Margin)', status: 'pending', note: 'Chưa chốt nguồn/công thức' },
    { label: 'Chi phí vận hành (Operating Expense)', status: 'pending', note: 'Chưa chốt nguồn/công thức' },
    { label: 'Chi phí tài chính (Finance Expense)', status: 'pending', note: 'Chưa chốt nguồn/công thức' },
    { label: 'Lợi nhuận ròng (Net Profit)', status: 'pending', note: 'Chưa chốt nguồn/công thức' },
  ]
}

const PNL_METRICS_MONTH = buildPnlMetrics(MONTH_REVENUE_ACTUAL, MONTH_REVENUE_TARGET)
const PNL_METRICS_HALF = buildPnlMetrics(HALF_REVENUE_ACTUAL, HALF_REVENUE_TARGET)

const MOCK_BALANCE = {
  asOf: '23/08/2026',
  receivables: 68_400_000_000,
  receivablesSub: 'DSO trung bình 34 ngày',
  cash: 16_200_000_000,
  cashSub: '3 tài khoản ngân hàng chính',
  inventory: 187_000_000_000,
  inventoryPor: 44_000_000_000,
  inventoryNoPor: 143_000_000_000,
  payables: 21_000_000_000,
  payablesSub: 'DPO trung bình 28 ngày',
  loans: 102_000_000_000,
  loansDeltaWeek: -3_000_000_000,
}

const MOCK_MOVEMENT = {
  weekLabel: '17/08 → 23/08/2026 · Tuần 34',
  bars: [
    { label: 'Phải thu khách hàng', value: -600_000_000, kind: 'driver' },
    { label: 'Phải trả nhà cung cấp', value: -4_200_000_000, kind: 'driver' },
    { label: 'Hàng tồn kho', value: 3_800_000_000, kind: 'driver' },
    { label: 'Lưu chuyển tiền từ vốn lưu động', value: -1_000_000_000, kind: 'net' },
  ] as WcBar[],
  narrative: [
    'Phải thu tăng nhẹ 0,6 tỷ',
    'Phải trả giảm 4,2 tỷ do thanh toán NCC (Yuchai)',
    'Hàng tồn kho giảm 3,8 tỷ, chủ yếu do chuyển sang WIP dự án',
  ],
}

const MOCK_OVERDUE = [
  { name: 'Công ty TNHH Cơ khí Đại Phát', code: '100002187', balance: 2_800_000_000, daysOverdue: 108, nextDue: '08/05/2026' },
  { name: 'Cảng Container Trung tâm SG', code: 'A00005521', balance: 1_900_000_000, daysOverdue: 92, nextDue: '24/05/2026' },
  { name: 'KCN Sóng Thần 2', code: '100001884', balance: 1_400_000_000, daysOverdue: 71, nextDue: '14/06/2026' },
  { name: 'Công ty CP Thép Miền Nam', code: '100000933', balance: 1_100_000_000, daysOverdue: 65, nextDue: '20/06/2026' },
]

const MOCK_RISK = {
  weekLabel: '24/08 → 30/08/2026 · Tuần 35',
  arOverdue60Value: 9_400_000_000,
  arOverdue60Count: 11,
  apDueNextWeekValue: 5_100_000_000,
  apDueNextWeekCount: 7,
  advanceUnsettled: 1_300_000_000,
  advanceOverdue30: 400_000_000,
}

function fmtSigned(n: number): string {
  const abs = fmtVND(Math.abs(n))
  return n < 0 ? `(${abs})` : abs
}

function fmtSignedLabel(n: number): string {
  return `${n < 0 ? '-' : '+'} ${fmtVND(Math.abs(n))}`
}

function debtBadgeLevel(days: number): 'overdue' | 'soon' | 'ok' {
  if (days > 90) return 'overdue'
  if (days > 60) return 'soon'
  return 'ok'
}

function PnlMetricRow({ label, metrics }: { label: string; metrics: PnlMetric[] }) {
  return (
    <div className="finance-metric-row">
      <p className="finance-metric-row__label">{label}</p>
      <div className="finance-metric-grid">
        {metrics.map(m => (
          <div key={m.label} className={`finance-metric-card finance-metric-card--${m.status}`}>
            <p className="finance-metric-card__label">{m.label}</p>
            {m.status === 'pending' ? (
              <p className="finance-metric-card__note">{m.note}</p>
            ) : (
              <>
                <p className="finance-metric-card__value">{m.value}</p>
                <p className="finance-metric-card__line">{m.pctLine}</p>
                <p className="finance-metric-card__line">{m.deltaLine}</p>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function SectionHead({ num, title, sub, pill }: { num: string; title: string; sub: string; pill: string }) {
  return (
    <div className="pulse__section-head">
      <div className="pulse__section-head-left">
        <span className="pulse__section-num">{num}</span>
        <div>
          <h2 className="pulse__section-title">{title}</h2>
          <p className="pulse__section-sub">{sub}</p>
        </div>
      </div>
      <span className="pill pill--accent">{pill}</span>
    </div>
  )
}

function WaterfallChart({ bars }: { bars: WcBar[] }) {
  const maxAbs = Math.max(...bars.map(b => Math.abs(b.value)), 1)
  const halfHeight = 96

  return (
    <div className="pulse__wc">
      <div className="pulse__wc-chart">
        <div className="pulse__wc-zero-line" />
        <div className="pulse__wc-cols">
          {bars.map(b => {
            const h = Math.round((Math.abs(b.value) / maxAbs) * halfHeight)
            const isPos = b.value >= 0
            const barClass = b.kind === 'net' ? 'pulse__wc-bar--net' : isPos ? 'pulse__wc-bar--pos' : 'pulse__wc-bar--neg'
            return (
              <div className="pulse__wc-col" key={b.label}>
                <span
                  className="pulse__wc-bar-value"
                  style={{
                    top: isPos ? `calc(50% - ${h}px)` : `calc(50% + ${h}px)`,
                    transform: isPos ? 'translate(-50%, -100%)' : 'translate(-50%, 6px)',
                    color: b.kind === 'net' ? 'var(--text-h)' : isPos ? '#16a34a' : 'var(--accent)',
                  }}
                >
                  {fmtSigned(b.value)}
                </span>
                <div
                  className={`pulse__wc-bar ${barClass}`}
                  style={{ top: isPos ? `calc(50% - ${h}px)` : '50%', height: `${h}px` }}
                />
              </div>
            )
          })}
        </div>
      </div>
      <div className="pulse__wc-cat-labels">
        {bars.map(b => <span className="pulse__wc-cat" key={b.label}>{b.label}</span>)}
      </div>
    </div>
  )
}

export function FinancePulsePage() {
  const inventoryNoPorPct = Math.round(MOCK_BALANCE.inventoryNoPor / MOCK_BALANCE.inventory * 100)

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1 className="dashboard__title">Nhịp Vốn Lưu Động</h1>
        <p className="pulse__meta">Cùng khung với Nhịp Doanh Số Tuần bên Sales — tổng quan số dư → biến động tuần → cần theo dõi tuần tới</p>
      </div>

      <p className="dashboard__source-note">
        Doanh thu (Revenue) là số liệu thật — 5 chỉ số còn lại vẫn đang chờ chốt nguồn/công thức tính.
      </p>

      {/* ═══ 6 chỉ số P&L chính ═══ */}
      <section className="pulse__section">
        <div className="pulse__section-head">
          <div className="pulse__section-head-left">
            <div>
              <h2 className="pulse__section-title">6 chỉ số P&amp;L chính</h2>
              <p className="pulse__section-sub">Đi từng chỉ số một — bắt đầu từ Revenue</p>
            </div>
          </div>
        </div>

        <PnlMetricRow label={MONTH_LABEL} metrics={PNL_METRICS_MONTH} />
        <PnlMetricRow label={HALF_LABEL} metrics={PNL_METRICS_HALF} />
      </section>

      {/* ═══ 01 · Tổng quan số dư ═══ */}
      <section className="pulse__section">
        <SectionHead num="01" title="Tổng quan số dư" sub="Bức tranh chung trước khi đi vào biến động trong tuần" pill={`Số dư đến ${MOCK_BALANCE.asOf}`} />

        <div className="kpi-grid kpi-grid--5">
          <div className="card kpi-card">
            <p className="kpi-card__label">Phải thu khách hàng</p>
            <p className="kpi-card__value">{fmtVND(MOCK_BALANCE.receivables)}</p>
            <p className="kpi-card__sub">{MOCK_BALANCE.receivablesSub}</p>
          </div>
          <div className="card kpi-card">
            <p className="kpi-card__label">Tiền mặt</p>
            <p className="kpi-card__value">{fmtVND(MOCK_BALANCE.cash)}</p>
            <p className="kpi-card__sub">{MOCK_BALANCE.cashSub}</p>
          </div>
          <div className="card kpi-card">
            <p className="kpi-card__label">Hàng tồn kho</p>
            <p className="kpi-card__value">{fmtVND(MOCK_BALANCE.inventory)}</p>
            <p className="kpi-card__sub">{fmtVND(MOCK_BALANCE.inventoryPor)} có POR · {fmtVND(MOCK_BALANCE.inventoryNoPor)} không POR</p>
          </div>
          <div className="card kpi-card">
            <p className="kpi-card__label">Phải trả nhà cung cấp</p>
            <p className="kpi-card__value">{fmtVND(MOCK_BALANCE.payables)}</p>
            <p className="kpi-card__sub">{MOCK_BALANCE.payablesSub}</p>
          </div>
          <div className="card kpi-card">
            <p className="kpi-card__label">Vay nợ</p>
            <p className="kpi-card__value">{fmtVND(MOCK_BALANCE.loans)}</p>
            <p className="kpi-card__sub">
              <span className={`kpi-delta-inline ${MOCK_BALANCE.loansDeltaWeek < 0 ? 'kpi-delta-inline--up' : 'kpi-delta-inline--down'}`}>
                {MOCK_BALANCE.loansDeltaWeek < 0 ? '▼' : '▲'} {fmtVND(Math.abs(MOCK_BALANCE.loansDeltaWeek))}
              </span> so tuần trước
            </p>
          </div>
        </div>
      </section>

      {/* ═══ 02 · Biến động tuần ═══ */}
      <section className="pulse__section">
        <SectionHead
          num="02"
          title="Biến động vốn lưu động — tuần vừa qua"
          sub="Tác động lên dòng tiền: xanh = giải phóng tiền, đỏ = dùng tiền"
          pill={MOCK_MOVEMENT.weekLabel}
        />

        <div className="card pulse__panel">
          <div className="pulse__main-grid">
            <WaterfallChart bars={MOCK_MOVEMENT.bars} />

            <div className="pulse__narrative">
              <p className="pulse__narrative-lead">
                Vốn lưu động <strong>{MOCK_MOVEMENT.bars[3].value < 0 ? 'tăng' : 'giảm'} {fmtVND(Math.abs(MOCK_MOVEMENT.bars[3].value))}</strong> trong tuần, chủ yếu do:
              </p>
              {MOCK_MOVEMENT.narrative.map(line => (
                <div className="pulse__narrative-item" key={line}>
                  <span className="pulse__narrative-mark">›</span>
                  <span>{line}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 03 · Cần theo dõi tuần tới ═══ */}
      <section className="pulse__section">
        <SectionHead
          num="03"
          title="Cần theo dõi tuần tới"
          sub="Rủi ro thu hồi công nợ & nghĩa vụ thanh toán sắp tới"
          pill={MOCK_RISK.weekLabel}
        />

        <div className="kpi-grid kpi-grid--3">
          <div className="card kpi-card">
            <p className="kpi-card__label">AR quá hạn &gt; 60 ngày</p>
            <p className="kpi-card__value" style={{ color: 'var(--accent)' }}>{fmtVND(MOCK_RISK.arOverdue60Value)}</p>
            <p className="kpi-card__sub">{MOCK_RISK.arOverdue60Count} khách hàng</p>
          </div>
          <div className="card kpi-card">
            <p className="kpi-card__label">AP đến hạn tuần tới</p>
            <p className="kpi-card__value">{fmtVND(MOCK_RISK.apDueNextWeekValue)}</p>
            <p className="kpi-card__sub">{MOCK_RISK.apDueNextWeekCount} nhà cung cấp</p>
          </div>
          <div className="card kpi-card">
            <p className="kpi-card__label">Tạm ứng chưa quyết toán</p>
            <p className="kpi-card__value">{fmtVND(MOCK_RISK.advanceUnsettled)}</p>
            <p className="kpi-card__sub">Quá 30 ngày: {fmtVND(MOCK_RISK.advanceOverdue30)}</p>
          </div>
        </div>

        <div className="pulse__main-grid">
          <div className="card pulse__panel">
            <div className="card__header">
              <h3 className="card__title">Top khách hàng quá hạn</h3>
              <span className="pulse__panel-note">Sắp theo số ngày quá hạn giảm dần</span>
            </div>
            <div className="table-wrap">
              <table className="leaderboard">
                <thead>
                  <tr>
                    <th>Khách hàng</th>
                    <th style={{ textAlign: 'right' }}>Số dư</th>
                    <th>Quá hạn</th>
                    <th>Đến hạn gần nhất</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_OVERDUE.map(c => (
                    <tr key={c.code}>
                      <td className="leaderboard__name">
                        {c.name}
                        <span className="pulse__row-sub">{c.code}</span>
                      </td>
                      <td className="leaderboard__num">{fmtVNDFull(c.balance)}</td>
                      <td>
                        <span className={`debt-badge debt-badge--${debtBadgeLevel(c.daysOverdue)}`}>{c.daysOverdue} ngày</span>
                      </td>
                      <td>{c.nextDue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pulse__rail">
            <div className="card pulse__panel">
              <div className="card__header"><h3 className="card__title">Cần thúc trước cuộc họp</h3></div>
              <div className="pulse__highlight-list">
                <div className="pulse__highlight pulse__highlight--behind">
                  <div className="pulse__highlight-body">
                    <span className="pulse__highlight-title">{MOCK_RISK.arOverdue60Count} khách hàng quá hạn &gt; 60 ngày</span>
                    <span className="pulse__highlight-sub">Tổng {fmtVND(MOCK_RISK.arOverdue60Value)} — ưu tiên nhắc nợ trước cuối tháng</span>
                  </div>
                </div>
                <div className="pulse__highlight pulse__highlight--watch">
                  <div className="pulse__highlight-body">
                    <span className="pulse__highlight-title">{fmtVND(MOCK_RISK.apDueNextWeekValue)} công nợ NCC đến hạn</span>
                    <span className="pulse__highlight-sub">{MOCK_RISK.apDueNextWeekCount} nhà cung cấp trong tuần tới — cần đối chiếu dòng tiền khả dụng</span>
                  </div>
                </div>
                <div className="pulse__highlight pulse__highlight--info">
                  <div className="pulse__highlight-body">
                    <span className="pulse__highlight-title">Tồn kho không POR còn cao</span>
                    <span className="pulse__highlight-sub">{fmtVND(MOCK_BALANCE.inventoryNoPor)}, chiếm {inventoryNoPorPct}% tổng tồn kho</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
