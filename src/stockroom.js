// Tools over The Stockroom, the sneaker collection and wishlist.
import { dollars, matches } from './client.js';

const describe = (p) => ({
  id: p.id,
  name: [p.brand, p.model, p.colorway].filter(Boolean).join(' '),
  status: p.status === 'owned' ? 'owned' : 'wishlist',
  size: p.size || null,
  [p.status === 'owned' ? 'paid' : 'target']: p.price || null,
  market: typeof p.marketPrice === 'number' ? Math.round(p.marketPrice) : null,
  sku: p.sku || null,
  tags: p.tags?.length ? p.tags : undefined,
  notes: p.notes || undefined,
});

const haystack = (p) => [p.brand, p.model, p.colorway, p.sku, ...(p.tags || [])].join(' ');

export function stockroomTools(api) {
  const collection = async () => (await api.get('/api/collection')).items || [];

  return [
    {
      name: 'stockroom_overview',
      title: 'Sneaker collection overview',
      description: 'Counts for the sneaker collection and wishlist, the estimated market value of owned pairs, and the top brands.',
      input: () => ({}),
      run: async () => {
        const items = await collection();
        const owned = items.filter((p) => p.status === 'owned');
        const wanted = items.filter((p) => p.status !== 'owned');
        const value = owned.reduce((s, p) => s + (typeof p.marketPrice === 'number' ? p.marketPrice : 0), 0);
        const brands = Object.entries(
          items.reduce((acc, p) => ({ ...acc, [p.brand || 'Unknown']: (acc[p.brand || 'Unknown'] || 0) + 1 }), {})
        )
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8);
        return {
          text: `${owned.length} pairs owned (est. market value ${dollars(Math.round(value))}), ${wanted.length} on the wishlist.`,
          data: { owned: owned.length, wishlist: wanted.length, estimatedValue: Math.round(value), topBrands: Object.fromEntries(brands) },
        };
      },
    },
    {
      name: 'stockroom_search',
      title: 'Search sneakers',
      description:
        'Search the collection and wishlist by brand, silhouette, colourway, SKU or tag. Use maxMarketPrice to find wishlist ' +
        'pairs that are currently affordable.',
      input: (z) => ({
        query: z.string().optional().describe('e.g. "kobe", "curry 6", "DQ7"'),
        status: z.enum(['owned', 'wishlist', 'all']).default('all'),
        maxMarketPrice: z.number().positive().optional().describe('Only pairs whose market price is at most this (USD)'),
        limit: z.number().int().min(1).max(100).default(20),
      }),
      run: async ({ query, status, maxMarketPrice, limit }) => {
        let items = await collection();
        if (status !== 'all') items = items.filter((p) => (status === 'owned' ? p.status === 'owned' : p.status !== 'owned'));
        if (query) items = items.filter((p) => matches(haystack(p), query));
        if (maxMarketPrice) items = items.filter((p) => typeof p.marketPrice === 'number' && p.marketPrice > 0 && p.marketPrice <= maxMarketPrice);
        if (maxMarketPrice) items.sort((a, b) => a.marketPrice - b.marketPrice);
        return {
          text: `${items.length} pair${items.length === 1 ? '' : 's'} match. Showing ${Math.min(limit, items.length)}.`,
          data: items.slice(0, limit).map(describe),
        };
      },
    },
    {
      name: 'stockroom_add_pair',
      title: 'Add a sneaker',
      description:
        'Add a pair to the wishlist (default) or the collection. With a SKU / style code, the server fills in the canonical ' +
        'name, colourway, photo and market price from KicksDB. Duplicates are detected and not added twice. Needs the owner token.',
      writes: true,
      input: (z) => ({
        brand: z.string().optional(),
        model: z.string().optional().describe('Silhouette, e.g. "Kobe 6 Protro"'),
        colorway: z.string().optional(),
        sku: z.string().optional().describe('Style code, e.g. "CW2190-300"'),
        status: z.enum(['want', 'owned']).default('want'),
        price: z.string().optional().describe('Target price (wishlist) or price paid (owned)'),
        size: z.string().optional(),
        notes: z.string().optional(),
      }),
      run: async (args) => {
        if (!args.sku && !args.model && !args.brand) throw new Error('Give at least a SKU, or a brand and model.');
        const { duplicate, pair } = await api.post('/api/pairs', { ...args, lookup: Boolean(args.sku) });
        const name = [pair.brand, pair.model, pair.colorway].filter(Boolean).join(' ');
        return {
          text: duplicate
            ? `${name} is already in the stockroom (${pair.status === 'owned' ? 'owned' : 'wishlist'}). Nothing added.`
            : `Added ${name} to the ${pair.status === 'owned' ? 'collection' : 'wishlist'}.`,
          data: describe(pair),
        };
      },
    },
    {
      name: 'stockroom_mark_bought',
      title: 'Move a wishlist pair to the collection',
      description: 'Record that a wishlist pair was bought, with the price paid. Give the pair id from stockroom_search. Needs the owner token.',
      writes: true,
      input: (z) => ({
        id: z.string().describe('Pair id from stockroom_search'),
        pricePaid: z.string().optional(),
      }),
      run: async ({ id, pricePaid }) => {
        const { pair } = await api.patch(`/api/pairs/${encodeURIComponent(id)}`, {
          status: 'owned',
          ...(pricePaid ? { price: pricePaid } : {}),
        });
        return { text: `${pair.brand} ${pair.model} ${pair.colorway || ''} moved to the collection.`.replace(/\s+/g, ' '), data: describe(pair) };
      },
    },
  ];
}
