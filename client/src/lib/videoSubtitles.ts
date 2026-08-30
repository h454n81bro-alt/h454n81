export type PlaybackCue = {
  id: number;
  position: number;
  startMs: number;
  endMs: number;
  sourceText: string;
  indonesianText: string | null;
};

function vttTimestamp(milliseconds: number) {
  const value = Math.max(0, Math.floor(milliseconds));
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.floor((value % 3_600_000) / 60_000);
  const seconds = Math.floor((value % 60_000) / 1_000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(value % 1_000).padStart(3, "0")}`;
}

export function createIndonesianVtt(cues: PlaybackCue[]) {
  return `WEBVTT\n\n${cues.map(cue => `${vttTimestamp(cue.startMs)} --> ${vttTimestamp(cue.endMs)}\n${cue.indonesianText ?? cue.sourceText}`).join("\n\n")}`;
}

export function activeCueId(cues: PlaybackCue[], playbackSeconds: number) {
  const playbackMs = Math.floor(playbackSeconds * 1000);
  return cues.find(cue => cue.startMs <= playbackMs && playbackMs < cue.endMs)?.id ?? null;
}
