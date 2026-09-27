type Tokens = { accessToken: string; refreshToken: string };

const API = process.env.NEXT_PUBLIC_API_URL;
let tokenHandle: Tokens | null = null;

const writeTokens = (tokens: Tokens) => {
  tokenHandle = tokens;
};

const resetTokens = () => {
  tokenHandle = null;
};

export const isLogged = () => {
  return tokenHandle !== null;
};

export const logout = () => {
  resetTokens();
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
  if (res.ok && body !== null) {
    writeTokens({ accessToken: body.accessToken, refreshToken: body.refreshToken });
  }
  return { ok: res.ok, status: res.status, body };
};

export const fetchDevices = async () => {
  if (tokenHandle === null) {
    return { ok: false, status: 401, body: null };
  }
  const res = await fetch(`${API}/devices`, {
    headers: { authorization: `Bearer ${tokenHandle.accessToken}` },
  });
  if (res.status === 401) {
    resetTokens();
    return { ok: false, status: 401, body: null };
  }
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
};

export const fetchSeries = async (id: string, from: string, to: string, points: number) => {
  if (tokenHandle === null) {
    return { ok: false, status: 401, body: null };
  }
  const query = new URLSearchParams({ from, to, points: String(points) });
  const res = await fetch(`${API}/devices/${id}/series?${query}`, {
    headers: { authorization: `Bearer ${tokenHandle.accessToken}` },
  });
  if (res.status === 401) {
    resetTokens();
    return { ok: false, status: 401, body: null };
  }
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
};
