import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phone Safari opens this dev server by the computer's LAN address.
  // Next only allows localhost unless those hosts are listed.
  allowedDevOrigins: ["127.0.0.1", "*.*.*.*"],
};

export default nextConfig;
