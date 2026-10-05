// On-device transcription fallback (free tier): runs Whisper locally in the
// browser via transformers.js + ONNX Runtime (WebGPU when available, WASM
// otherwise). Audio never leaves the device — no API key, no metering, works
// when the practice's monthly AI budget is exhausted or offline. Quality is
// below the paid path (gpt-4o-mini-transcribe), especially on medical terms,
// so the draft always stays GP-editable and approval-gated.

const MODEL_ID = 'onnx-community/whisper-base';

type ProgressCallback = (status: string) => void;

// The pipeline is expensive to create (~80 MB model download on first use,
// then served from the browser cache) — create it once per session.
let pipelinePromise: Promise<
  (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text?: string }>
> | null = null;

async function getPipeline(onProgress?: ProgressCallback) {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      // `any` — transformers.js's pipeline() has a union type too complex for
      // TS to represent (TS2590); we only use the ASR subset at runtime.
      const mod: any = await import('@huggingface/transformers');
      mod.env.allowLocalModels = false;
      const device = 'gpu' in navigator ? 'webgpu' : 'wasm';
      return mod.pipeline('automatic-speech-recognition', MODEL_ID, {
        dtype: 'q4',
        device,
        progress_callback: (p: { status?: string; file?: string; progress?: number }) => {
          if (!onProgress) return;
          if (p.status === 'progress' && typeof p.progress === 'number') {
            onProgress(`Downloading speech model (${Math.round(p.progress)}%) — one time only`);
          } else if (p.status === 'ready') {
            onProgress('Speech model ready');
          }
        },
      });
    })();
  }
  return pipelinePromise;
}

/** Decode any browser recording and resample to mono 16 kHz Float32 —
 *  the sample rate Whisper expects. */
async function toMono16k(blob: Blob): Promise<Float32Array> {
  const decoded = await new AudioContext().decodeAudioData(await blob.arrayBuffer());
  const rate = 16_000;
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

/** Transcribe a recording on-device. Returns the transcript text. */
export async function transcribeLocal(audio: Blob, onProgress?: ProgressCallback): Promise<string> {
  const pipe = await getPipeline(onProgress);
  onProgress?.('Transcribing on this device…');
  const pcm = await toMono16k(audio);
  const output = await pipe(pcm, {
    language: 'en',
    task: 'transcribe',
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  const text = (output?.text ?? '').trim();
  if (!text) throw new Error('empty transcription');
  return text;
}
