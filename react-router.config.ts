import type { Config } from "@react-router/dev/config";

export default {
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: true,

  // React Router blocks actions (form POSTs) whose `Origin` header doesn't match
  // the request URL, as CSRF protection. On Render, HTTPS ends at Render's proxy,
  // so the Node server sees `http://...` while the browser sends
  // `Origin: https://...`, and every action would be rejected.
  // Trust our own public hostname to allow it.
  allowedActionOrigins: ["mini-support-inbox.onrender.com"],
} satisfies Config;
