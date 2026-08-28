"use client";

import { useRef, useState, useImperativeHandle, forwardRef } from "react";

export interface DictationButtonHandle {
  /** Programmatically start/stop recording. */
  toggle: () => void;
}

export interface DictationButtonProps {
  /** ID or ref of the textarea/input to fill with transcribed text. */
  targetId?: string;
  /** Callback receiving the transcribed text. */
  onTranscribe?: (text: string) => void;
  /** If true, append to existing text instead of replacing. */
  append?: boolean;
  /** Button label for screen readers. */
  label?: string;
  /** Small inline button (default) or larger standalone. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * Microphone button that records audio, sends it to /api/transcribe,
 * and fills the target text field with the Whisper transcription.
 *
 * Audio is captured at 16kHz mono via Web Audio API and encoded as
 * 16-bit PCM WAV — no external dependencies needed.
 */
export const DictationButton = forwardRef<DictationButtonHandle, DictationButtonProps>(
  function DictationButton(
    { targetId, onTranscribe, append = true, label = "Dictate", size = "sm", className = "" },
    ref,
  ) {
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const chunksRef = useRef<Float32Array[]>([]);
    const isRecordingRef = useRef(false);

    useImperativeHandle(ref, () => ({
      toggle: () => {
        if (isRecordingRef.current) stopRecording();
        else startRecording();
      },
    }));

    async function startRecording() {
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        streamRef.current = stream;

        const audioContext = new AudioContext({ sampleRate: 16000 });
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(stream);
        sourceRef.current = source;

        // Use ScriptProcessorNode to capture raw PCM.
        // 4096 buffer size, 1 input channel, 1 output channel.
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        chunksRef.current = [];
        isRecordingRef.current = true;

        processor.onaudioprocess = (e) => {
          if (!isRecordingRef.current) return;
          const input = e.inputBuffer.getChannelData(0);
          // Copy the buffer — the underlying ArrayBuffer gets reused.
          chunksRef.current.push(new Float32Array(input));
        };

        source.connect(processor);
        processor.connect(audioContext.destination);

        setIsRecording(true);
      } catch (err) {
        console.error("Microphone error:", err);
        setError("Could not access microphone. Please grant permission.");
        setIsRecording(false);
      }
    }

    function stopRecording() {
      isRecordingRef.current = false;
      setIsRecording(false);
      setIsTranscribing(true);

      // Clean up audio resources.
      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      // Merge chunks and encode as WAV.
      const chunks = chunksRef.current;
      chunksRef.current = [];

      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      if (totalLength === 0) {
        setIsTranscribing(false);
        return;
      }

      const merged = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      const wav = encodeWav(merged, 16000);

      // Close audio context.
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      // Send to server.
      transcribe(wav);
    }

    async function transcribe(wav: ArrayBuffer) {
      try {
        const res = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "audio/wav" },
          body: wav,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Server error ${res.status}`);
        }

        const data = await res.json();
        const text = (data.text || "").trim();

        if (text) {
          // Fill the target textarea if targetId is provided.
          if (targetId) {
            const el = document.getElementById(targetId) as HTMLTextAreaElement | HTMLInputElement | null;
            if (el) {
              if (append && el.value) {
                // Append with a space if there's existing text.
                const sep = el.value.endsWith(" ") || el.value.endsWith("\n") ? "" : " ";
                el.value = el.value + sep + text;
              } else {
                el.value = text;
              }
              // Trigger React's onChange.
              el.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }

          // Also call the callback.
          onTranscribe?.(text);
        }
      } catch (err) {
        console.error("Transcription error:", err);
        setError(err instanceof Error ? err.message : "Transcription failed");
      } finally {
        setIsTranscribing(false);
      }
    }

    /** Encode Float32Array PCM samples as a 16-bit WAV file. */
    function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
      const buffer = new ArrayBuffer(44 + samples.length * 2);
      const view = new DataView(buffer);

      // RIFF header.
      writeString(view, 0, "RIFF");
      view.setUint32(4, 36 + samples.length * 2, true);
      writeString(view, 8, "WAVE");

      // fmt chunk.
      writeString(view, 12, "fmt ");
      view.setUint32(16, 16, true); // chunk size
      view.setUint16(20, 1, true); // PCM format
      view.setUint16(22, 1, true); // mono
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true); // byte rate
      view.setUint16(32, 2, true); // block align
      view.setUint16(34, 16, true); // bits per sample

      // data chunk.
      writeString(view, 36, "data");
      view.setUint32(40, samples.length * 2, true);

      // Write PCM samples.
      let offset = 44;
      for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }

      return buffer;
    }

    function writeString(view: DataView, offset: number, str: string) {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    }

    const sizeClasses = size === "sm" ? "text-xs px-2 py-1.5 min-h-[32px]" : "text-sm px-3 py-2 min-h-[40px]";

    return (
      <div className="inline-flex flex-col gap-0.5">
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isTranscribing}
          className={`${sizeClasses} ${className} inline-flex items-center gap-1.5 font-semibold rounded border transition-colors ${
            isRecording
              ? "text-stamp border-stamp/30 bg-stamp/10 animate-pulse"
              : isTranscribing
                ? "text-ink-soft border-rule bg-paper-2 cursor-wait"
                : "text-ink-soft border-rule hover:bg-paper-2 active:bg-paper-2"
          }`}
          title={isRecording ? "Stop recording" : isTranscribing ? "Transcribing..." : "Dictate via microphone"}
          aria-label={label}
        >
          {isRecording ? (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-stamp" />
              <span>Stop</span>
            </>
          ) : isTranscribing ? (
            <>
              <span className="inline-block w-3 h-3 border-2 border-ink-soft border-t-transparent rounded-full animate-spin" />
              <span>Transcribing...</span>
            </>
          ) : (
            <>
              <span>🎤</span>
              <span>{label}</span>
            </>
          )}
        </button>
        {error && <p className="text-[10px] text-stamp">{error}</p>}
      </div>
    );
  },
);
