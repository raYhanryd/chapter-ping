import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, type ActivityPage, type ActivityFilters } from "./api";

export const queryKeys = {
  me: ["me"] as const,
  series: ["series"] as const,
  destinations: ["destinations"] as const,
  activity: (filters: ActivityFilters) => ["activity", filters] as const,
};

export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: api.me, retry: false });
}

export function useAdminOverview() {
  return useQuery({ queryKey: ["admin-overview"], queryFn: api.adminOverview, retry: false });
}

export function useStatus() {
  return useQuery({ queryKey: ["status"], queryFn: api.status, retry: false });
}

export function usePublicSeries(id: string) {
  return useQuery({
    queryKey: ["public-series", id],
    queryFn: () => api.publicSeries(id),
    retry: false,
  });
}

export function useSeries() {
  return useQuery({ queryKey: queryKeys.series, queryFn: api.series });
}

export function useSeriesSearch(query: string, enabled: boolean) {
  return useQuery({
    queryKey: ["series-search", query],
    queryFn: () => api.searchSeries(query),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export function useDestinations() {
  return useQuery({ queryKey: queryKeys.destinations, queryFn: api.destinations });
}

export function useActivity(status?: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.activity({ status }),
    queryFn: ({ pageParam }) => api.activity({ status, cursor: pageParam || undefined }),
    initialPageParam: "",
    getNextPageParam: (lastPage: ActivityPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useSeriesActivity(seriesId: string) {
  return useQuery({
    queryKey: queryKeys.activity({ seriesId, limit: 10 }),
    queryFn: () => api.activity({ seriesId, limit: 10 }),
  });
}

export function useDiscordSignIn() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(callbackURL?: string) {
    setPending(true);
    setError(null);
    try {
      const url = await api.signIn(callbackURL);
      window.location.assign(url);
    } catch {
      setError("Discord sign-in could not start. Try again.");
      setPending(false);
    }
  }

  return { start, pending, error };
}
