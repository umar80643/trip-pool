/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";

// Fonts are self-hosted via next/font (no runtime request to fonts.googleapis.com),
// and Explore's calls to Nominatim/Overpass happen server-side in API routes, not
// from the browser — so this can stay fairly strict. 'unsafe-inline' on script-src
// is a pragmatic concession to Next.js's hydration bootstrap script rather than a
// deliberate loosening; a nonce-based CSP (via middleware, per Next's docs) would
// let us drop it, at the cost of touching middleware.ts, which is the exact file
// implicated in CVE-2025-29927 — not something to extend casually. Worth a proper
// pass if that origin ever comes under attack from injected inline scripts.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (isDev ? " 'unsafe-eval'" : ""), // 'unsafe-eval' only for webpack/React Refresh in dev
  "style-src 'self' 'unsafe-inline'", // Tailwind/Next inject inline styles
  "img-src 'self' data: https:", // https: kept open for future Explore result photos (e.g. Wikimedia)
  "font-src 'self' data:",
  "connect-src 'self'" + (isDev ? " ws:" : " wss:"), // same-origin fetch + the Socket.io connection
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
          { key: "Content-Security-Policy", value: csp },
          ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
        ],
      },
    ];
  },
};

module.exports = nextConfig;
