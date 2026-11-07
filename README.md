# Mini Support Inbox

A tiny AI-assisted customer-support inbox for a fictional Shopify store. It lists customer messages, and when you click **Draft reply**, an AI agent writes a reply. The agent can look up the customer's real order in MongoDB before it answers. The draft is saved to the database and shown under the message.

![Screenshot](docs/screenshot.png)
<!-- TODO: add a screenshot at docs/screenshot.png -->

## Stack

| Layer | Tech |
| --- | --- |
| UI + server routes | **React Router v8 (framework mode)**, React 19, TypeScript, Tailwind |
| Agent | **OpenAI Agents SDK for TypeScript** (`@openai/agents`) with one tool |
| Database | **MongoDB** (official `mongodb` driver, Atlas free tier) |
| Runtime | Node.js 22+ |

> **Why not Remix?** Remix v2 was merged into React Router v7, so "Remix" apps are now built with React Router's *framework mode*. The concepts are the same: route modules with a server `loader` and `action`, forms that post to actions, and automatic revalidation. This project uses the current release, v8.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Create a free MongoDB Atlas cluster** (M0)
   - Create a cluster, then a database user.
   - Under *Network Access*, allow your IP.
   - Under *Connect → Drivers*, copy the connection string.
3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Fill in `MONGODB_URI` and `OPENAI_API_KEY`. `.env` is git-ignored, so never commit real keys.
4. **Seed fake orders and messages**
   ```bash
   npm run seed
   ```
5. **Run it**
   ```bash
   npm run dev
   ```
   Open http://localhost:5173.

If `OPENAI_API_KEY` is missing, the app still runs. You can browse messages, a banner explains what's missing, and drafting is disabled.

## How it works

```
[Draft reply button]
   │  fetcher.Form POST (messageId)
   ▼
action()  app/routes/home.tsx              ← server only
   │  1. check OPENAI_API_KEY, validate id
   │  2. load message from MongoDB
   ▼
draftReply()  app/lib/agent.server.ts
   │  run(supportAgent, message)  ── model decides ──► lookupOrder("#1004")
   │                                                    └─ reads `orders` in MongoDB
   │  ◄── final reply text
   ▼
action() saves { draft, status: "drafted" }  (or { status: "error", error })
   ▼
React Router re-runs loader() → card re-renders with the draft
```

- **`app/routes/home.tsx`** holds the whole page. `loader` reads messages, `action` drafts one reply, and the components render the UI. Each card has its own `useFetcher`, so it shows its own "Drafting…" state, and several drafts can run at the same time.
- **`app/lib/agent.server.ts`** contains one `Agent` with store-policy instructions and a single `lookupOrder` tool. The tool's zod schema tells the model which arguments it accepts and validates them. The SDK's `run()` loops (model → tool → model) until it has a final answer, capped at 5 turns.
- **`app/lib/db.server.ts`** keeps one cached `MongoClient` and exposes typed `messages` and `orders` collections. The `.server.ts` suffix guarantees this code never ships to the browser.
- **`scripts/seed.ts`** resets both collections with 6 orders and 8 messages. The messages cover order status, a refund, a wrong item, a shipping delay, an address change, a missing refund, a discount code, and an unknown order. It runs directly on Node with built-in TypeScript type stripping.

### Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | for drafting | Used by the Agents SDK |
| `MONGODB_URI` | yes | MongoDB / Atlas connection string |
| `MONGODB_DB` | no | Database name (default `mini_support_inbox`) |
| `OPENAI_DEFAULT_MODEL` | no | Overrides the SDK's default model |

## Possible next steps

- **Auth.** Add agent logins and per-store data isolation.
- **Human-in-the-loop.** Let support staff edit, approve, and send drafts, and track which ones they edited.
- **Multi-agent handoffs.** A triage agent could route to refund, shipping, or product specialists.
- **Trace viewer.** Show which tools the agent called and why, using the SDK's tracing.
- **Real Shopify integration.** Replace the fake `orders` collection with the Shopify Admin API, and verify the customer's email matches the order.
- **Campaigns and proactive messages.**
- **Ops.** Add Redis caching for order lookups, plus Docker and Cloud Run deploy. The `Dockerfile` comes from the React Router template and hasn't been tested yet.
