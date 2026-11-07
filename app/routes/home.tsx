import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Mini Support Inbox" }];
}

export default function Home() {
  return <main className="p-8">Mini Support Inbox</main>;
}
