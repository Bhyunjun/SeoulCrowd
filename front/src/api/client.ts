import { isDesignReviewMode, mockApiFetch, MOCK_ACCESS_TOKEN } from "../utils/designReviewMock";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

export const apiUrl = (path: string) => `${API_BASE}${path}`;

export const getAccessToken = () => {
  if (isDesignReviewMode()) return MOCK_ACCESS_TOKEN;
  return sessionStorage.getItem("accessToken");
};

export const apiFetch = (input: string, init: RequestInit = {}) => {
  if (isDesignReviewMode()) return mockApiFetch(input, init);
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(apiUrl(input), { ...init, headers });
};
