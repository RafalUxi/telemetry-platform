const API = process.env.NEXT_PUBLIC_API_URL;

export const fetchDevices = async (token: string) => {
  const res = await fetch(`${API}/devices`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
};

export const fetchRegister = async (data: { email: string; password: string }) => {
  const res = await fetch(`${API}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
};

export const fetchLogin = async (data: { email: string; password: string }) => {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
};
