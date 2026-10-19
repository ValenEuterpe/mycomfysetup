import type { AuthedUser } from "@/lib/auth";

/**
 * What a user is allowed to do. Derived, never stored — so adding a capability
 * later is an edit to this file rather than a schema migration.
 */
export type Capabilities = {
  /** Turn fast mode off and pay for a full 20-step render. */
  canDisableFastMode: boolean;
  /** Reach /admin and the /api/admin/* routes. */
  canAdminister: boolean;
  /**
   * Reach /filmmaking and /api/film/*. Independent of advanced: a user can have
   * one, the other, both, or neither. Owner always has it, so the feature can
   * be dogfooded without a row flag.
   */
  canAccessFilmmaking: boolean;
  /** Can generate videos (t2v, i2v, filmmaking). */
  canAccessVideo: boolean;
  /** Reach /text-to-image and generate images (t2i). */
  canAccessImage: boolean;
  /** Access advanced image generation settings and model picker. */
  canAccessAdvanced: boolean;
};

export function capabilitiesFor(user: AuthedUser): Capabilities {
  return {
    canDisableFastMode: user.can_access_advanced || user.is_owner,
    canAdminister: user.is_owner,
    canAccessFilmmaking: user.can_access_filmmaking || user.is_owner,
    canAccessVideo: user.can_access_video || user.is_owner,
    canAccessImage: user.can_access_image || user.is_owner,
    canAccessAdvanced: user.can_access_advanced || user.is_owner,
  };
}

/**
 * The authoritative fast-mode decision. Fast is the default for everyone; only
 * a user with advanced access can opt out.
 *
 * `requested` is untrusted input straight off the request body. Anything other
 * than an explicit `false` from a permitted user resolves to fast, so a
 * malformed, absent, or forged value degrades to the cheap render rather than
 * the expensive one.
 */
export function resolveFastMode(user: AuthedUser, requested: unknown): boolean {
  if (!capabilitiesFor(user).canDisableFastMode) return true;
  return requested !== false;
}
