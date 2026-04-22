import { apiUrl } from "../api/client";

const CACHE_KEY = "population_cache_data";
const CACHE_TS_KEY = "population_cache_ts";
const CACHE_TTL = 15 * 60 * 1000;

export type ApiPopulationRaw = {
  areaName: string;
  congestionLevel: string;
  populationMin: number;
  populationMax: number;
  latitude: number;
  longitude: number;
};

export async function fetchPopulation(): Promise<ApiPopulationRaw[]> {
  const ts = localStorage.getItem(CACHE_TS_KEY);
  const cached = localStorage.getItem(CACHE_KEY);

  if (ts && cached && Date.now() - parseInt(ts, 10) < CACHE_TTL) {
    try {
      return JSON.parse(cached) as ApiPopulationRaw[];
    } catch {
      // 파싱 실패 시 새로 가져옴
    }
  }

  const res = await fetch(apiUrl("/api/population"));
  if (!res.ok) throw new Error("인구 데이터를 불러오지 못했습니다.");
  const json = await res.json();
  const list: ApiPopulationRaw[] = json.data ?? [];

  localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  localStorage.setItem(CACHE_TS_KEY, String(Date.now()));

  return list;
}
