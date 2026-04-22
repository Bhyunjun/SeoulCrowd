const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

export const apiUrl = (path: string) => `${API_BASE}${path}`;

export const getAccessToken = () => sessionStorage.getItem("accessToken");

export const apiFetch = (input: string, init: RequestInit = {}) => {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(apiUrl(input), { ...init, headers });
};
