import { useCallback, useEffect, useRef, useState } from "react";
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

// Lista por canal: só a resposta mais recente vale, e trocar de canal limpa a
// lista antiga para nada de outro canal ficar na tela (nem ser apagado nele).
function useChannelList<T>(adminToken: string, channelId: string, load: (token: string, channel: string) => Promise<T[]>) {
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++latest.current;
    if (!adminToken || !channelId) {
      setItems([]);
      return;
    }
    try {
      setError(null);
      const result = await load(adminToken, channelId);
      if (request === latest.current) setItems(result);
    } catch (err) {
      if (request === latest.current) setError(errorMessage(err));
    }
  }, [adminToken, channelId, load]);

  useEffect(() => {
    setItems([]);
    void refresh();
  }, [refresh]);

  return { items, error, refresh };
}

export function useCuts(adminToken: string, channelId: string) {
  const { items: cuts, error, refresh } = useChannelList<ManualCut>(adminToken, channelId, listCuts);
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
  const { items: entries, error, refresh } = useChannelList<ScheduleEntry>(adminToken, channelId, listSchedule);
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
