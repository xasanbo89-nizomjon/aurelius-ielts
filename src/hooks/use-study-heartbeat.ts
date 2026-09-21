"use client";

import { useEffect, useRef } from "react";

import { recordStudyHeartbeatAction } from "@/actions/study-activity.actions";

const PING_INTERVAL_MS = 30_000;

export type HeartbeatActivityType = "VOCABULARY" | "WRITING" | "ARTICLE";

/**
 * Pings the server roughly every 30s while this component is mounted and
 * the tab is actually visible — the client only decides WHEN to ping. The
 * server computes the real credited duration itself from wall-clock time
 * between pings (see src/lib/study-activity.ts recordStudyHeartbeat), so
 * this hook can never itself claim or inflate a duration.
 */
export function useStudyHeartbeat(type: HeartbeatActivityType) {
  const typeRef = useRef(type);
  typeRef.current = type;

  useEffect(() => {
    function ping() {
      if (document.hidden) return;
      void recordStudyHeartbeatAction(typeRef.current);
    }

    ping();
    const interval = setInterval(ping, PING_INTERVAL_MS);

    function handleVisibilityChange() {
      if (!document.hidden) ping();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
}
