import { z } from 'zod';
import { existsSync, statSync, readFileSync } from 'fs';
import { resolve, isAbsolute, basename } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '../services/jira-client.js';

/** Maximum file size for Jira Cloud attachments (10 MB). */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Schema de entrada para la tool "attach_file".
 * Valida que el archivo exista, sea legible y no exceda {@link MAX_FILE_SIZE_BYTES}.
 */
export const AttachFileInputSchema = z
  .object({
    issueKey: z.string().min(1).describe('Issue key (e.g., "PROJ-123"). REQUIRED.'),
    filePath: z
      .string()
      .min(1)
      .describe('Absolute or relative path to the file. REQUIRED.')
      .refine(
        (path) => {
          const absolutePath = isAbsolute(path) ? path : resolve(process.cwd(), path);
          if (!existsSync(absolutePath)) return false;
          const stats = statSync(absolutePath);
          if (!stats.isFile()) return false;
          if (stats.size > MAX_FILE_SIZE_BYTES) return false;
          return true;
        },
        {
          message: 'File must exist, be readable, and be less than 10 MB in size.',
        },
      ),
    fileName: z
      .string()
      .min(1)
      .optional()
      .describe('Optional custom filename to use as the attachment name in Jira.'),
    mimeType: z
      .string()
      .min(1)
      .optional()
      .describe('Optional MIME type override (e.g., "image/png", "text/plain").'),
  })
  .strict();

export type AttachFileInput = z.infer<typeof AttachFileInputSchema>;

// ── Raw types from Jira API ─────────────────────────────────────────────────

interface JiraAttachmentRaw {
  id: string;
  filename: string;
  size: number;
  mimeType?: string;
  created?: string;
  self?: string;
}

// ── MIME type detection ─────────────────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.csv': 'text/csv',
  '.md': 'text/markdown',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.log': 'text/plain',
  '.yaml': 'application/x-yaml',
  '.yml': 'application/x-yaml',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
};

function detectMimeType(filename: string): string {
  const ext = basename(filename)
    .toLowerCase()
    .match(/\.[^.]+$/)?.[0];
  return ext ? (MIME_TYPES[ext] ?? 'application/octet-stream') : 'application/octet-stream';
}

// ── File resolution ─────────────────────────────────────────────────────────

function resolveFilePath(filePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
}

// ── Handler factory ─────────────────────────────────────────────────────────

interface AttachmentInfo {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  created: string;
  url: string;
}

interface AttachFileOutput {
  issueKey: string;
  attachment: AttachmentInfo;
}

/**
 * Crea el handler para la tool "attach_file".
 */
export function createAttachFileHandler(jiraClient: JiraClient) {
  return async (input: AttachFileInput) => {
    const host = jiraClient.config.host;
    const absolutePath = resolveFilePath(input.filePath);
    const filename = input.fileName ?? basename(absolutePath);
    const mimeType = input.mimeType ?? detectMimeType(filename);

    // Read file buffer
    const fileBuffer = readFileSync(absolutePath);

    // Build multipart form data
    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer], { type: mimeType }), filename);

    const response = await jiraClient.post<JiraAttachmentRaw[]>(
      `/rest/api/3/issue/${input.issueKey}/attachments`,
      formData,
      true, // isFormData
    );

    // Jira returns an array of attachments (usually one)
    const attachments = Array.isArray(response.data) ? response.data : [response.data];
    const firstAttachment = attachments[0];
    if (!firstAttachment) {
      throw new Error('No attachment returned from Jira API');
    }
    const attachment = firstAttachment;

    const output: AttachFileOutput = {
      issueKey: input.issueKey,
      attachment: {
        id: attachment.id,
        filename: attachment.filename ?? filename,
        size: attachment.size ?? fileBuffer.length,
        mimeType: attachment.mimeType ?? mimeType,
        created: attachment.created ?? new Date().toISOString(),
        url: `https://${host}/secure/attachment/${attachment.id}/${encodeURIComponent(attachment.filename ?? filename)}`,
      },
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(output),
        },
      ],
    };
  };
}

// ── MCP Registration ────────────────────────────────────────────────────────

/**
 * Registra la tool "attach_file" en el MCP Server.
 */
export function registerAttachFile(server: McpServer, jiraClient: JiraClient): void {
  const handler = createAttachFileHandler(jiraClient);

  server.tool(
    'attach_file',
    `Attach a local file to a Jira issue. Provide the issue key and the absolute or relative path to the file on the local filesystem. The file must exist and be readable. Maximum file size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB (Jira Cloud limit). Common file types are supported: images, PDFs, documents, logs. Returns attachment metadata including filename, size, MIME type, and URL.`,
    AttachFileInputSchema.shape,
    handler,
  );
}
