import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server allows localhost. Opening 127.0.0.1 is a different host,
  // and Next blocks those dev assets until the host is listed here.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
