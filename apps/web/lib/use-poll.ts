"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface PollOptions<T> {
  /** Milliseconds until the next fetch, or null to stop polling. */
  interval: (data: T) => number | null;
  /** Skip polling entirely (e.g. while a form is submitting). */
  paused?: boolean;
}

export interface Poll<T> {
  data: T;
  error: Error | null;
  updatedAt: number;
  refreshing: boolean;
  refresh: () => Promise<void>;
}

/**
 * Keep server data fresh without WebSockets.
 *
 * The API is a Lambda behind an HTTP API in AWS mode, which cannot hold a
 * stream open, so the timeline polls. It slows down on errors, stops when the
 * tab is hidden, and refreshes immediately when the tab comes back.
 */
export function usePoll<T>(fetcher: () => Promise<T>, initial: T, options: PollOptions<T>): Poll<T> {
  const [data, setData] = useState<T>(initial);
  const [error, setError] = useState<Error | null>(null);
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);

  const fetcherRef = useRef(fetcher);
  const intervalRef = useRef(options.interval);
  const dataRef = useRef(data);
  const failures = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const tickRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    fetcherRef.current = fetcher;
    intervalRef.current = options.interval;
  });

  const schedule = useCallback((delay: number | null) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (delay == null || document.hidden) return;
    timer.current = setTimeout(() => void tickRef.current(), delay);
  }, []);

  const tick = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const next = await fetcherRef.current();
      dataRef.current = next;
      failures.current = 0;
      setData(next);
      setError(null);
      setUpdatedAt(Date.now());
      schedule(intervalRef.current(next));
    } catch (err) {
      failures.current += 1;
      setError(err instanceof Error ? err : new Error(String(err)));
      const base = intervalRef.current(dataRef.current) ?? 5000;
      schedule(Math.min(base * 2 ** failures.current, 30000));
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, [schedule]);

  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  useEffect(() => {
    if (options.paused) return;
    schedule(intervalRef.current(dataRef.current));
    const onVisibility = () => {
      if (document.hidden) schedule(null);
      else void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [options.paused, schedule, tick]);

  const refresh = useCallback(() => tick(), [tick]);

  return { data, error, updatedAt, refreshing, refresh };
}
