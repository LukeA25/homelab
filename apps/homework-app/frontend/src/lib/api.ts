import type { Assignment, AssignmentInput, AssignmentsResponse, Course } from "./types";

const BASE = "/api";

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) message = body.detail;
    } catch {
      // keep status text
    }
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return res.status === 204 ? (null as T) : ((await res.json()) as T);
}

function json<T>(method: string, path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const api = {
  courses: () => request<{ courses: Course[] }>("/courses"),
  assignments: () => request<AssignmentsResponse>("/assignments"),
  create: (body: AssignmentInput) => json<Assignment>("POST", "/assignments", body),
  update: (id: number, body: Partial<AssignmentInput> & { done?: boolean }) =>
    json<Assignment>("PATCH", `/assignments/${id}`, body),
  remove: (id: number) => request<null>(`/assignments/${id}`, { method: "DELETE" }),
  clearDone: () => json<{ deleted: number }>("POST", "/assignments/clear-done"),
};
