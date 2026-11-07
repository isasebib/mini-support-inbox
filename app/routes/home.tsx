import type { Route } from "./+types/home";
import { getCollections } from "~/lib/db.server";
import type { MessageView } from "~/lib/types";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Mini Support Inbox" }];
}

/** Runs on the server for every page load: reads all messages from MongoDB. */
export async function loader({}: Route.LoaderArgs) {
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
    return { messages: view, dbError: null };
  } catch (err) {
    // Show a friendly message instead of crashing the whole page.
    console.error(err);
    return { messages: [] as MessageView[], dbError: (err as Error).message };
  }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { messages, dbError } = loaderData;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Mini Support Inbox</h1>
        <p className="text-sm text-gray-500">
          {messages.length} customer messages · click "Draft reply" to let the AI agent write a response
        </p>
      </header>

      {dbError && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          <strong>Could not load messages.</strong> {dbError}
        </div>
      )}

      {!dbError && messages.length === 0 && (
        <p className="text-gray-500">No messages yet. Run <code>npm run seed</code> to add some.</p>
      )}

      <ul className="space-y-4">
        {messages.map((m) => (
          <MessageCard key={m.id} message={m} />
        ))}
      </ul>
    </main>
  );
}

function MessageCard({ message: m }: { message: MessageView }) {
  return (
    <li className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-medium">{m.subject}</h2>
          <p className="text-xs text-gray-500">
            {m.customerName} · {m.email} · {new Date(m.receivedAt).toLocaleString()}
          </p>
        </div>
        <StatusBadge status={m.status} />
      </div>
      <p className="mt-3 text-sm">{m.body}</p>
    </li>
  );
}

function StatusBadge({ status }: { status: MessageView["status"] }) {
  const styles = {
    open: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    drafted: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    error: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  } as const;
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${styles[status]}`}>{status}</span>;
}
