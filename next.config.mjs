/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server in .next/standalone with only the files it needs,
  // so the Docker image doesn't ship the full node_modules.
  output: "standalone",
};

export default nextConfig;
