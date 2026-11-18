#!/usr/bin/env node
// collections-mcp: lets Claude (or any MCP client) read and update two
// personal collection apps through their HTTP APIs.
//
//   Parc Fermé    my Gran Turismo 7 garage: what I own, what is missing,
//                 what it costs to finish, what is in a dealership today
//   The Stockroom my sneaker collection and 800-pair wishlist
//
// The apps stay the source of truth. This server is a thin, typed layer that
// turns a question ("what's the cheapest Porsche I'm missing?") into the
// right API calls and gives back a short, readable answer plus the data.
//
// Reads work with no token. Writes need the owner token the apps were
// deployed with, passed as an environment variable and sent as a bearer
// header. Nothing is stored here.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createClient } from './client.js';
import { gt7Tools } from './gt7.js';
import { stockroomTools } from './stockroom.js';

const config = {
  parcUrl: process.env.PARC_URL || 'http://localhost:8797',
  stockroomUrl: process.env.STOCKROOM_URL || 'http://localhost:8787',
  // One token for both apps is the common case; either can be overridden.
  parcToken: process.env.PARC_TOKEN || process.env.OWNER_TOKEN || '',
  stockroomToken: process.env.STOCKROOM_TOKEN || process.env.OWNER_TOKEN || '',
};

const parc = createClient(config.parcUrl, config.parcToken);
const stockroom = createClient(config.stockroomUrl, config.stockroomToken);

const server = new McpServer({ name: 'collections', version: '1.0.0' });

for (const tool of [...gt7Tools(parc), ...stockroomTools(stockroom)]) {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.input(z),
      annotations: { readOnlyHint: !tool.writes, destructiveHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        const { text, data } = await tool.run(args);
        return {
          content: [{ type: 'text', text: data === undefined ? text : `${text}\n\n${JSON.stringify(data, null, 2)}` }],
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error.message }] };
      }
    }
  );
}

await server.connect(new StdioServerTransport());
// stdout belongs to the protocol; anything for a human goes to stderr.
console.error(`collections-mcp ready (Parc Fermé: ${config.parcUrl}, Stockroom: ${config.stockroomUrl})`);
