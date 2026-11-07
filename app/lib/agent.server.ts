import Anthropic from "@anthropic-ai/sdk";
import { getCollections } from "./db.server";
import type { Order, SupportMessage } from "./types";

/**
 * Drafting has two modes:
 * - "claude": a real tool-using agent on the Claude API (needs ANTHROPIC_API_KEY)
 * - "demo":   a free, rule-based drafter that uses the same lookupOrder tool,
 *             so the whole app works without paying for an API key.
 */
export type DraftMode = "claude" | "demo";

export function getDraftMode(): DraftMode {
  return process.env.ANTHROPIC_API_KEY ? "claude" : "demo";
}

// ---------------------------------------------------------------------------
// The tool (shared by both modes)
// ---------------------------------------------------------------------------

/** Reads one order from MongoDB. Accepts "1001", "#1001" or " #1001 ". */
export async function lookupOrder(orderId: string): Promise<Order | null> {
  const normalized = "#" + orderId.trim().replace(/^#/, "");
  const { orders } = await getCollections();
  return orders.findOne({ orderId: normalized }, { projection: { _id: 0 } });
}

/** Tool definition sent to Claude: a name, a description and a JSON schema for the input. */
const tools: Anthropic.Beta.BetaTool[] = [
  {
    name: "lookupOrder",
    description:
      "Look up a customer's order by its order number (e.g. '#1001' or '1001'). Returns status, items, carrier, tracking number and estimated delivery, or a not-found message.",
    input_schema: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "The order number mentioned by the customer" },
      },
      required: ["orderId"],
      additionalProperties: false,
    },
    strict: true, // the API guarantees the input matches the schema
  },
];

// ---------------------------------------------------------------------------
// Claude mode: a manual agent loop
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You draft email replies for the customer support team of "Northwind Goods", a small Shopify store.

Store policies:
- Returns accepted within 30 days of delivery for unused items; refunds go back to the original payment method within 5-10 business days after the return arrives.
- Wrong or damaged items: we send a free replacement and a prepaid return label.
- Shipping address can only be changed while an order is still "processing".
- Discount codes: you cannot verify codes; offer to have a teammate check it.

How to write the draft:
- If the customer mentions an order number, call lookupOrder first and use the real data (status, carrier, tracking, dates).
- Never invent order details, tracking numbers, or dates. If no order is found, or no number is given, politely ask for the order number and the email used at checkout.
- Be warm, concise (under 150 words), and specific. Acknowledge frustration when present.
- Address the customer by first name and sign off as "The Northwind Goods Team".
- Output only the email body, no subject line.`;

const MAX_TURNS = 5; // safety cap on model <-> tool round trips
const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

async function draftWithClaude(message: SupportMessage): Promise<string> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `Customer: ${message.customerName} <${message.email}>\nSubject: ${message.subject}\n\n${message.body}`,
    },
  ];

  // The agent loop: ask Claude -> if it wants a tool, run it and send the result
  // back -> repeat until Claude answers with plain text.
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.beta.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      tools,
      messages,
      output_config: { effort: "low" }, // short support emails don't need deep reasoning
      // If a safety classifier declines, retry on a fallback model automatically.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    if (response.stop_reason === "refusal") {
      throw new Error("Claude declined to draft a reply for this message.");
    }

    if (response.stop_reason === "tool_use") {
      // Keep Claude's full turn (including its tool request) in the history.
      messages.push({ role: "assistant", content: response.content });

      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const { orderId } = block.input as { orderId: string };
        const order = await lookupOrder(orderId);
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: order ? JSON.stringify(order) : `No order found with number ${orderId}.`,
        });
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    // Final answer: join the text blocks.
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    if (!text) throw new Error(`Claude returned no text (stop reason: ${response.stop_reason}).`);
    return text;
  }

  throw new Error(`The agent did not finish within ${MAX_TURNS} turns.`);
}

// ---------------------------------------------------------------------------
// Demo mode: free, deterministic drafts from the same order data
// ---------------------------------------------------------------------------

async function draftWithTemplates(message: SupportMessage): Promise<string> {
  const firstName = message.customerName.split(" ")[0];
  const sign = "\n\nBest,\nThe Northwind Goods Team";
  const orderId = message.body.match(/#\s?(\d{3,})/)?.[1];

  if (!orderId) {
    return `Hi ${firstName},\n\nThanks for reaching out! To help with "${message.subject}", could you reply with your order number and the email you used at checkout? A teammate will take it from there.${sign}`;
  }

  const order = await lookupOrder(orderId);
  if (!order) {
    return `Hi ${firstName},\n\nThanks for your message. I couldn't find an order with the number #${orderId}. Could you double-check it and confirm the email used at checkout?${sign}`;
  }

  const items = order.items.map((i) => i.name).join(", ");
  const statusLine = {
    processing: `Your order ${order.orderId} (${items}) is still being prepared, so we can still make changes to it.`,
    shipped: `Your order ${order.orderId} (${items}) has shipped with ${order.carrier}, tracking number ${order.trackingNumber}, estimated delivery ${order.estimatedDelivery}.`,
    delivered: `Our records show your order ${order.orderId} (${items}) was delivered by ${order.carrier}.`,
    refunded: `Your order ${order.orderId} (${items}) was refunded. Refunds take 5-10 business days to appear on your statement.`,
  }[order.status];

  return `Hi ${firstName},\n\nThanks for getting in touch. ${statusLine} Let me know if there's anything else I can do.${sign}`;
}

// ---------------------------------------------------------------------------

/** Entry point used by the route action. */
export async function draftReply(message: SupportMessage): Promise<{ draft: string; mode: DraftMode }> {
  const mode = getDraftMode();
  const draft = mode === "claude" ? await draftWithClaude(message) : await draftWithTemplates(message);
  return { draft, mode };
}
