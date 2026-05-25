"use client";

import { useEffect, useRef } from "react";

type UseLiveRefreshOptions = {
  enabled?: boolean;
  intervalMs: number;
  focusThrottleMs?: number;
  onRefresh: () => void | Promise<void>;
};

export function useLiveRefresh({
  enabled = true,
  intervalMs,
  focusThrottleMs = 5000,
  onRefresh,
}: UseLiveRefreshOptions) {
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) {
      return;
    }

    const triggerRefresh = () => {
      lastRefreshAtRef.current = Date.now();
      void onRefresh();
    };

    const refreshWhenVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      triggerRefresh();
    };

    const maybeRefresh = () => {
      if (Date.now() - lastRefreshAtRef.current < focusThrottleMs) {
        return;
      }
      refreshWhenVisible();
    };

    const intervalId = window.setInterval(refreshWhenVisible, intervalMs);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        maybeRefresh();
      }
    };

    window.addEventListener("focus", maybeRefresh);
    window.addEventListener("online", maybeRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", maybeRefresh);
      window.removeEventListener("online", maybeRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, focusThrottleMs, intervalMs, onRefresh]);
}
