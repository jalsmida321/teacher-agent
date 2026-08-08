import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@earendil-works/pi-coding-agent",
    "pdfkit",
    "mammoth",
    "pdf-parse",
    "xlsx",
  ],
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;
