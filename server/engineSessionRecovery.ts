export interface EngineSessionSnapshot {
  id: number;
  status: "active" | "paused" | "stopped" | "completed";
}

export const ORPHANED_SESSION_STOP_REASON = "Recovered orphaned active session before engine start";

/**
 * A fresh process has no in-memory owner for older active session records.
 * Return only those records that must be closed before creating a new session.
 */
export function getOrphanedActiveSessionIds(sessions: EngineSessionSnapshot[]): number[] {
  return sessions
    .filter((session) => session.status === "active")
    .map((session) => session.id);
}
