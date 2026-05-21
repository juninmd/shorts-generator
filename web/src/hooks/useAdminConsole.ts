import { useEffect, useState, useTransition } from "react";
import { deleteChannel, listChannels, listRuns, saveChannel, startManagedRun, testChannel } from "../api";
import type { AdminChannelBundle, AdminRunRecord } from "../types";

const TOKEN_KEY = "shorts-generator-admin-token";

export function useAdminConsole() {
  const [adminToken, setAdminToken] = useState(() => window.localStorage.getItem(TOKEN_KEY) ?? "");
  const [channels, setChannels] = useState<AdminChannelBundle[]>([]);
  const [runs, setRuns] = useState<AdminRunRecord[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    window.localStorage.setItem(TOKEN_KEY, adminToken);
  }, [adminToken]);

  useEffect(() => {
    if (!adminToken) {
      setChannels([]);
      setRuns([]);
      return;
    }
    startTransition(() => {
      void refresh(adminToken, selectedChannelId, setChannels, setRuns, setError);
    });
  }, [adminToken, selectedChannelId]);

  return {
    adminToken,
    setAdminToken,
    channels,
    runs,
    selectedChannelId,
    setSelectedChannelId,
    error,
    isPending,
    async save(bundle: AdminChannelBundle) {
      await mutate(async () => saveChannel(adminToken, bundle.channel.id, bundle), adminToken, selectedChannelId, setChannels, setRuns, setError);
    },
    async remove(channelId: string) {
      await mutate(async () => deleteChannel(adminToken, channelId), adminToken, selectedChannelId, setChannels, setRuns, setError);
    },
    async test(channelId: string) {
      await mutate(async () => testChannel(adminToken, channelId), adminToken, selectedChannelId, setChannels, setRuns, setError);
    },
    async run(channelId: string) {
      await mutate(async () => startManagedRun(adminToken, channelId), adminToken, channelId, setChannels, setRuns, setError);
    },
    async refreshNow() {
      await refresh(adminToken, selectedChannelId, setChannels, setRuns, setError);
    },
  };
}

async function mutate(
  action: () => Promise<unknown>,
  adminToken: string,
  selectedChannelId: string,
  setChannels: (channels: AdminChannelBundle[]) => void,
  setRuns: (runs: AdminRunRecord[]) => void,
  setError: (error: string | null) => void,
) {
  try {
    setError(null);
    await action();
    await refresh(adminToken, selectedChannelId, setChannels, setRuns, setError);
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  }
}

async function refresh(
  adminToken: string,
  selectedChannelId: string,
  setChannels: (channels: AdminChannelBundle[]) => void,
  setRuns: (runs: AdminRunRecord[]) => void,
  setError: (error: string | null) => void,
) {
  try {
    setError(null);
    const [nextChannels, nextRuns] = await Promise.all([
      listChannels(adminToken),
      listRuns(adminToken, selectedChannelId || undefined, 0, 20),
    ]);
    setChannels(nextChannels);
    setRuns(nextRuns);
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  }
}