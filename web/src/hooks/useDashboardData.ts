import { useEffect, useState } from "react";
import { fetchDashboardData } from "../api";
import type { DashboardData } from "../types";

const POLL_MS = 60_000;

export function useDashboardData(adminToken: string) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!adminToken) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const next = await fetchDashboardData(adminToken);
        if (!cancelled) {
          setData(next);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    setLoading(true);
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [adminToken]);

  return { data, error, loading };
}
