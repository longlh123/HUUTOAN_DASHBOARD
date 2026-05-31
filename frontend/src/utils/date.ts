import type { DateRange } from '../api/sales'

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

const today = () => toDateStr(new Date())
const cap   = (s: string) => s > today() ? today() : s

export function getYearRange(year: number): DateRange {
  return { from: `${year}-01-01`, to: cap(`${year}-12-31`) }
}

export function getQuarterRange(year: number, q: number): DateRange {
  const startMonth = (q - 1) * 3 + 1
  const endMonth   = q * 3
  const endDay     = new Date(year, endMonth, 0).getDate()
  return {
    from: `${year}-${pad(startMonth)}-01`,
    to:   cap(`${year}-${pad(endMonth)}-${pad(endDay)}`),
  }
}

export function getMonthRange(year: number, month: number): DateRange {
  const endDay = new Date(year, month, 0).getDate()
  return {
    from: `${year}-${pad(month)}-01`,
    to:   cap(`${year}-${pad(month)}-${pad(endDay)}`),
  }
}

export function prevYearRange(range: DateRange): DateRange {
  const y = parseInt(range.from.slice(0, 4)) - 1
  return {
    from: range.from.replace(/^\d{4}/, String(y)),
    to:   range.to.replace(/^\d{4}/, String(y)),
  }
}

// Dùng cho initial state trong SalesDashboard
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getPresetRange(_: 'year'): DateRange {
  return getYearRange(new Date().getFullYear())
}
