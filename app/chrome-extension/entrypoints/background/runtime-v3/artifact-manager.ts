export interface V3DownloadArtifact {
  downloadId: number;
  filename: string;
  url: string;
  finalUrl?: string;
  state: 'in_progress' | 'interrupted' | 'complete';
  danger: chrome.downloads.DangerType;
  mime?: string;
  startTime?: string;
  endTime?: string;
  bytesReceived?: number;
  totalBytes?: number;
  exists?: boolean;
}

function sanitizeUrl(value: string | undefined): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return value;
  }
}

function mapItem(item: chrome.downloads.DownloadItem): V3DownloadArtifact {
  return {
    downloadId: item.id,
    filename: item.filename,
    url: sanitizeUrl(item.url),
    finalUrl: sanitizeUrl(item.finalUrl),
    state: item.state,
    danger: item.danger,
    mime: item.mime,
    startTime: item.startTime,
    endTime: item.endTime,
    bytesReceived: item.bytesReceived,
    totalBytes: item.totalBytes,
    exists: item.exists,
  };
}

class ArtifactManager {
  async get(downloadId: number): Promise<V3DownloadArtifact | undefined> {
    const items = await chrome.downloads.search({ id: downloadId });
    return items[0] ? mapItem(items[0]) : undefined;
  }

  async list(limit = 20): Promise<V3DownloadArtifact[]> {
    const items = await chrome.downloads.search({ orderBy: ['-startTime'], limit: Math.max(1, Math.min(limit, 100)) });
    return items.map(mapItem);
  }

  async waitForDownload(downloadId: number, timeoutMs = 30000): Promise<V3DownloadArtifact> {
    const current = await this.get(downloadId);
    if (!current) throw new Error(`Download ${downloadId} not found`);
    if (current.state === 'complete') return current;
    if (current.state === 'interrupted') throw new Error(`Download ${downloadId} is interrupted`);

    return await new Promise<V3DownloadArtifact>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => finish(new Error(`Timed out waiting for download ${downloadId}`)), Math.max(100, Math.min(timeoutMs, 120000)));
      const listener = (delta: chrome.downloads.DownloadDelta) => {
        if (delta.id !== downloadId || !delta.state?.current) return;
        if (delta.state.current === 'complete') void finish();
        else if (delta.state.current === 'interrupted') finish(new Error(`Download ${downloadId} was interrupted`));
      };
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        chrome.downloads.onChanged.removeListener(listener);
        if (error) {
          reject(error);
          return;
        }
        void this.get(downloadId).then((item) => {
          if (item) resolve(item);
          else reject(new Error(`Download ${downloadId} disappeared`));
        }, reject);
      };
      chrome.downloads.onChanged.addListener(listener);
    });
  }
}

export const artifactManager = new ArtifactManager();
