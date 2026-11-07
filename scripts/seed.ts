/**
 * Seeds MongoDB with fake orders and customer messages.
 * Run with: npm run seed   (safe to re-run: it wipes both collections first)
 */
import { getCollections } from "../app/lib/db.server.ts";
import type { Order, SupportMessage } from "../app/lib/types.ts";

const orders: Order[] = [
  {
    orderId: "#1001",
    email: "emma.j@example.com",
    customerName: "Emma Johnson",
    items: [{ name: "Linen Overshirt (M, Sand)", quantity: 1, price: 68 }],
    total: 68,
    currency: "USD",
    status: "shipped",
    carrier: "UPS",
    trackingNumber: "1Z999AA10123456784",
    estimatedDelivery: "2026-11-10",
    placedAt: "2026-11-02",
  },
  {
    orderId: "#1002",
    email: "lucas.m@example.com",
    customerName: "Lucas Martin",
    items: [{ name: "Ceramic Pour-Over Set", quantity: 1, price: 45 }],
    total: 45,
    currency: "USD",
    status: "delivered",
    carrier: "USPS",
    trackingNumber: "9400111202555842332211",
    estimatedDelivery: "2026-10-28",
    placedAt: "2026-10-22",
  },
  {
    orderId: "#1003",
    email: "aisha.k@example.com",
    customerName: "Aisha Khan",
    items: [
      { name: "Organic Cotton Tee (S, Black)", quantity: 2, price: 28 },
      { name: "Canvas Tote", quantity: 1, price: 22 },
    ],
    total: 78,
    currency: "USD",
    status: "delivered",
    carrier: "FedEx",
    trackingNumber: "771234567890",
    estimatedDelivery: "2026-11-01",
    placedAt: "2026-10-27",
  },
  {
    orderId: "#1004",
    email: "noah.b@example.com",
    customerName: "Noah Brown",
    items: [{ name: "Wool Runner Sneakers (US 10)", quantity: 1, price: 110 }],
    total: 110,
    currency: "USD",
    status: "shipped",
    carrier: "DHL",
    trackingNumber: "JD014600006281234567",
    estimatedDelivery: "2026-11-04", // already past due -> shipping delay
    placedAt: "2026-10-25",
  },
  {
    orderId: "#1005",
    email: "sofia.r@example.com",
    customerName: "Sofia Rossi",
    items: [{ name: "Vitamin C Serum 30ml", quantity: 1, price: 34 }],
    total: 34,
    currency: "USD",
    status: "processing",
    carrier: null,
    trackingNumber: null,
    estimatedDelivery: null,
    placedAt: "2026-11-06",
  },
  {
    orderId: "#1006",
    email: "liam.w@example.com",
    customerName: "Liam Walker",
    items: [{ name: "Merino Beanie (Forest)", quantity: 1, price: 30 }],
    total: 30,
    currency: "USD",
    status: "refunded",
    carrier: "UPS",
    trackingNumber: "1Z999AA10198765432",
    estimatedDelivery: "2026-10-20",
    placedAt: "2026-10-14",
  },
];

// Some messages mention an order number, some don't, one mentions an order
// that doesn't exist -- so the agent has to decide when to call lookupOrder.
const rawMessages: Array<Pick<SupportMessage, "customerName" | "email" | "subject" | "body">> = [
  {
    customerName: "Emma Johnson",
    email: "emma.j@example.com",
    subject: "Where is my order?",
    body: "Hi! I ordered a linen overshirt last week (order #1001). Any idea when it will arrive? I need it for a trip on the 12th.",
  },
  {
    customerName: "Lucas Martin",
    email: "lucas.m@example.com",
    subject: "Refund request",
    body: "Hello, the pour-over set from order #1002 arrived fine but it's smaller than I expected. Can I get a refund?",
  },
  {
    customerName: "Aisha Khan",
    email: "aisha.k@example.com",
    subject: "Wrong item received",
    body: "I ordered two black tees in size S (order #1003) but one of them is white. Can you send the right one?",
  },
  {
    customerName: "Noah Brown",
    email: "noah.b@example.com",
    subject: "Package is late",
    body: "My sneakers were supposed to arrive on Nov 4 and they still aren't here. Order #1004. This is frustrating.",
  },
  {
    customerName: "Sofia Rossi",
    email: "sofia.r@example.com",
    subject: "Change shipping address",
    body: "Hi, I just placed order #1005 and realised I used my old address. Can I still change it to 22 Via Roma, Milan?",
  },
  {
    customerName: "Liam Walker",
    email: "liam.w@example.com",
    subject: "Haven't seen my refund",
    body: "You said my beanie order #1006 was refunded but I don't see the money on my card yet. When will it show up?",
  },
  {
    customerName: "Mia Chen",
    email: "mia.c@example.com",
    subject: "Discount code not working",
    body: "The code WELCOME10 from your newsletter says it's invalid at checkout. Can you help? I haven't ordered yet.",
  },
  {
    customerName: "Oliver Smith",
    email: "oliver.s@example.com",
    subject: "Order status",
    body: "Can you check on order #2099? I haven't received any shipping email.",
  },
];

async function main() {
  const { messages, orders: ordersCol } = await getCollections();

  await Promise.all([messages.deleteMany({}), ordersCol.deleteMany({})]);
  await ordersCol.insertMany(orders);
  await ordersCol.createIndex({ orderId: 1 }, { unique: true });

  // Spread receivedAt over the last few hours so the inbox has a realistic order.
  const now = Date.now();
  await messages.insertMany(
    rawMessages.map((m, i) => ({
      ...m,
      status: "open" as const,
      draft: null,
      draftSource: null,
      error: null,
      receivedAt: new Date(now - (rawMessages.length - i) * 37 * 60_000),
      updatedAt: new Date(),
    })),
  );

  console.log(`Seeded ${orders.length} orders and ${rawMessages.length} messages.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
