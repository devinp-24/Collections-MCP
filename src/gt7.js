// Tools over Parc Fermé, the Gran Turismo 7 garage tracker.
import { credits, matches } from './client.js';

const DEALERS = {
  brand: 'Brand Central',
  legend: 'Legend Cars',
  used: 'Used Cars',
  dlc: 'Power Pack DLC',
  reward: 'Reward only',
  unknown: 'Not for sale',
};

const price = (car, record) =>
  typeof record?.priceOverride === 'number' ? record.priceOverride : typeof car.price === 'number' ? car.price : null;

async function entries(api) {
  const [catalogue, garage] = await Promise.all([api.cached('/api/catalogue'), api.get('/api/garage')]);
  const cars = garage?.cars || {};
  return {
    catalogue,
    garage,
    list: catalogue.cars.map((car) => {
      const record = cars[car.id] || cars[String(car.id)] || {};
      return { car, owned: Boolean(record.owned), shortlist: Boolean(record.shortlist), price: price(car, record) };
    }),
  };
}

function scope(list, { maker, carClass, dealer }) {
  return list.filter(
    (e) =>
      (!maker || matches(e.car.maker, maker)) &&
      (!carClass || (e.car.carClass || '').toLowerCase() === carClass.toLowerCase()) &&
      (!dealer || e.car.dealer === dealer)
  );
}

const describe = (e) => ({
  id: e.car.id,
  name: e.car.fullName,
  class: e.car.carClass || null,
  pp: e.car.pp ?? null,
  where: DEALERS[e.car.dealer] || e.car.dealer,
  price: e.price,
  priceNote: e.car.priceKind === 'last-seen' ? `last seen ${e.car.priceDate}` : e.car.priceKind || null,
  inStockToday: e.car.stock && e.car.stock.state !== 'soldout' ? { dealer: DEALERS[e.car.stock.dealer], daysLeft: e.car.stock.daysLeft ?? null } : null,
});

