/**
 * Brauzio shared Offscreen Document manager.
 * A single offscreen document serves DOM-only runtime capabilities such as
 * GIF encoding and clipboard access.
 */

export class OffscreenManager {
  private static instance: OffscreenManager | null = null;
  private isCreated = false;
  private isCreating = false;
  private createPromise: Promise<void> | null = null;

  private constructor() {}

  public static getInstance(): OffscreenManager {
    if (!OffscreenManager.instance) OffscreenManager.instance = new OffscreenManager();
    return OffscreenManager.instance;
  }

  public async ensureOffscreenDocument(): Promise<void> {
    if (this.isCreated) return;
    if (this.isCreating && this.createPromise) return this.createPromise;

    this.isCreating = true;
    this.createPromise = this._doCreateOffscreenDocument().finally(() => {
      this.isCreating = false;
    });
    return this.createPromise;
  }

  private async _doCreateOffscreenDocument(): Promise<void> {
    try {
      if (!chrome.offscreen) throw new Error('Offscreen API not available. Chrome 109+ required.');

      const existingContexts = await (chrome.runtime as any).getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
      });
      if (existingContexts && existingContexts.length > 0) {
        this.isCreated = true;
        return;
      }

      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['WORKERS', 'CLIPBOARD'] as chrome.offscreen.Reason[],
        justification: 'Encode GIF frames and provide explicit agent-requested clipboard read/write for Brauzio',
      });
      this.isCreated = true;
    } catch (error) {
      this.isCreated = false;
      throw error;
    }
  }

  public isOffscreenDocumentCreated(): boolean {
    return this.isCreated;
  }

  public async closeOffscreenDocument(): Promise<void> {
    try {
      if (chrome.offscreen && this.isCreated) {
        await chrome.offscreen.closeDocument();
        this.isCreated = false;
      }
    } catch {
      // The service-worker lifecycle may outlive the offscreen context.
    }
  }

  public reset(): void {
    this.isCreated = false;
    this.isCreating = false;
    this.createPromise = null;
  }
}

export const offscreenManager = OffscreenManager.getInstance();
