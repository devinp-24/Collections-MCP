// Starts the server over stdio, lists its tools and calls the read-only ones,
// the same way Claude Desktop or Claude Code would. Point it at running apps
// with PARC_URL / STOCKROOM_URL (and tokens to exercise the write tools with
// SMOKE_WRITES=1).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: 'node', args: ['src/index.js'], env: process.env, stderr: 'inherit' });
const client = new Client({ name: 'smoke', version: '1.0.0' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log('tools:', tools.map((t) => t.name).join(', '));

const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  console.log(`\n# ${name} ${JSON.stringify(args)}${r.isError ? ' (error)' : ''}\n${r.content[0].text.slice(0, 600)}`);
  return r;
};

await call('gt7_progress');
await call('gt7_progress', { maker: 'Porsche' });
await call('gt7_missing_cars', { sort: 'cheapest', limit: 3 });
await call('gt7_in_stock_today');
await call('gt7_find_car', { query: 'porsche 917' });
await call('stockroom_overview');
await call('stockroom_search', { query: 'kobe', status: 'wishlist', limit: 3 });
if (process.env.SMOKE_WRITES) {
  await call('stockroom_add_pair', { brand: 'Nike', model: 'Kobe 6 Protro', colorway: 'Grinch', sku: 'CW2190-300' });
  await call('gt7_set_owned', { car: 'porsche 917', owned: true });
}
await client.close();
