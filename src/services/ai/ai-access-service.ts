import { AsyncLocalStorage } from "node:async_hooks";
import { AIQueueBusyError } from "./ai-core";
import { aiJobService } from "./ai-job-service";

type AiAccessContext =
  | { owner: "durable"; jobId: string }
  | { owner: "interactive"; reservationId: string };

const accessContext = new AsyncLocalStorage<AiAccessContext>();

/** Marks every provider call inside a worker job as covered by that job's lease. */
export function runWithDurableAiLease<T>(jobId: string, fn: () => Promise<T>): Promise<T> {
  return accessContext.run({ owner: "durable", jobId }, fn);
}

/**
 * Gives ad-hoc interactive AI one short DB-backed lease. It never waits behind
 * queued generation: callers receive AIQueueBusyError and can show a fallback.
 */
export async function runWithInteractiveAiLease<T>(fn: () => Promise<T>): Promise<T> {
  const current = accessContext.getStore();
  if (current) return fn();

  // Existing pure unit tests intentionally exercise provider parsing without a
  // database. Integration tests cover the repository reservation separately.
  if (process.env.NODE_ENV === "test") return fn();

  const reservationId = await aiJobService.acquireInteractiveReservation();
  if (!reservationId) throw new AIQueueBusyError();
  try {
    return await accessContext.run({ owner: "interactive", reservationId }, fn);
  } finally {
    await aiJobService.releaseInteractiveReservation(reservationId);
  }
}