export function gt7Tools(api) {
  const filters = (z) => ({
    maker: z.string().optional().describe('Manufacturer, e.g. "Porsche"'),
    carClass: z.string().optional().describe('GT class, e.g. "Gr.3" or "Gr.4"'),
    dealer: z.enum(['brand', 'legend', 'used', 'dlc', 'reward', 'unknown']).optional().describe('Where the car is sold'),
  });

  return [
    {
      name: 'gt7_progress',
      title: 'GT7 collection progress',
      description:
        'How much of the Gran Turismo 7 car list is owned, how many cars are missing, and the credits needed to finish. ' +
        'Optionally narrowed to a manufacturer, class or dealership.',
      input: (z) => filters(z),
      run: async (args) => {
        const query = new URLSearchParams(Object.entries(args).filter(([, v]) => v));
        const s = await api.get(`/api/summary${query.size ? `?${query}` : ''}`);
        const pct = s.total ? ((s.owned / s.total) * 100).toFixed(1) : '0';
        const within = [args.maker, args.carClass, args.dealer && DEALERS[args.dealer]].filter(Boolean).join(', ');
        const text =
          `${within ? `${within}: ` : ''}${s.owned} of ${s.total} cars owned (${pct}%). ` +
          `${s.missing} missing, costing ${credits(s.credits)} to finish` +
          `${s.unpriced ? ` (${s.unpriced} can't be bought)` : ''}. Garage value ${credits(s.garageValue)}.` +
          (typeof s.wallet === 'number' ? ` Wallet: ${credits(s.wallet)}.` : '');
        return { text, data: s };
      },
    },
    {
      name: 'gt7_missing_cars',
      title: 'Missing GT7 cars',
      description:
        'List cars not yet in the garage, with price and where to buy them. Sort cheapest-first to plan the next purchase, ' +
        'or priciest-first to see what dominates the cost. maxPrice limits it to what is affordable.',
      input: (z) => ({
        ...filters(z),
        maxPrice: z.number().int().positive().optional().describe('Only cars costing at most this many credits'),
        sort: z.enum(['cheapest', 'priciest', 'name']).default('cheapest'),
        limit: z.number().int().min(1).max(100).default(15),
      }),
      run: async (args) => {
        const { list } = await entries(api);
        let missing = scope(list, args).filter((e) => !e.owned);
        if (args.maxPrice) missing = missing.filter((e) => typeof e.price === 'number' && e.price <= args.maxPrice);
        const priced = (e) => (typeof e.price === 'number' ? e.price : Infinity);
        missing.sort(
          args.sort === 'name'
            ? (a, b) => a.car.fullName.localeCompare(b.car.fullName)
            : args.sort === 'priciest'
              ? (a, b) => (b.price ?? -1) - (a.price ?? -1)
              : (a, b) => priced(a) - priced(b)
        );
        const shown = missing.slice(0, args.limit).map(describe);
        const total = missing.reduce((sum, e) => sum + (e.price || 0), 0);
        return {
          text: `${missing.length} missing car${missing.length === 1 ? '' : 's'} match, ${credits(total)} in total. Showing ${shown.length}.`,
          data: shown,
        };
      },
    },
    {
      name: 'gt7_in_stock_today',
      title: 'Missing GT7 cars in a dealership today',
      description:
        "Missing cars that are in today's Used Cars or Legend Cars stock, soonest to leave first. These rotate daily " +
        'and may not come back for months, so this is the "buy now or wait" list.',
      input: () => ({}),
      run: async () => {
        const { list, catalogue } = await entries(api);
        const today = list
          .filter((e) => !e.owned && e.car.stock && e.car.stock.state !== 'soldout')
          .sort((a, b) => (a.car.stock.daysLeft ?? 99) - (b.car.stock.daysLeft ?? 99))
          .map(describe);
        return {
          text: today.length
            ? `${today.length} missing car${today.length === 1 ? ' is' : 's are'} for sale today (stock for ${catalogue.dealershipDate}).`
            : `Nothing missing is in a dealership today (stock for ${catalogue.dealershipDate}).`,
          data: today,
        };
      },
    },
    {
      name: 'gt7_find_car',
      title: 'Find a GT7 car',
      description: 'Look up cars by name or maker and say whether each is owned, its price and where it is sold.',
      input: (z) => ({ query: z.string().min(2).describe('Words from the car name, e.g. "porsche 917"') }),
      run: async ({ query }) => {
        const { list } = await entries(api);
        const found = list.filter((e) => matches(e.car.fullName, query)).slice(0, 20);
        return {
          text: found.length ? `${found.length} car${found.length === 1 ? '' : 's'} match "${query}".` : `No car matches "${query}".`,
          data: found.map((e) => ({ ...describe(e), owned: e.owned, shortlisted: e.shortlist })),
        };
      },
    },
    {
      name: 'gt7_set_owned',
      title: 'Mark a GT7 car owned or not',
      description:
        'Record that a car was bought (or removed). Give the car id from gt7_find_car, or a name that matches exactly one car. ' +
        'Needs the owner token.',
      writes: true,
      input: (z) => ({
        car: z.string().describe('Car id, or words from its name'),
        owned: z.boolean().default(true),
      }),
      run: async ({ car, owned }) => {
        const { list } = await entries(api);
        const byId = /^\d+$/.test(car) ? list.filter((e) => e.car.id === Number(car)) : [];
        const hits = byId.length ? byId : list.filter((e) => matches(e.car.fullName, car));
        if (hits.length === 0) throw new Error(`No car matches "${car}".`);
        if (hits.length > 1) {
          return {
            text: `"${car}" matches ${hits.length} cars. Which one? Call again with its id.`,
            data: hits.slice(0, 15).map((e) => ({ id: e.car.id, name: e.car.fullName, owned: e.owned })),
          };
        }
        const target = hits[0];
        await api.patch(`/api/garage/cars/${target.car.id}`, { owned });
        return { text: `${target.car.fullName} is now ${owned ? 'in' : 'out of'} the garage.` };
      },
    },
  ];
}
