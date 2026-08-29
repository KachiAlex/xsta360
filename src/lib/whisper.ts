import "server-only";

/**
 * Server-side Whisper speech-to-text using @xenova/transformers.
 *
 * The model (Xenova/whisper-tiny.en) is loaded once as a singleton and reused
 * across requests. It runs via ONNX Runtime on the CPU.
 *
 * Model: ~40MB, English-only, fast on CPU.
 * First request downloads the model; subsequent requests use the cache.
 *
 * Uses dynamic import to avoid loading native modules (sharp, onnxruntime)
 * at build time — they're only loaded when the first transcription request
 * comes in at runtime.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transcriber: Promise<any> | null = null;

/** Lazily load the Whisper model (singleton) via dynamic import. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTranscriber(): Promise<any> {
  if (!transcriber) {
    transcriber = import("@xenova/transformers").then(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ pipeline, env }: any) => {
        // Allow remote models (download from Hugging Face Hub on first use).
        env.allowRemoteModels = true;
        // Cache models in a writable directory (/tmp in Docker, or local cache).
        env.cacheDir = "/tmp/transformers-cache";

        return pipeline("automatic-speech-recognition", "Xenova/whisper-tiny.en", {
          quantized: true,
        });
      },
    );
  }
  return transcriber;
}

/**
 * Decode a WAV file (16kHz, mono, 16-bit PCM) to a Float32Array of samples.
 * This is a lightweight decoder — no external dependencies needed.
 */
function decodeWav(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer);

  // Read WAV header.
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (riff !== "RIFF") throw new Error("Invalid WAV file: missing RIFF header");

  const format = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
  if (format !== "WAVE") throw new Error("Invalid WAV file: missing WAVE format");

  // Find the data chunk.
  let offset = 12;
  let dataOffset = 0;
  let dataLength = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;

  while (offset < buffer.byteLength) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === "fmt ") {
      sampleRate = view.getUint32(offset + 8, true);
      bitsPerSample = view.getUint16(offset + 14, true);
    } else if (chunkId === "data") {
      dataOffset = offset + 8;
      dataLength = chunkSize;
      break;
    }

    offset += 8 + chunkSize;
  }

  if (!dataOffset) throw new Error("Invalid WAV file: no data chunk");
  if (sampleRate !== 16000) throw new Error(`Expected 16kHz sample rate, got ${sampleRate}Hz`);
  if (bitsPerSample !== 16) throw new Error(`Expected 16-bit PCM, got ${bitsPerSample}-bit`);

  // Convert 16-bit PCM samples to Float32Array (-1.0 to 1.0).
  const numSamples = dataLength / 2;
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const int16 = view.getInt16(dataOffset + i * 2, true);
    samples[i] = int16 / 32768.0;
  }

  return samples;
}

/**
 * Transcribe audio from a WAV ArrayBuffer.
 * Returns the transcribed text.
 */
export async function transcribeAudio(wavBuffer: ArrayBuffer): Promise<string> {
  const audio = decodeWav(wavBuffer);

  // Skip if audio is too short (< 0.1 seconds).
  if (audio.length < 1600) return "";

  const pipe = await getTranscriber();
  const output = await pipe(audio, {
    return_timestamps: false,
    chunk_length_s: 30,
    stride_length_s: 5,
  });

  // The output format is { text: string }.
  const text = (output as { text: string }).text.trim();
  return text;
}
