"use client";

import { useApiKey } from "./ApiKeyProvider";

/**
 * Usage panel for the signed-in user: today's allowance and the lifetime count.
 *
 * Reads the figures the provider already holds — it does **not** fetch. They
 * arrive on the `/api/session` response every page load, move again on every
 * `/api/generate` response, and are re-read at midnight UTC when the daily
 * counter rolls over (see the rollover effect in ApiKeyProvider). One source of
 * truth, no extra round trip, and no server-only helpers in the browser bundle.
 */
export default function UserStats() {
  const { status, capabilities, quota, videoQuota, imageQuota, generations } = useApiKey();

  if (status !== "unlocked") return null;

  if (quota === null && videoQuota === null && imageQuota === null && generations === null) return null;

  const videoLeft = videoQuota ? Math.max(0, videoQuota.limit - videoQuota.used) : null;
  const imageLeft = imageQuota ? Math.max(0, imageQuota.limit - imageQuota.used) : null;
  const generalLeft = quota ? Math.max(0, quota.limit - quota.used) : null;

  const hasSpecificQuotas = Boolean(videoQuota || imageQuota);

  return (
    <section className="stats" aria-label="Your usage">
      {hasSpecificQuotas ? (
        <>
          {capabilities.canAccessVideo && videoQuota && (
            <div className="stat">
              <span className="stat-label">Videos left today</span>
              <span className={videoLeft === 0 ? "stat-value stat-value-full" : "stat-value"}>
                {videoLeft}
                <span className="stat-of"> of {videoQuota.limit}</span>
              </span>
            </div>
          )}
          {capabilities.canAccessImage && imageQuota && (
            <div className="stat">
              <span className="stat-label">Images left today</span>
              <span className={imageLeft === 0 ? "stat-value stat-value-full" : "stat-value"}>
                {imageLeft}
                <span className="stat-of"> of {imageQuota.limit}</span>
              </span>
            </div>
          )}
        </>
      ) : quota ? (
        <>
          <div className="stat">
            <span className="stat-label">Renders left today</span>
            <span className={generalLeft === 0 ? "stat-value stat-value-full" : "stat-value"}>
              {generalLeft}
              <span className="stat-of"> of {quota.limit}</span>
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Used today</span>
            <span className="stat-value">{quota.used}</span>
          </div>
        </>
      ) : (
        <div className="stat">
          <span className="stat-label">Renders left today</span>
          <span className="stat-value">No limit</span>
        </div>
      )}

      {generations !== null && (
        <div className="stat">
          <span className="stat-label">Renders all time</span>
          <span className="stat-value">{generations}</span>
        </div>
      )}

      <p className="stats-foot">
        {(videoLeft === 0 || imageLeft === 0 || generalLeft === 0)
          ? "Daily limit reached — your allowance resets at midnight UTC."
          : "Your daily allowance resets at midnight UTC."}
      </p>
    </section>
  );
}
