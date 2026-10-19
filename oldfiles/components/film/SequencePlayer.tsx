"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { actualDuration } from "@/lib/aspect";
import type { Shot } from "@/lib/film/project";

export type PlayableShot = {
  shot: Shot;
  url: string;
};

type Props = {
  clips: PlayableShot[];
};

export default function SequencePlayer({ clips }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const indexRef = useRef(0);

  const clip = clips[index] ?? null;
  const trim = clip?.shot.trimEndSeconds ?? 0;
  const duration = clip ? actualDuration(clip.shot.durationSeconds) : 0;
  const endAt = Math.max(0.05, duration - trim);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    if (index >= clips.length) setIndex(0);
  }, [clips.length, index]);

  const playFrom = useCallback(
    (nextIndex: number) => {
      const video = videoRef.current;
      const next = clips[nextIndex];
      if (!video || !next) {
        setPlaying(false);
        return;
      }
      setIndex(nextIndex);
      indexRef.current = nextIndex;
      if (video.src !== next.url) video.src = next.url;
      video.currentTime = 0;
      void video.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      );
    },
    [clips],
  );

  const onEnded = () => {
    const next = indexRef.current + 1;
    if (next < clips.length) playFrom(next);
    else setPlaying(false);
  };

  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || trim <= 0) return;
    if (video.currentTime >= endAt - 0.04) {
      video.pause();
      onEnded();
    }
  };

  const toggle = () => {
    const video = videoRef.current;
    if (!video || !clip) return;
    if (playing) {
      video.pause();
      setPlaying(false);
      return;
    }
    void video.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    );
  };

  if (clips.length === 0) {
    return (
      <section className="film-sequence panel">
        <h2 className="film-col-title">Sequence</h2>
        <p className="field-help">Finished shots play here, in order. Generate at least one clip.</p>
      </section>
    );
  }

  return (
    <section className="film-sequence panel">
      <div className="film-sequence-head">
        <h2 className="film-col-title">Sequence</h2>
        <span className="film-sequence-pos">
          Shot {index + 1} of {clips.length}
        </span>
      </div>
      <video
        ref={videoRef}
        className="film-sequence-player"
        src={clip?.url}
        playsInline
        onEnded={trim > 0 ? undefined : onEnded}
        onTimeUpdate={trim > 0 ? onTimeUpdate : undefined}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <div className="film-sequence-controls">
        <button type="button" className="film-sequence-btn" onClick={() => playFrom(Math.max(0, index - 1))} disabled={index === 0}>
          Prev
        </button>
        <button type="button" className="film-sequence-btn film-sequence-play" onClick={toggle}>
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className="film-sequence-btn"
          onClick={() => playFrom(Math.min(clips.length - 1, index + 1))}
          disabled={index >= clips.length - 1}
        >
          Next
        </button>
        <button type="button" className="film-sequence-btn" onClick={() => playFrom(0)}>
          From start
        </button>
      </div>
      <ol className="film-sequence-dots">
        {clips.map((item, i) => (
          <li key={item.shot.id}>
            <button
              type="button"
              className={`film-sequence-dot${i === index ? " is-active" : ""}`}
              onClick={() => playFrom(i)}
              aria-label={`Play shot ${i + 1}`}
            >
              {i + 1}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
