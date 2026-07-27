import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // reactCompiler 与 Turbopack 组合在 Next 16 上不稳定，先关掉排查
  reactCompiler: false,
  // better-sqlite3 是 native (.node) 模块，
  // 让 Next.js/Turbopack 不要打包它，交给 Node 原生 require，
  // 否则 HMR 时容易 segfault 导致 dev server 挂掉。
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
