export function fmtVND(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace('.', ',')} tỷ`
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1).replace('.', ',')} triệu`
  return new Intl.NumberFormat('vi-VN').format(n)
}

export function fmtVNDFull(n: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(n))
}

// Dùng cho trục Y của chart — cần thật ngắn
export function fmtAxisVND(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}T`
  if (n >= 1_000_000)     return `${Math.round(n / 1_000_000)}tr`
  return `${n}`
}
