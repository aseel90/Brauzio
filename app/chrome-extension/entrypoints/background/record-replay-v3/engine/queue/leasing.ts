/**
  * Brauzio internal note.
  * Brauzio internal note.
 */

import type { UnixMillis } from '../../domain/json';
import type { RunId } from '../../domain/ids';
import type { RunQueue, RunQueueConfig, Lease } from './queue';

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface LeaseManager {
  /**
    * Brauzio internal note.
    * Brauzio internal note.
   */
  startHeartbeat(ownerId: string): void;

  /**
    * Brauzio internal note.
    * Brauzio internal note.
   */
  stopHeartbeat(ownerId: string): void;

  /**
    * Brauzio internal note.
    * Brauzio internal note.
    * Brauzio internal note.
   */
  reclaimExpiredLeases(now: UnixMillis): Promise<RunId[]>;

  /**
    * Brauzio internal note.
   */
  isLeaseExpired(lease: Lease, now: UnixMillis): boolean;

  /**
    * Brauzio internal note.
   */
  createLease(ownerId: string, now: UnixMillis): Lease;

  /**
    * Brauzio internal note.
   */
  dispose(): void;
}

/**
  * Brauzio internal note.
 */
export function createLeaseManager(queue: RunQueue, config: RunQueueConfig): LeaseManager {
  const heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();

  return {
    startHeartbeat(ownerId: string): void {
      // Brauzio internal note.
      this.stopHeartbeat(ownerId);

      // Brauzio internal note.
      const timer = setInterval(async () => {
        try {
          await queue.heartbeat(ownerId, Date.now());
        } catch (error) {
          console.error(`[LeaseManager] Heartbeat failed for ${ownerId}:`, error);
        }
      }, config.heartbeatIntervalMs);

      heartbeatTimers.set(ownerId, timer);
    },

    stopHeartbeat(ownerId: string): void {
      const timer = heartbeatTimers.get(ownerId);
      if (timer) {
        clearInterval(timer);
        heartbeatTimers.delete(ownerId);
      }
    },

    async reclaimExpiredLeases(now: UnixMillis): Promise<RunId[]> {
      // Delegate to the queue implementation which uses the lease_expiresAt index
      // for efficient scanning and updates storage atomically.
      return queue.reclaimExpiredLeases(now);
    },

    isLeaseExpired(lease: Lease, now: UnixMillis): boolean {
      return lease.expiresAt < now;
    },

    createLease(ownerId: string, now: UnixMillis): Lease {
      return {
        ownerId,
        expiresAt: now + config.leaseTtlMs,
      };
    },

    dispose(): void {
      for (const timer of heartbeatTimers.values()) {
        clearInterval(timer);
      }
      heartbeatTimers.clear();
    },
  };
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export function generateOwnerId(): string {
  return `sw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
