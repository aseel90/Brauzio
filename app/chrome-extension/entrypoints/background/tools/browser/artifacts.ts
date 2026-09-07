import { createErrorResponse, type ToolResult } from '@/common/tool-handler';
import { artifactManager } from '../../runtime-v3/artifact-manager';
import { BaseBrowserToolExecutor } from '../base-browser';

interface ArtifactParams {
  action: 'list' | 'get' | 'wait';
  downloadId?: number;
  limit?: number;
  timeoutMs?: number;
}

class ArtifactsTool extends BaseBrowserToolExecutor {
  name = 'chrome_artifacts';

  async execute(args: ArtifactParams): Promise<ToolResult> {
    if (!args?.action || !['list', 'get', 'wait'].includes(args.action)) {
      return createErrorResponse('chrome_artifacts action must be list, get, or wait');
    }
    try {
      if (args.action === 'list') {
        const artifacts = await artifactManager.list(args.limit);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, artifacts }) }], isError: false };
      }
      if (typeof args.downloadId !== 'number') return createErrorResponse(`${args.action} requires downloadId`);
      if (args.action === 'get') {
        const artifact = await artifactManager.get(args.downloadId);
        if (!artifact) return createErrorResponse(`Download ${args.downloadId} not found`);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, artifact }) }], isError: false };
      }
      const artifact = await artifactManager.waitForDownload(args.downloadId, args.timeoutMs);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, artifact }) }], isError: false };
    } catch (error) {
      return createErrorResponse(`chrome_artifacts failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export const artifactsTool = new ArtifactsTool();
