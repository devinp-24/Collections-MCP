# collections-mcp

An MCP server that lets Claude read and update two of my personal apps:
[Parc Fermé](https://github.com/devinp-24/parc-ferme), my Gran Turismo 7 garage
tracker, and [The Stockroom](https://github.com/devinp-24/the-stockroom), my
sneaker collection and wishlist.

The apps stay the source of truth. This server is a thin, typed layer: it turns
a question in plain English into the right API calls, then returns a one-line
answer along with the data behind it.

> "What's the cheapest car I'm still missing in Gr.3?"
> "Is anything I need in the Legend dealership today, and when does it leave?"
> "Which pairs on my wishlist are under $150 right now?"
> "Add the Kobe 6 Protro Grinch, CW2190-300, to my wishlist."
> "I just bought the 917K. Mark it owned."

## Tools

| Tool | Does | Writes |
| --- | --- | --- |
| `gt7_progress` | owned / missing / credits to finish, optionally for a maker, class or dealership | |
| `gt7_missing_cars` | missing cars, cheapest or priciest first, with an optional budget | |
| `gt7_in_stock_today` | missing cars in today's rotating dealerships, soonest to leave first | |
| `gt7_find_car` | look a car up by name: owned or not, price, where it's sold | |
| `gt7_set_owned` | mark a car bought (asks which one if the name is ambiguous) | ✓ |
| `stockroom_overview` | pairs owned, wishlist size, estimated value, top brands | |
| `stockroom_search` | search by brand / silhouette / colourway / SKU / tag, or by budget | |
| `stockroom_add_pair` | add to the wishlist or collection; a SKU pulls canonical details from KicksDB; duplicates are refused | ✓ |
| `stockroom_mark_bought` | move a wishlist pair to the collection with the price paid | ✓ |

Read tools work against the public, read-only deployments with no
credentials. Write tools need the owner token the apps were deployed with. A
missing token gets a plain "this needs the owner token" back instead of a
stack trace.

## Use it with Claude

Requires Node 20+.

```bash
git clone https://github.com/devinp-24/collections-mcp && cd collections-mcp && npm install
```

**Claude Code:**

```bash
claude mcp add collections \
  -e PARC_URL=https://<parc-ferme>.up.railway.app \
  -e STOCKROOM_URL=https://<the-stockroom>.up.railway.app \
  -e OWNER_TOKEN=<owner token> \
  -- node /absolute/path/to/collections-mcp/src/index.js
```

**Claude Desktop:** add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "collections": {
      "command": "node",
      "args": ["/absolute/path/to/collections-mcp/src/index.js"],
      "env": {
        "PARC_URL": "https://<parc-ferme>.up.railway.app",
        "STOCKROOM_URL": "https://<the-stockroom>.up.railway.app",
        "OWNER_TOKEN": "<owner token>"
      }
    }
  }
}
```

With no URLs set, it talks to the apps on localhost (8797 and 8787).

`npm test` starts the server over stdio and calls every read tool through a real
MCP client, the same way Claude does.

## Design notes

- **Summaries come from the app, not the MCP server.** The GT7 totals come from the server's
  `/api/summary`, which uses the same maths as the page, so Claude and the UI can never disagree.
- **The big catalogue is cached for five minutes,** so a conversation that asks five questions
  downloads the 590-car list once.
- **Adding sneakers goes through `POST /api/pairs`, not a whole-list PUT.** The server queues writes,
  dedupes by SKU / KicksDB id and fills details from the style code, so this client stays small.
- **Tools are annotated read-only or not,** so clients can auto-approve reads and confirm writes.

## Next

- Scoped tokens, so the MCP server can be read-only or write-only per app.
- A voice front end. An iOS Shortcut or a small Expo app could send speech to an LLM with these
  tools, giving "add this to my wishlist" hands-free.

MIT licence.
