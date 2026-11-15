import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker build sets NEXT_OUTPUT=standalone; local `npm start` keeps the default output.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // Let the dev server answer an iPad reaching it through an HTTPS tunnel (see README).
  allowedDevOrigins: ["*.trycloudflare.com", "*.ngrok-free.app"],
  experimental: {
    agentFeedback: true,
  },
  // Primary language for browsers' language detection (pages also declare <html lang="en">).
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Content-Language", value: "en" }] }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
