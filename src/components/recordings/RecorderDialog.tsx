"use client";

import { Mic, Monitor, Pause, Play, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatDuration, MAX_RECORDING_BYTES, pickRecordingMimeType, saveRecording } from "@/lib/recordings";
import { createClient } from "@/lib/supabase/client";
import { ErrorText, Modal } from "../Modal";

// 32kbps 모노 = 1분에 약 240KB → 3시간이면 약 43MB (Supabase 무료 한도 50MB 안쪽)
const AUDIO_BITS_PER_SECOND = 32000;
const BYTES_PER_SECOND = AUDIO_BITS_PER_SECOND / 8;
const AUTO_STOP_BYTES = MAX_RECORDING_BYTES - 1024 * 1024;

/** mic: 마이크 / system: 컴퓨터에서 재생되는 소리 / both: 둘 다 섞어서 */
type SourceMode = "mic" | "system" | "both";

const SOURCES: { value: SourceMode; label: string; hint: string }[] = [
  { value: "mic", label: "마이크", hint: "강의실에서 교수님 목소리를 녹음할 때 쓰세요." },
  {
    value: "system",
    label: "컴퓨터 소리",
    hint: "온라인 강의·녹화 영상 소리를 깨끗하게 녹음해요. 화면 공유 창에서 '시스템 오디오 공유'에 꼭 체크해 주세요. (영상은 저장되지 않아요)",
  },
  { value: "both", label: "둘 다", hint: "컴퓨터 소리와 마이크를 함께 녹음해요." },
];

type Props = { open: boolean; onClose: () => void; userId: string; courseId: string };

export function RecorderDialog(props: Props) {
  if (!props.open) return null;
  return <RecorderDialogInner {...props} />;
}

