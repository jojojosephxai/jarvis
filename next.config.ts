import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server is opened at 127.0.0.1. Next blocks those scripts unless this host is allowed.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
