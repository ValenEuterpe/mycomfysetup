import React from "react";
import { Monitor, Send } from "lucide-react";
import { DeliveryPrefs } from "../lib/storage";

interface DeliveryTogglesProps {
  prefs: DeliveryPrefs;
  onChange: (prefs: DeliveryPrefs) => void;
}

export const DeliveryToggles: React.FC<DeliveryTogglesProps> = ({ prefs, onChange }) => {
  const toggle = (key: keyof DeliveryPrefs) => {
    onChange({ ...prefs, [key]: !prefs[key] });
  };

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        Delivery
      </span>
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={() => toggle("loadInBrowser")}
          className={`flex-1 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold border transition-all duration-150 ${
            prefs.loadInBrowser
              ? "bg-indigo-600/15 border-indigo-500/50 text-indigo-300"
              : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700"
          }`}
        >
          <Monitor className="w-4 h-4" />
          <span>Load in browser</span>
          <span
            className={`ml-auto w-2 h-2 rounded-full ${
              prefs.loadInBrowser ? "bg-indigo-400" : "bg-zinc-700"
            }`}
          />
        </button>
        <button
          type="button"
          onClick={() => toggle("sendToTelegram")}
          className={`flex-1 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold border transition-all duration-150 ${
            prefs.sendToTelegram
              ? "bg-sky-600/15 border-sky-500/50 text-sky-300"
              : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700"
          }`}
        >
          <Send className="w-4 h-4" />
          <span>Send to Telegram</span>
          <span
            className={`ml-auto w-2 h-2 rounded-full ${
              prefs.sendToTelegram ? "bg-sky-400" : "bg-zinc-700"
            }`}
          />
        </button>
      </div>
      {!prefs.loadInBrowser && prefs.sendToTelegram && (
        <span className="text-[11px] text-sky-400/80">
          Output goes straight to Telegram — the browser won't display it.
        </span>
      )}
      {!prefs.loadInBrowser && !prefs.sendToTelegram && (
        <span className="text-[11px] text-amber-400/80">
          Both outputs disabled — generation results will be discarded.
        </span>
      )}
    </div>
  );
};
