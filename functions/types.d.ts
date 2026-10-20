/**
 * Minimal ambient declaration for Cloudflare KV namespaces.
 *
 * The full @cloudflare/workers-types package is intentionally NOT enabled
 * statically in tsconfig (it conflicts with the "DOM" lib used by the Vite
 * web app). Only the small KV surface required by the Telegram bot's
 * settings store is declared here.
 */
declare interface KVNamespacePutOptions {
  expirationTtl?: number;
}

declare interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: KVNamespacePutOptions): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Cloudflare's `cf` fetch extension accepted by the Workers runtime
 * (not part of the DOM lib's RequestInit).
 */
interface RequestInit {
  cf?: { cacheTtl?: number; cacheEverything?: boolean };
}
