/** @type {import('next').NextConfig} */

// Applied to every response. The CSP is strict because the app renders no
// third-party content: no external scripts, styles, fonts, or frames.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // 'unsafe-inline' is required by Next.js for its inline bootstrap
      // scripts and by styled-jsx / Tailwind's inline style attributes.
      // 'unsafe-eval' is DEV-ONLY: next dev uses eval-based source maps, and
      // without it no page hydrates (every button dead). Production stays strict.
      process.env.NODE_ENV === "production"
        ? "script-src 'self' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // 6 months; only meaningful when served over HTTPS (production).
  { key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Local library mode gets its own build dir so `pnpm local` can run
  // alongside `pnpm dev` in the same checkout without the two dev servers
  // clobbering each other's build artifacts.
  distDir: process.env.LOCAL_MODE === "1" ? ".next-local" : ".next",
  // Self-contained server bundle for the packaged desktop app (electron/).
  // Never set on Vercel, so the deployed build is unaffected. Pinning the
  // tracing root keeps server.js at standalone/server.js instead of nesting
  // under an inferred workspace root.
  ...(process.env.BUILD_STANDALONE === "1"
    ? { output: "standalone", outputFileTracingRoot: process.cwd() }
    : {}),
  // @react-pdf/renderer must run in Node and should not be bundled by the
  // server compiler — it ships its own native-ish font/stream handling.
  serverExternalPackages: ["@react-pdf/renderer"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
