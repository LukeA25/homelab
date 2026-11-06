/**
 * In-flight Ask jobs that survive AskScreen unmount (tab switches).
 * The HTTP call + server persistence keep going; the UI reattaches on remount.
 */

type AskJob = {
  threadId: string;
  question: string;
  promise: Promise<void>;
};

const jobs = new Map<string, AskJob>();
const listeners = new Set<(threadId: string) => void>();

function notify(threadId: string) {
  listeners.forEach((fn) => {
    try {
      fn(threadId);
    } catch {
      /* ignore subscriber errors */
    }
  });
}

export function subscribeAskJobs(fn: (threadId: string) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getAskJob(threadId: string | null | undefined): AskJob | null {
  if (!threadId) return null;
  return jobs.get(threadId) ?? null;
}

export function isAskJobRunning(threadId: string | null | undefined): boolean {
  return Boolean(threadId && jobs.has(threadId));
}

/** Run work for a thread; concurrent calls for the same thread share the same promise. */
export function runAskJob(threadId: string, question: string, work: () => Promise<void>): Promise<void> {
  const existing = jobs.get(threadId);
  if (existing) return existing.promise;

  const promise = (async () => {
    try {
      await work();
    } finally {
      jobs.delete(threadId);
      notify(threadId);
    }
  })();

  jobs.set(threadId, { threadId, question, promise });
  notify(threadId);
  return promise;
}