function RecorderDialogInner({ open, onClose, userId, courseId }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "recording" | "paused" | "done">("idle");
  const [source, setSource] = useState<SourceMode>("mic");
  const [deviceId, setDeviceId] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [title, setTitle] = useState(defaultTitle());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamsRef = useRef<MediaStream[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const recording = phase === "recording" || phase === "paused";
  const usesMic = source !== "system";
  const hasDeviceLabels = devices.some((device) => device.label);

  async function loadDevices() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((device) => device.kind === "audioinput"));
    } catch {
      // 장치 목록을 못 읽어도 기본 마이크로 녹음은 가능
    }
  }

  useEffect(() => {
    // 창이 열릴 때 한 번, 그리고 장치가 바뀔 때마다 목록을 갱신 (브라우저 API 라 렌더 중엔 읽을 수 없음)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", loadDevices);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", loadDevices);
  }, []);

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

  // 화면을 벗어나면 마이크·화면 공유와 화면 잠금 해제를 확실히 정리
  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      releaseStreams();
    };
  }, []);

  function releaseStreams() {
    streamsRef.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    streamsRef.current = [];
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }

  /** 마이크 권한을 한 번 받아 장치 이름을 볼 수 있게 한다 */
  async function requestDeviceNames() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      await loadDevices();
    } catch {
      setError("마이크 권한을 허용해야 장치 목록을 볼 수 있어요.");
    }
  }

  async function start() {
    setError("");
    setNotice("");
    const streams: MediaStream[] = [];

    try {
      let micStream: MediaStream | null = null;
      let systemStream: MediaStream | null = null;

      if (usesMic) {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        streams.push(micStream);
        loadDevices(); // 권한을 받은 뒤에는 장치 이름이 보인다
      }

      if (source !== "mic") {
        // 브라우저가 소리만 따로 받는 방법을 제공하지 않아, 화면 공유 창을 통해 소리를 받는다
        systemStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        streams.push(systemStream);
        const [systemAudio] = systemStream.getAudioTracks();
        if (!systemAudio) {
          throw new Error(
            "컴퓨터 소리가 선택되지 않았어요. 화면 공유 창에서 '시스템 오디오 공유'에 체크해 주세요.",
          );
        }
        // 사용자가 공유를 중단하면 녹음도 함께 마무리
        systemAudio.addEventListener("ended", () => stop());
      }

      streamsRef.current = streams;
      const recordStream =
        micStream && systemStream ? mixStreams(micStream, systemStream) : (systemStream ?? micStream!);

      const mimeType = pickRecordingMimeType();
      const recorder = new MediaRecorder(
        recordStream.getAudioTracks().length > 0 ? new MediaStream(recordStream.getAudioTracks()) : recordStream,
        mimeType ? { mimeType, audioBitsPerSecond: AUDIO_BITS_PER_SECOND } : undefined,
      );
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        setBlob(new Blob(chunksRef.current, { type }));
        setPhase("done");
        releaseStreams();
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
      streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
      streamsRef.current = [];
      setError(describeStartError(err));
    }
  }

  /** 마이크와 컴퓨터 소리를 하나의 트랙으로 합친다 */
  function mixStreams(micStream: MediaStream, systemStream: MediaStream) {
    const context = new AudioContext();
    audioContextRef.current = context;
    const destination = context.createMediaStreamDestination();
    for (const stream of [micStream, systemStream]) {
      if (stream.getAudioTracks().length > 0) {
        context.createMediaStreamSource(stream).connect(destination);
      }
    }
    return destination.stream;
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
  const sourceHint = SOURCES.find((s) => s.value === source)?.hint;

  return (
    <Modal open={open} onClose={handleClose} title="강의 녹음">
      <div className="space-y-4">
        {phase === "idle" && (
          <div className="space-y-3">
            <div>
              <span className="label">무엇을 녹음할까요?</span>
              <div className="flex rounded-lg bg-zinc-100 p-0.5 text-sm">
                {SOURCES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSource(option.value)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 ${
                      source === option.value ? "bg-white font-semibold shadow-sm" : "text-zinc-500"
                    }`}
                  >
                    {option.value === "system" ? <Monitor size={14} /> : <Mic size={14} />}
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs leading-5 text-zinc-500">{sourceHint}</p>
            </div>

            {usesMic && (
              <div>
                <label className="label" htmlFor="recorder-device">
                  마이크
                </label>
                <select
                  id="recorder-device"
                  className="input"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                >
                  <option value="">기본 마이크</option>
                  {devices.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `마이크 ${index + 1}`}
                    </option>
                  ))}
                </select>
                {!hasDeviceLabels && (
                  <button
                    type="button"
                    className="btn btn-ghost mt-1 px-1 text-xs"
                    onClick={requestDeviceNames}
                  >
                    장치 이름 불러오기 (마이크 권한 필요)
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col items-center rounded-xl bg-zinc-50 py-8">
          <span
            className={`flex h-16 w-16 items-center justify-center rounded-full ${
              phase === "recording" ? "animate-pulse bg-rose-100 text-rose-600" : "bg-zinc-200 text-zinc-500"
            }`}
          >
            {source === "system" ? <Monitor size={28} /> : <Mic size={28} />}
          </span>
          <p className="mt-3 text-3xl font-bold tabular-nums">{formatDuration(elapsed)}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {phase === "idle" && "준비되면 녹음을 시작하세요"}
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

function describeStartError(err: unknown) {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError") {
    return "녹음 권한이 거부됐어요. 주소창의 자물쇠 아이콘에서 마이크를 허용하거나, 화면 공유를 다시 시도해 주세요.";
  }
  if (name === "NotFoundError") return "녹음 장치를 찾을 수 없어요. 연결 상태를 확인해 주세요.";
  if (name === "NotReadableError") return "다른 프로그램이 마이크를 쓰고 있어요. 해당 프로그램을 끄고 다시 시도해 주세요.";
  if (err instanceof Error && err.message) return err.message;
  return "녹음을 시작하지 못했어요.";
}

function defaultTitle() {
  const now = new Date();
  return `${now.getMonth() + 1}월 ${now.getDate()}일 강의 녹음`;
}
