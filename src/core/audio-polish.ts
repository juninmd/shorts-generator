export function buildSpeechAudioFilter(duration: number): string {
  const fadeOutStart = Math.max(0, duration - 0.12).toFixed(2);
  // Light broadband noise reduction (hiss, fans, room tone); SPEECH_DENOISE=false skips it.
  const denoise = process.env.SPEECH_DENOISE === "false" ? [] : ["afftdn=nr=12:nf=-35:tn=1"];
  return [
    "highpass=f=70",
    "lowpass=f=16000",
    ...denoise,
    "acompressor=threshold=-18dB:ratio=3:attack=5:release=80:makeup=2:detection=rms",
    "loudnorm=I=-16:TP=-1.5:LRA=7",
    "afade=t=in:st=0:d=0.08",
    `afade=t=out:st=${fadeOutStart}:d=0.12`,
  ].join(",");
}
