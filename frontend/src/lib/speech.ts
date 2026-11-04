// Speech helpers: the browser's built-in recognition (free mode, wake word and
// "yes"/"go back" confirmation) and a silence-stopping recorder (premium mode,
// clip sent to AI transcription). TS's DOM lib has no SpeechRecognition types.

interface SpeechAlt { transcript: string }
interface SpeechResult { isFinal: boolean; 0: SpeechAlt; length: number }
interface SpeechEvent { resultIndex: number; results: { length: number; [i: number]: SpeechResult } }
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const browserSpeechSupported = () => typeof window !== "undefined" && ctor() !== null;
export const recorderSupported = () =>
  typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia;

const lang = () => (typeof navigator !== "undefined" && navigator.language) || "en-GB";

/** Listen for one utterance with the browser's recognizer. Resolves with the final text ("" if silent). */
export function listenOnce(opts: { onInterim?: (t: string) => void; signal?: AbortSignal } = {}): Promise<string> {
  const C = ctor();
  if (!C) return Promise.reject(new Error("Speech recognition isn't available in this browser"));
  return new Promise((resolve, reject) => {
    const rec = new C();
    rec.lang = lang();
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let finalText = "";
    let settled = false;
    const done = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      opts.onInterim?.((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") done(() => resolve(finalText.trim()));
      else if (e.error === "not-allowed" || e.error === "service-not-allowed")
        done(() => reject(new Error("Microphone access was blocked — allow it in your browser's site settings")));
      else done(() => reject(new Error(`Speech recognition error: ${e.error}`)));
    };
    rec.onend = () => done(() => resolve(finalText.trim()));
    opts.signal?.addEventListener("abort", () => {
      rec.abort();
      done(() => resolve(""));
    });
    rec.start();
  });
}

/** Record until ~1.4 s of silence after speech (or maxMs, or abort). Premium mode. */
export async function recordClip(opts: { maxMs?: number; signal?: AbortSignal; onLevel?: (v: number) => void } = {}): Promise<Blob> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {
    throw new Error("Microphone access was blocked — allow it in your browser's site settings");
  });
  const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);

  return new Promise((resolve) => {
    const started = Date.now();
    let heard = false;
    let quietSince = 0;
    const stop = () => recorder.state !== "inactive" && recorder.stop();
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
      resolve(new Blob(chunks, { type: recorder.mimeType || type || "audio/webm" }));
    };
    opts.signal?.addEventListener("abort", stop);
    const tick = () => {
      if (recorder.state === "inactive") return;
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / buf.length);
      opts.onLevel?.(Math.min(1, rms * 6));
      const now = Date.now();
      if (rms > 0.04) {
        heard = true;
        quietSince = 0;
      } else if (heard) {
        quietSince ||= now;
        if (now - quietSince > 1400) return stop();
      }
      if (now - started > (opts.maxMs ?? 15000) || (!heard && now - started > 7000)) return stop();
      requestAnimationFrame(tick);
    };
    recorder.start(250);
    requestAnimationFrame(tick);
  });
}

// "hey pua" — recognizers spell it many ways; accept the common ones.
const WAKE = /\b(?:hey|hi|ok|okay)[\s,]+(?:pua|poo[\s-]?ah?|pooh?[\s-]?ah|puah|pewa|pure|puma|p\.?\s?u\.?\s?a\.?)\b[\s,.!?]*/i;

export function matchWake(text: string): { rest: string } | null {
  const m = WAKE.exec(text);
  return m ? { rest: text.slice(m.index + m[0].length).trim() } : null;
}

export function matchConfirm(text: string): "yes" | "back" | null {
  const t = text.toLowerCase();
  if (/\b(go back|back|no|cancel|nope|redo|try again|start over)\b/.test(t)) return "back";
  if (/\b(yes|yeah|yep|yup|save|confirm|correct|ok|okay|sure|do it|sounds good)\b/.test(t)) return "yes";
  return null;
}

/** Continuous background listening for the wake phrase, auto-restarting. */
export function startWakeListener(onWake: (rest: string) => void): () => void {
  const C = ctor();
  if (!C) return () => {};
  let stopped = false;
  let rec: Recognition | null = null;
  let failures = 0;
  const begin = () => {
    if (stopped) return;
    rec = new C();
    rec.lang = lang();
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const hit = r.isFinal ? matchWake(r[0].transcript) : null;
        if (hit) {
          stopped = true;
          rec?.abort();
          onWake(hit.rest);
          return;
        }
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") stopped = true;
      else failures++;
    };
    rec.onend = () => {
      if (!stopped) setTimeout(begin, failures > 5 ? 5000 : 300);
    };
    try {
      rec.start();
    } catch {
      setTimeout(begin, 1000);
    }
  };
  begin();
  return () => {
    stopped = true;
    rec?.abort();
  };
}

// ---- spoken replies (speech synthesis) — a device-local preference, on by default
export const SPEAK_KEY = "pua:speak";
export const speechOutputSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;
export const speakEnabled = () => speechOutputSupported() && localStorage.getItem(SPEAK_KEY) !== "0";

export function stopSpeaking() {
  if (speechOutputSupported()) window.speechSynthesis.cancel();
}

/** Read text aloud; resolves when finished (or aborted / unsupported). */
export function speak(text: string, signal?: AbortSignal): Promise<void> {
  if (!speechOutputSupported() || !text) return Promise.resolve();
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang();
    u.rate = 1.03;
    const voice = synth.getVoices().find((v) => v.lang === u.lang) ?? synth.getVoices().find((v) => v.lang.startsWith(u.lang.slice(0, 2)));
    if (voice) u.voice = voice;
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        clearTimeout(guard);
        resolve();
      }
    };
    // Some engines never fire onend — cap at a generous reading time.
    const guard = setTimeout(done, 2000 + text.length * 90);
    u.onend = done;
    u.onerror = done;
    signal?.addEventListener("abort", () => {
      synth.cancel();
      done();
    });
    synth.speak(u);
  });
}
