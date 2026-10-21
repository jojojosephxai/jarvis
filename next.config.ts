import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phone Safari opens this dev server by the computer's LAN address.
  // Next only allows localhost unless those hosts are listed.
  // 127.0.0.1 is a different host from localhost, so it is listed too.
  allowedDevOrigins: ["127.0.0.1", "*.*.*.*"],
  devIndicators: false,
};

export default nextConfig;
