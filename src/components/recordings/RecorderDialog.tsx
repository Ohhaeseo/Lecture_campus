"use client";

import { Mic, Pause, Play, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatDuration, MAX_RECORDING_BYTES, pickRecordingMimeType, saveRecording } from "@/lib/recordings";
import { createClient } from "@/lib/supabase/client";
import { ErrorText, Modal } from "../Modal";

// 32kbps 모노 = 1분에 약 240KB → 3시간이면 약 43MB (Supabase 무료 한도 50MB 안쪽)
const AUDIO_BITS_PER_SECOND = 32000;
const BYTES_PER_SECOND = AUDIO_BITS_PER_SECOND / 8;
const AUTO_STOP_BYTES = MAX_RECORDING_BYTES - 1024 * 1024;

type Props = { open: boolean; onClose: () => void; userId: string; courseId: string };

export function RecorderDialog(props: Props) {
  if (!props.open) return null;
  return <RecorderDialogInner {...props} />;
}

function RecorderDialogInner({ open, onClose, userId, courseId }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "recording" | "paused" | "done">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [title, setTitle] = useState(defaultTitle());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const recording = phase === "recording" || phase === "paused";

  // 녹음 중 시간 세기 + 용량이 한도에 가까워지면 자동 종료
  useEffect(() => {
    if (phase !== "recording") return;
    const timer = setInterval(() => {
      setElapsed((seconds) => {
        const next = seconds + 1;
        if (next * BYTES_PER_SECOND >= AUTO_STOP_BYTES) {
          setNotice("용량 한도(50MB)에 도달해 녹음을 저장했어요.");
          recorderRef.current?.stop();
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // 녹음 중 새로고침/닫기 방지
  useEffect(() => {
    if (!recording) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [recording]);

  // 화면을 벗어나면 마이크와 화면 잠금 해제를 확실히 정리
  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  async function start() {
    setError("");
    setNotice("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const mimeType = pickRecordingMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType, audioBitsPerSecond: AUDIO_BITS_PER_SECOND } : undefined,
      );
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        setBlob(new Blob(chunksRef.current, { type }));
        setPhase("done");
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        wakeLockRef.current?.release().catch(() => {});
        wakeLockRef.current = null;
      };
      recorder.start(5000); // 5초마다 조각을 모아 긴 녹음에도 안전하게
      recorderRef.current = recorder;
      setElapsed(0);
      setPhase("recording");

      // 화면이 꺼져 녹음이 끊기지 않도록 (지원하는 브라우저에서만)
      try {
        const wakeLock = (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock;
        wakeLockRef.current = (await wakeLock?.request("screen")) ?? null;
      } catch {
        // 지원하지 않거나 거부됨 — 녹음에는 영향 없음
      }
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? "마이크 사용이 차단됐어요. 주소창의 자물쇠 아이콘에서 마이크를 허용해 주세요."
          : name === "NotFoundError"
            ? "마이크를 찾을 수 없어요. 연결 상태를 확인해 주세요."
            : "녹음을 시작하지 못했어요.",
      );
    }
  }

  function togglePause() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      setPhase("paused");
    } else if (recorder.state === "paused") {
      recorder.resume();
      setPhase("recording");
    }
  }

  function stop() {
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
  }

  async function save() {
    if (!blob) return;
    setSaving(true);
    setError("");
    const { id, error: saveError } = await saveRecording(createClient(), {
      userId,
      courseId,
      title,
      blob,
      mimeType: blob.type,
      durationSeconds: elapsed,
      source: "recording",
    });
    setSaving(false);
    if (saveError || !id) return setError(saveError ?? "저장하지 못했어요.");
    onClose();
    router.push(`/recordings/${id}`);
  }

  function handleClose() {
    if (recording && !confirm("녹음 중이에요. 정말 닫을까요? 녹음한 내용은 사라져요.")) return;
    stop();
    onClose();
  }

  const estimatedBytes = blob?.size ?? elapsed * BYTES_PER_SECOND;

  return (
    <Modal open={open} onClose={handleClose} title="강의 녹음">
      <div className="space-y-4">
        <div className="flex flex-col items-center rounded-xl bg-zinc-50 py-8">
          <span
            className={`flex h-16 w-16 items-center justify-center rounded-full ${
              phase === "recording" ? "animate-pulse bg-rose-100 text-rose-600" : "bg-zinc-200 text-zinc-500"
            }`}
          >
            <Mic size={28} />
          </span>
          <p className="mt-3 text-3xl font-bold tabular-nums">{formatDuration(elapsed)}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {phase === "idle" && "마이크를 켜고 녹음을 시작해요"}
            {phase === "recording" && `녹음 중 · 약 ${(estimatedBytes / 1024 / 1024).toFixed(1)}MB`}
            {phase === "paused" && "일시정지됨"}
            {phase === "done" && `녹음 완료 · ${(estimatedBytes / 1024 / 1024).toFixed(1)}MB`}
          </p>
        </div>

        {phase === "idle" && (
          <button type="button" className="btn btn-primary w-full py-2.5" onClick={start}>
            <Mic size={16} /> 녹음 시작
          </button>
        )}

        {recording && (
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary flex-1 py-2.5" onClick={togglePause}>
              {phase === "recording" ? (
                <>
                  <Pause size={16} /> 일시정지
                </>
              ) : (
                <>
                  <Play size={16} /> 이어서 녹음
                </>
              )}
            </button>
            <button type="button" className="btn btn-danger flex-1 py-2.5" onClick={stop}>
              <Square size={15} /> 녹음 끝내기
            </button>
          </div>
        )}

        {phase === "done" && blob && (
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="recording-title">
                제목
              </label>
              <input
                id="recording-title"
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
            </div>
            <audio controls src={URL.createObjectURL(blob)} className="w-full" />
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setBlob(null);
                  setElapsed(0);
                  setPhase("idle");
                }}
              >
                다시 녹음
              </button>
              <button type="button" className="btn btn-primary flex-1" onClick={save} disabled={saving}>
                {saving ? "저장 중..." : "저장하기"}
              </button>
            </div>
          </div>
        )}

        {notice && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{notice}</p>}
        <ErrorText>{error}</ErrorText>

        <p className="text-xs leading-5 text-zinc-400">
          녹음 중에는 이 탭을 닫지 마세요. 휴대폰은 화면이 꺼지거나 다른 앱으로 넘어가면 녹음이 멈출 수 있어요.
          한 번에 최대 약 3시간 30분(50MB)까지 녹음돼요.
        </p>
      </div>
    </Modal>
  );
}

function defaultTitle() {
  const now = new Date();
  return `${now.getMonth() + 1}월 ${now.getDate()}일 강의 녹음`;
}
