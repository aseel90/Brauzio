/**
  * Brauzio internal note.
  * Brauzio internal note.
 */

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface V2Reader {
  /* Brauzio internal note. */
  readFlows(): Promise<unknown[]>;
  /* Brauzio internal note. */
  readRuns(): Promise<unknown[]>;
  /* Brauzio internal note. */
  readTriggers(): Promise<unknown[]>;
  /* Brauzio internal note. */
  readSchedules(): Promise<unknown[]>;
}

/**
  * Brauzio internal note.
 */
export function createNotImplementedV2Reader(): V2Reader {
  const notImplemented = async () => {
    throw new Error('V2Reader not implemented');
  };

  return {
    readFlows: notImplemented,
    readRuns: notImplemented,
    readTriggers: notImplemented,
    readSchedules: notImplemented,
  };
}
