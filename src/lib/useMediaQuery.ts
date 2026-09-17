"use client";

import { useSyncExternalStore } from "react";

/** CSS 미디어 쿼리 일치 여부. 서버 렌더링 중에는 serverValue 를 사용 */
export function useMediaQuery(query: string, serverValue = true) {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
