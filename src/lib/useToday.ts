"use client";

import { useSyncExternalStore } from "react";
import { toISODate } from "./dates";

const subscribe = () => () => {};

/**
 * 브라우저 기준 오늘 날짜(YYYY-MM-DD). 서버 렌더링 중에는 null.
 * 서버(UTC)와 사용자(KST)의 날짜가 달라 생기는 hydration 불일치를 피하기 위해 사용.
 */
export function useTodayISO(): string | null {
  return useSyncExternalStore(subscribe, () => toISODate(new Date()), () => null);
}
