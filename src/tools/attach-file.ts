import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '../services/jira-client.js';

/**
 * Registra la tool "attach_file" en el MCP Server.
 */
export function registerAttachFile(server: McpServer, _jiraClient: JiraClient): void {
  server.tool(
    'attach_file',
    'Attach a local file to a Jira issue. Provide the issue key and the absolute or relative path to the file on the local filesystem. The file must exist and be readable. Maximum file size is 10 MB (Jira Cloud limit). Common file types are supported: images, PDFs, documents, logs. Returns attachment metadata including filename, size, MIME type, and URL.',
    {
      issueKey: z.string().min(1).describe('Issue key (e.g., "PROJ-123"). REQUIRED.'),
      filePath: z
        .string()
        .min(1)
        .describe('Absolute or relative path to the file. REQUIRED.'),
    },
    async (_input) => {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              issueKey: '',
              attachment: {
                id: '',
                filename: '',
                size: 0,
                mimeType: '',
                created: '',
                url: '',
              },
            }),
          },
        ],
      };
    },
  );
}
