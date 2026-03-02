import { useState, useEffect, useCallback, useRef } from "react";
import type { JobStatus, ShortItem } from "../types";
import { startGeneration, getJobStatus, getShorts } from "../api";

export function useShorts() {
  const [shorts, setShorts] = useState<ShortItem[]>([]);
  const [currentJob, setCurrentJob] = useState<JobStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchShorts = useCallback(async () => {
    try {
      const data = await getShorts();
      setShorts(data);
    } catch {
      // Silently fail on initial load
    }
  }, []);

  const generate = useCallback(async (urls: string[]) => {
    setIsLoading(true);
    setError(null);
    setCurrentJob(null);

    try {
      const { jobId } = await startGeneration(urls);

      // Start polling for job status
      const poll = async () => {
        try {
          const status: JobStatus = await getJobStatus(jobId);
          setCurrentJob(status);

          if (status.status === "completed" || status.status === "failed") {
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
            setIsLoading(false);

            if (status.status === "completed") {
              await fetchShorts();
            } else {
              setError(status.progress?.message ?? "Job failed");
            }
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Polling error");
        }
      };

      // Poll every 3 seconds
      pollingRef.current = setInterval(poll, 3000);
      await poll(); // Immediate first check
    } catch (err) {
      setIsLoading(false);
      setError(err instanceof Error ? err.message : "Failed to start generation");
    }
  }, [fetchShorts]);

  useEffect(() => {
    fetchShorts();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchShorts]);

  return { shorts, currentJob, isLoading, error, generate, fetchShorts };
}
