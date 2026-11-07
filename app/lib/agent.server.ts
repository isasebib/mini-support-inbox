import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";
import { getCollections } from "./db.server";
import type { SupportMessage } from "./types";

/**
 * Tool the agent can call to read an order from MongoDB.
 * The SDK turns the zod schema into a JSON schema for the model and validates
 * the arguments the model sends before `execute` runs.
 */
const lookupOrder = tool({
  name: "lookupOrder",
  description:
    "Look up a customer's order by its order number (e.g. '#1001' or '1001'). Returns order status, items, carrier, tracking and estimated delivery.",
  parameters: z.object({
    orderId: z.string().describe("The order number mentioned by the customer"),
  }),
  async execute({ orderId }) {
    // Normalise "1001" / "#1001" / " #1001 " to the stored format "#1001".
    const normalized = "#" + orderId.trim().replace(/^#/, "");
    const { orders } = await getCollections();
    const order = await orders.findOne({ orderId: normalized }, { projection: { _id: 0 } });
    // Whatever we return is sent back to the model as the tool result.
    return order ? JSON.stringify(order) : `No order found with number ${normalized}.`;
  },
});

const supportAgent = new Agent({
  name: "Support reply drafter",
  instructions: `You draft email replies for the customer support team of "Northwind Goods", a small Shopify store.

Store policies:
- Returns accepted within 30 days of delivery for unused items; refunds go back to the original payment method within 5-10 business days after the return arrives.
- Wrong or damaged items: we send a free replacement and a prepaid return label.
- Shipping address can only be changed while an order is still "processing".
- Discount codes: you cannot verify codes; offer to have a teammate check it.

How to write the draft:
- If the customer mentions an order number, ALWAYS call lookupOrder first and use the real data (status, carrier, tracking, dates).
- Never invent order details, tracking numbers, or dates. If no order is found, or no number is given, politely ask for the order number and the email used at checkout.
- Be warm, concise (under 150 words), and specific. Acknowledge frustration when present.
- Address the customer by first name and sign off as "The Northwind Goods Team".
- Output only the email body, no subject line.`,
  tools: [lookupOrder],
  // No `model` set: the SDK default is used, overridable with OPENAI_DEFAULT_MODEL.
});

/** Runs the agent on one customer message and returns the reply draft text. */
export async function draftReply(message: SupportMessage): Promise<string> {
  const input = `Customer: ${message.customerName} <${message.email}>
Subject: ${message.subject}

${message.body}`;

  // `run` loops: model -> (optional tool calls) -> model ... until a final answer.
  // maxTurns caps that loop so a confused model can't run forever.
  const result = await run(supportAgent, input, { maxTurns: 5 });

  const draft = result.finalOutput?.trim();
  if (!draft) throw new Error("The agent returned an empty reply.");
  return draft;
}
