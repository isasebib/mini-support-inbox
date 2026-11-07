import { ObjectId } from "mongodb";
import { useFetcher } from "react-router";
import type { Route } from "./+types/home";
import { draftReply } from "~/lib/agent.server";
import { getCollections } from "~/lib/db.server";
import type { MessageView } from "~/lib/types";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Mini Support Inbox" }];
}

/** Runs on the server for every page load (and after every action): reads all messages. */
export async function loader({}: Route.LoaderArgs) {
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
  try {
    const { messages } = await getCollections();
    const docs = await messages.find().sort({ receivedAt: -1 }).toArray();
    const view: MessageView[] = docs.map((m) => ({
      id: m._id!.toString(),
      customerName: m.customerName,
      email: m.email,
      subject: m.subject,
      body: m.body,
      status: m.status,
      draft: m.draft,
      error: m.error,
      receivedAt: m.receivedAt.toISOString(),
    }));
    return { messages: view, dbError: null, hasApiKey };
  } catch (err) {
    // Show a friendly message instead of crashing the whole page.
    console.error(err);
    return { messages: [] as MessageView[], dbError: (err as Error).message, hasApiKey };
  }
}

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Handles POSTs from the "Draft reply" button.
 * Runs the agent, then saves the draft (or the error) on the message document.
 * After it returns, React Router re-runs the loader so the UI shows fresh data.
 */
export async function action({ request }: Route.ActionArgs): Promise<ActionResult> {
  const form = await request.formData();
  const messageId = String(form.get("messageId") ?? "");

  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, error: "OPENAI_API_KEY is not set. Add it to your .env file and restart the dev server." };
  }
  if (!ObjectId.isValid(messageId)) {
    return { ok: false, error: "Invalid message id." };
  }

  const _id = new ObjectId(messageId);
  try {
    const { messages } = await getCollections();
    const message = await messages.findOne({ _id });
    if (!message) return { ok: false, error: "Message not found." };

    const draft = await draftReply(message);
    await messages.updateOne(
      { _id },
      { $set: { draft, status: "drafted", error: null, updatedAt: new Date() } },
    );
    return { ok: true };
  } catch (err) {
    const error = (err as Error).message || "Unknown error while drafting.";
    console.error("Draft failed:", err);
    // Persist the failure so the card shows it even after a reload.
    // Wrapped in its own try because the DB itself might be what failed.
    try {
      const { messages } = await getCollections();
      await messages.updateOne({ _id }, { $set: { status: "error", error, updatedAt: new Date() } });
    } catch {}
    return { ok: false, error };
  }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { messages, dbError, hasApiKey } = loaderData;
  const drafted = messages.filter((m) => m.status === "drafted").length;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Mini Support Inbox</h1>
        <p className="text-sm text-gray-500">
          {messages.length} messages · {drafted} drafted · click "Draft reply" to let the AI agent write a response
        </p>
      </header>

      {!hasApiKey && (
        <Banner tone="warn">
          <strong>OPENAI_API_KEY is missing.</strong> You can browse messages, but drafting is disabled until you add
          the key to <code>.env</code> and restart the server.
        </Banner>
      )}

      {dbError && (
        <Banner tone="error">
          <strong>Could not load messages.</strong> {dbError}
        </Banner>
      )}

      {!dbError && messages.length === 0 && (
        <p className="text-gray-500">
          No messages yet. Run <code>npm run seed</code> to add some.
        </p>
      )}

      <ul className="space-y-4">
        {messages.map((m) => (
          <MessageCard key={m.id} message={m} canDraft={hasApiKey} />
        ))}
      </ul>
    </main>
  );
}

function MessageCard({ message: m, canDraft }: { message: MessageView; canDraft: boolean }) {
  // Each card gets its own fetcher, so several drafts can run at once and
  // the page doesn't navigate or lose scroll position.
  const fetcher = useFetcher<ActionResult>();
  const isDrafting = fetcher.state !== "idle";

  // Prefer the error from the latest click; fall back to the one saved in the DB.
  const error = isDrafting ? null : fetcher.data && !fetcher.data.ok ? fetcher.data.error : m.error;

  return (
    <li className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-medium">{m.subject}</h2>
          <p className="text-xs text-gray-500">
            {m.customerName} · {m.email} · {new Date(m.receivedAt).toLocaleString()}
          </p>
        </div>
        <StatusBadge status={isDrafting ? "drafting" : m.status} />
      </div>

      <p className="mt-3 text-sm">{m.body}</p>

      <fetcher.Form method="post" className="mt-4">
        <input type="hidden" name="messageId" value={m.id} />
        <button
          type="submit"
          disabled={isDrafting || !canDraft}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isDrafting ? "Drafting…" : m.draft ? "Redraft reply" : "Draft reply"}
        </button>
      </fetcher.Form>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          ⚠️ {error}
        </p>
      )}

      {m.draft && (
        <div className={`mt-4 rounded-lg border-l-4 border-indigo-400 bg-indigo-50 p-4 dark:bg-indigo-950 ${isDrafting ? "opacity-50" : ""}`}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
            AI draft
          </p>
          <p className="whitespace-pre-wrap text-sm">{m.draft}</p>
        </div>
      )}
    </li>
  );
}

function StatusBadge({ status }: { status: MessageView["status"] | "drafting" }) {
  const styles = {
    open: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    drafting: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    drafted: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    error: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  } as const;
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${styles[status]}`}>{status}</span>;
}

function Banner({ tone, children }: { tone: "warn" | "error"; children: React.ReactNode }) {
  const styles =
    tone === "warn"
      ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      : "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200";
  return <div className={`mb-6 rounded-lg border p-4 text-sm ${styles}`}>{children}</div>;
}
