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

export function getThisWeekRange(): DateRange {
  const now = new Date()
  const daysToMonday = (now.getDay() + 6) % 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - daysToMonday)
  return { from: toDateStr(monday), to: today() }
}

// Ca tuan (Thu 2 - Chu nhat) khong gioi han o "hom nay" — dung cho cac trang doi chieu can xem
// truoc ca tuan (vd hoa don co the phat sinh vao ngay sau trong tuan), khac getThisWeekRange()
// (cap o hom nay, dung cho cac chi so "hoat dong tinh den gio").
export function getFullWeekRange(): DateRange {
  const now = new Date()
  const daysToMonday = (now.getDay() + 6) % 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - daysToMonday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { from: toDateStr(monday), to: toDateStr(sunday) }
}

// Tuan Thu2-CN ngay truoc getFullWeekRange() — dung cho "tuan vua qua" trong trang tom tat hop.
export function getLastFullWeekRange(): DateRange {
  const cur  = getFullWeekRange()
  const from = new Date(cur.from); from.setDate(from.getDate() - 7)
  const to   = new Date(cur.to);   to.setDate(to.getDate() - 7)
  return { from: toDateStr(from), to: toDateStr(to) }
}

// N tuan gan nhat tinh den hom nay — dung cho sparkline xu huong doanh thu.
export function getLastNWeeksRange(weeks: number): DateRange {
  const from = new Date()
  from.setDate(from.getDate() - weeks * 7)
  return { from: toDateStr(from), to: today() }
}

export function getThisMonthRange(): DateRange {
  const now = new Date()
  return getMonthRange(now.getFullYear(), now.getMonth() + 1)
}

// Ca thang, khong gioi han o "hom nay" — cung ly do voi getFullWeekRange().
export function getFullMonthRange(): DateRange {
  const now = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1
  const endDay = new Date(year, month, 0).getDate()
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(endDay)}` }
}

export function getThisQuarterRange(): DateRange {
  const now = new Date()
  const q = Math.ceil((now.getMonth() + 1) / 3)
  return getQuarterRange(now.getFullYear(), q)
}
