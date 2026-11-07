import type { ObjectId } from "mongodb";

/** Lifecycle of a customer message in the inbox. */
export type MessageStatus = "open" | "drafted" | "error";

/** A customer message as stored in the `messages` collection. */
export interface SupportMessage {
  _id?: ObjectId;
  customerName: string;
  email: string;
  subject: string;
  body: string;
  status: MessageStatus;
  /** AI-generated reply draft (null until drafted). */
  draft: string | null;
  /** Last drafting error shown in the UI (null when OK). */
  error: string | null;
  receivedAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

/** A fake Shopify-style order stored in the `orders` collection. */
export interface Order {
  _id?: ObjectId;
  orderId: string; // e.g. "#1042"
  email: string;
  customerName: string;
  items: OrderItem[];
  total: number;
  currency: string;
  status: "processing" | "shipped" | "delivered" | "refunded";
  carrier: string | null;
  trackingNumber: string | null;
  estimatedDelivery: string | null; // ISO date
  placedAt: string; // ISO date
}

/**
 * The shape sent from the loader to the browser.
 * ObjectId/Date are converted to strings so the data is plain JSON.
 */
export interface MessageView {
  id: string;
  customerName: string;
  email: string;
  subject: string;
  body: string;
  status: MessageStatus;
  draft: string | null;
  error: string | null;
  receivedAt: string;
}
