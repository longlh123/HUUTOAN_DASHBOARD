export type AuthUser = {
  id:         number
  name:       string
  email:      string
  territory:  string | null
  department: string | null
  is_admin:   boolean
}

export async function fetchMe(token: string): Promise<AuthUser> {
  const res = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Unauthorized')
  const json: { data: AuthUser } = await res.json()
  return json.data
}

export async function loginWithCredentials(
  email: string,
  password: string,
): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch('/api/auth/login', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.message ?? 'Đăng nhập thất bại')
  return json.data
}

export async function logoutApi(token: string): Promise<void> {
  await fetch('/api/auth/logout', {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}
