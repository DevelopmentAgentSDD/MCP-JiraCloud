import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Logger } from 'pino';

/**
 * Conecta el MCP Server al transporte stdio.
 *
 * @param server - Instancia de McpServer del SDK
 * @param logger - Logger pino para mensajes de estado
 */
export async function connectStdioTransport(server: McpServer, logger: Logger): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('MCP Server connected via stdio transport');
}
