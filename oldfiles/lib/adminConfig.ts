/**
 * Admin panel display and privacy configuration.
 *
 * Supported environment variables:
 *
 * 1. `SHOW_IP_ADDRESS` (aliases: `ADMIN_SHOW_IP_ADDRESS`, `NEXT_PUBLIC_SHOW_IP_ADDRESS`):
 *    - Defaults to `true`.
 *    - When set to `false` (or `0`, `off`, `no`), user IP addresses are stripped
 *      from server responses and the IP column is hidden in the Admin Users table.
 *
 * 2. `SHOW_PROMPTS` (aliases: `ADMIN_SHOW_PROMPTS`, `NEXT_PUBLIC_SHOW_PROMPTS`):
 *    - Defaults to `true`.
 *    - When set to `false` (or `0`, `off`, `no`), user prompt logs cannot be viewed
 *      in the admin panel, user names are displayed as plain text instead of clickable
 *      buttons, and prompt retrieval via the admin prompts API returns 403 Forbidden.
 */

function parseBool(val: string | undefined, defaultValue: boolean): boolean {
  if (val === undefined || val === null || val === "") return defaultValue;
  const lower = val.trim().toLowerCase();
  if (lower === "false" || lower === "0" || lower === "no" || lower === "off") return false;
  if (lower === "true" || lower === "1" || lower === "yes" || lower === "on") return true;
  return defaultValue;
}

export function shouldShowIpAddress(): boolean {
  return parseBool(
    process.env.SHOW_IP_ADDRESS ??
      process.env.ADMIN_SHOW_IP_ADDRESS ??
      process.env.NEXT_PUBLIC_SHOW_IP_ADDRESS,
    true,
  );
}

export function shouldShowPrompts(): boolean {
  return parseBool(
    process.env.SHOW_PROMPTS ??
      process.env.ADMIN_SHOW_PROMPTS ??
      process.env.NEXT_PUBLIC_SHOW_PROMPTS,
    true,
  );
}

export type AdminConfig = {
  showIpAddress: boolean;
  showPrompts: boolean;
};

export function getAdminConfig(): AdminConfig {
  return {
    showIpAddress: shouldShowIpAddress(),
    showPrompts: shouldShowPrompts(),
  };
}
