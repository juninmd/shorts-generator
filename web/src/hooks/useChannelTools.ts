import { useCallback, useEffect, useState } from "react";
import {
  createCut,
  createScheduleEntry,
  deleteCut,
  deleteScheduleEntry,
  getSourceAnalysis,
  listCuts,
  listSchedule,
} from "../api";
import type { ManualCut, ManualCutInput, ScheduleEntry, ScheduleEntryInput, SourceAnalysis } from "../types";

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useCuts(adminToken: string, channelId: string) {
  const [cuts, setCuts] = useState<ManualCut[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!adminToken || !channelId) {
      setCuts([]);
      return;
    }
    try {
      setError(null);
      setCuts(await listCuts(adminToken, channelId));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [adminToken, channelId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = async (input: ManualCutInput) => {
    await createCut(adminToken, channelId, input);
    await refresh();
  };
  const remove = async (cutId: string) => {
    await deleteCut(adminToken, channelId, cutId);
    await refresh();
  };
  return { cuts, error, add, remove };
}

export function useSchedule(adminToken: string, channelId: string) {
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!adminToken || !channelId) {
      setEntries([]);
      return;
    }
    try {
      setError(null);
      setEntries(await listSchedule(adminToken, channelId));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [adminToken, channelId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = async (input: ScheduleEntryInput) => {
    await createScheduleEntry(adminToken, channelId, input);
    await refresh();
  };
  const remove = async (entryId: string) => {
    await deleteScheduleEntry(adminToken, channelId, entryId);
    await refresh();
  };
  return { entries, error, add, remove };
}

export function useAnalysis(adminToken: string, channelId: string, sourceVideoId: string) {
  const [analysis, setAnalysis] = useState<SourceAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAnalysis(null);
    setError(null);
    if (!adminToken || !channelId || !sourceVideoId) return;
    let active = true;
    getSourceAnalysis(adminToken, channelId, sourceVideoId)
      .then((result) => active && setAnalysis(result))
      .catch((err: unknown) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [adminToken, channelId, sourceVideoId]);

  return { analysis, error };
}
