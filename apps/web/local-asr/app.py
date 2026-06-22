from __future__ import annotations

import asyncio
import base64
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware


PROVIDER = "local-qwen3-asr"
CLOUD_PROVIDER = "volcengine-doubao-asr"
VOLCENGINE_ASR_URL = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash"
CLOUD_MODEL = "volc.bigasr.auc_turbo"
SUPPORTED_CLOUD_AUDIO_EXTENSIONS = {".wav", ".mp3", ".ogg", ".opus"}
DEFAULT_MODEL = "Qwen/Qwen3-ASR-1.7B"
DEFAULT_FALLBACK_MODEL = "Qwen/Qwen3-ASR-0.6B"
DEFAULT_ALIGNER = "Qwen/Qwen3-ForcedAligner-0.6B"
DEFAULT_DIARIZATION_MODEL = "pyannote/speaker-diarization-community-1"
VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".avi", ".flv", ".webm", ".wmv", ".mpeg", ".mpg"}
BREAK_CHARS = set("。！？!?；;\n")
SOFT_BREAK_CHARS = set("，,、")


app = FastAPI(title="EchoScribe Local ASR", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_lock = asyncio.Lock()
_model: Any | None = None
_model_name: str | None = None
_aligner_name: str | None = None
_device: str | None = None
_diarization_pipeline: Any | None = None
_diarization_model_name: str | None = None
_diarization_device: str | None = None
_diarization_error: str | None = None
_jobs: dict[str, dict[str, Any]] = {}
_jobs_guard = threading.Lock()
_job_tasks: set[asyncio.Task[Any]] = set()


def _now() -> float:
    return time.time()


def _set_job(job_id: str, **updates: Any) -> None:
    with _jobs_guard:
        job = _jobs.get(job_id)
        if job is None:
            return
        job.update(updates)
        job["updatedAt"] = _now()


def _get_job(job_id: str) -> dict[str, Any] | None:
    with _jobs_guard:
        job = _jobs.get(job_id)
        if job is None:
            return None
        return dict(job)


def _public_job(job_id: str) -> dict[str, Any]:
    job = _get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown transcription job")
    return {
        "jobId": job["jobId"],
        "status": job["status"],
        "progress": job["progress"],
        "message": job["message"],
        "fileName": job["fileName"],
        "currentChunk": job.get("currentChunk"),
        "totalChunks": job.get("totalChunks"),
        "createdAt": job["createdAt"],
        "startedAt": job.get("startedAt"),
        "finishedAt": job.get("finishedAt"),
        "errorMessage": job.get("errorMessage"),
        "result": job.get("result"),
    }


def _create_job(filename: str) -> str:
    job_id = uuid4().hex
    with _jobs_guard:
        finished = [
            (existing_id, item.get("finishedAt", 0.0))
            for existing_id, item in _jobs.items()
            if item.get("status") in {"done", "error"} and item.get("finishedAt")
        ]
        if len(finished) > 24:
            finished.sort(key=lambda item: item[1])
            for existing_id, _ in finished[:-24]:
                _jobs.pop(existing_id, None)

        _jobs[job_id] = {
            "jobId": job_id,
            "fileName": filename,
            "status": "queued",
            "progress": 2,
            "message": "Queued locally, waiting for the transcription worker.",
            "createdAt": _now(),
            "updatedAt": _now(),
            "startedAt": None,
            "finishedAt": None,
            "currentChunk": None,
            "totalChunks": None,
            "errorMessage": None,
            "result": None,
        }
    return job_id


def _env(name: str, default: str) -> str:
    return os.getenv(name, default).strip() or default


def _env_optional(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None
    value = value.strip()
    return value or None


def _diarization_token() -> str | None:
    return (
        _env_optional("PYANNOTE_AUTH_TOKEN")
        or _env_optional("HF_TOKEN")
        or _env_optional("HUGGINGFACE_HUB_TOKEN")
    )


def _env_float(name: str, default: float, minimum: float) -> float:
    try:
        return max(minimum, float(_env(name, str(default))))
    except ValueError:
        return default


def _env_int(name: str, default: int, minimum: int) -> int:
    try:
        return max(minimum, int(_env(name, str(default))))
    except ValueError:
        return default


def _segment_target_seconds() -> float:
    return _env_float("ECHOSCRIBE_SEGMENT_TARGET_SECONDS", 4.5, 1.5)


def _segment_max_seconds() -> float:
    return _env_float("ECHOSCRIBE_SEGMENT_MAX_SECONDS", 6.5, 2.0)


def _segment_max_chars() -> int:
    return _env_int("ECHOSCRIBE_SEGMENT_MAX_CHARS", 28, 10)


def _segment_silence_seconds() -> float:
    return _env_float("ECHOSCRIBE_SEGMENT_SILENCE_SECONDS", 0.8, 0.2)


def _safe_name(filename: str) -> str:
    name = Path(filename).name
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name) or "media"


def _get_attr(value: Any, *names: str, default: Any = None) -> Any:
    for name in names:
        if isinstance(value, dict) and name in value:
            return value[name]
        if hasattr(value, name):
            return getattr(value, name)
    return default


def _clean_text(text: Any) -> str:
    value = str(text or "")
    value = re.sub(r"<\|[^|]+?\|>", "", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def _to_seconds(value: Any) -> float:
    try:
        seconds = float(value)
    except (TypeError, ValueError):
        return 0.0
    if seconds > 1000:
        return seconds / 1000
    return seconds


def _gpu_info() -> dict[str, Any]:
    try:
        output = subprocess.check_output(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total,memory.used,driver_version",
                "--format=csv,noheader,nounits",
            ],
            text=True,
            stderr=subprocess.STDOUT,
            timeout=5,
        ).strip()
        if not output:
            return {"available": False}
        name, memory_total, memory_used, driver = [part.strip() for part in output.splitlines()[0].split(",")]
        return {
            "available": True,
            "name": name,
            "memoryTotalMiB": int(memory_total),
            "memoryUsedMiB": int(memory_used),
            "driverVersion": driver,
        }
    except Exception as exc:
        return {"available": False, "error": str(exc)}


def _duration_seconds(path: Path) -> float:
    try:
        output = subprocess.check_output(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            text=True,
            stderr=subprocess.STDOUT,
            timeout=30,
        ).strip()
        return max(0.0, float(output))
    except Exception:
        return 0.0


def _extract_audio_if_needed(path: Path, workdir: Path) -> Path:
    if path.suffix.lower() not in VIDEO_EXTENSIONS:
        return path

    output = workdir / f"{path.stem}.wav"
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(path),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                str(output),
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=600,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail="ffmpeg is not installed in local ASR service") from exc
    except subprocess.CalledProcessError as exc:
        raise HTTPException(status_code=422, detail=f"Failed to extract audio from video: {exc.stderr[-500:]}") from exc
    return output


def _transcode_audio_for_cloud(path: Path, workdir: Path) -> Path:
    if path.suffix.lower() in SUPPORTED_CLOUD_AUDIO_EXTENSIONS:
        return path

    output = workdir / f"{path.stem}_cloud.wav"

    ffmpeg_path = shutil.which("ffmpeg")
    if ffmpeg_path:
        try:
            subprocess.run(
                [
                    ffmpeg_path,
                    "-y",
                    "-i",
                    str(path),
                    "-ac",
                    "1",
                    "-ar",
                    "16000",
                    str(output),
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=600,
            )
            return output
        except subprocess.CalledProcessError as exc:
            raise HTTPException(status_code=422, detail=f"Failed to transcode audio for cloud transcription: {exc.stderr[-500:]}") from exc

    afconvert_path = shutil.which("afconvert")
    if afconvert_path:
        try:
            subprocess.run(
                [
                    afconvert_path,
                    "-f",
                    "WAVE",
                    "-d",
                    "LEI16@16000",
                    "-c",
                    "1",
                    str(path),
                    str(output),
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=600,
            )
            return output
        except subprocess.CalledProcessError as exc:
            raise HTTPException(status_code=422, detail=f"Failed to transcode audio for cloud transcription: {exc.stderr[-500:]}") from exc

    raise HTTPException(
        status_code=422,
        detail=(
            f"云端识别仅支持 {', '.join(sorted(SUPPORTED_CLOUD_AUDIO_EXTENSIONS))}。"
            "当前文件需要先转码，但系统中找不到 ffmpeg 或 afconvert。"
        ),
    )


def _is_oom(error: BaseException) -> bool:
    message = str(error).lower()
    return "out of memory" in message or "cuda" in message and "memory" in message


def _empty_cuda_cache() -> None:
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


def _load_model(force_fallback: bool = False, disable_aligner: bool = False) -> Any:
    global _aligner_name, _device, _model, _model_name

    import torch
    from qwen_asr import Qwen3ASRModel

    primary_model = _env("QWEN3_ASR_MODEL", DEFAULT_MODEL)
    fallback_model = _env("QWEN3_ASR_FALLBACK_MODEL", DEFAULT_FALLBACK_MODEL)
    aligner = _env("QWEN3_ALIGNER_MODEL", DEFAULT_ALIGNER)
    use_aligner = _env("QWEN3_USE_ALIGNER", "true").lower() != "false" and not disable_aligner
    model_name = fallback_model if force_fallback else primary_model
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    dtype = torch.bfloat16 if device.startswith("cuda") else torch.float32
    aligner_name = aligner if use_aligner else ""

    if _model is not None and _model_name == model_name and _aligner_name == aligner_name:
        return _model

    if _model is not None:
        del _model
        _model = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    kwargs: dict[str, Any] = {
        "dtype": dtype,
        "device_map": device,
        "max_inference_batch_size": int(_env("QWEN3_MAX_BATCH_SIZE", "8")),
        "max_new_tokens": int(_env("QWEN3_MAX_NEW_TOKENS", "2048")),
    }
    if use_aligner:
        kwargs["forced_aligner"] = aligner
        kwargs["forced_aligner_kwargs"] = {
            "dtype": dtype,
            "device_map": device,
        }

    _model = Qwen3ASRModel.from_pretrained(model_name, **kwargs)
    _model_name = model_name
    _aligner_name = aligner_name
    _device = device
    return _model


def _load_diarization_pipeline() -> Any | None:
    global _diarization_device, _diarization_error, _diarization_model_name, _diarization_pipeline

    token = _diarization_token()
    if not token:
        _diarization_error = "No Hugging Face token found for pyannote speaker diarization."
        return None

    model_name = _env("PYANNOTE_DIARIZATION_MODEL", DEFAULT_DIARIZATION_MODEL)
    device_preference = _env("PYANNOTE_DEVICE", "cuda").lower()

    if _diarization_pipeline is not None and _diarization_model_name == model_name:
        return _diarization_pipeline

    try:
        import torch
        from pyannote.audio import Pipeline

        pipeline = Pipeline.from_pretrained(model_name, token=token)
        if device_preference == "cuda" and torch.cuda.is_available():
            pipeline.to(torch.device("cuda"))
            _diarization_device = "cuda"
        else:
            _diarization_device = "cpu"

        _diarization_pipeline = pipeline
        _diarization_model_name = model_name
        _diarization_error = None
        return _diarization_pipeline
    except Exception as exc:
        _diarization_pipeline = None
        _diarization_model_name = None
        _diarization_device = None
        _diarization_error = str(exc)
        return None


def _chunk_seconds() -> float:
    try:
        return max(60.0, float(_env("QWEN3_CHUNK_SECONDS", "600")))
    except ValueError:
        return 600.0


def _default_progress_ratio() -> float:
    try:
        return min(1.5, max(0.05, float(_env("QWEN3_PROGRESS_RATIO", "0.18"))))
    except ValueError:
        return 0.18


def _estimate_chunk_seconds(chunk_duration: float, observed_ratio: float | None) -> float:
    ratio = observed_ratio if observed_ratio and observed_ratio > 0 else _default_progress_ratio()
    return max(8.0, chunk_duration * ratio)


def _start_progress_pacer(
    job_id: str,
    message: str,
    progress_start: float,
    progress_end: float,
    estimated_seconds: float,
    current_chunk: int | None,
    total_chunks: int | None,
) -> tuple[threading.Event, threading.Thread]:
    stop_event = threading.Event()

    def run() -> None:
        started = time.perf_counter()
        span = max(0.0, progress_end - progress_start)
        while not stop_event.wait(1.0):
            elapsed = time.perf_counter() - started
            ratio = min(0.94, elapsed / max(estimated_seconds, 1.0))
            progress = progress_start + span * ratio
            _set_job(
                job_id,
                status="transcribing",
                progress=int(round(progress)),
                message=message,
                currentChunk=current_chunk,
                totalChunks=total_chunks,
            )

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    return stop_event, thread


def _split_audio(media_path: Path, workdir: Path, duration: float) -> list[tuple[Path, float, float]]:
    chunk_seconds = _chunk_seconds()
    if duration <= 0 or duration <= chunk_seconds:
        return [(media_path, 0.0, duration)]

    chunk_dir = workdir / "chunks"
    chunk_dir.mkdir(parents=True, exist_ok=True)
    pattern = chunk_dir / "chunk_%04d.wav"
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(media_path),
                "-map",
                "0:a:0",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-f",
                "segment",
                "-segment_time",
                str(chunk_seconds),
                "-reset_timestamps",
                "1",
                str(pattern),
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=1800,
        )
    except subprocess.CalledProcessError as exc:
        raise HTTPException(status_code=422, detail=f"Failed to split audio for long transcription: {exc.stderr[-500:]}") from exc

    chunks = sorted(chunk_dir.glob("chunk_*.wav"))
    if not chunks:
        return [(media_path, 0.0, duration)]

    result: list[tuple[Path, float, float]] = []
    for index, chunk in enumerate(chunks):
        offset = min(index * chunk_seconds, duration)
        chunk_duration = _duration_seconds(chunk) or min(chunk_seconds, max(0.0, duration - offset))
        result.append((chunk, offset, chunk_duration))
    return result


def _offset_segments(segments: list[dict[str, Any]], offset: float, start_index: int) -> list[dict[str, Any]]:
    shifted: list[dict[str, Any]] = []
    for index, segment in enumerate(segments, start=start_index):
        item = dict(segment)
        item["id"] = f"seg_{index:04d}"
        item["start"] = round(float(item.get("start", 0)) + offset, 2)
        item["end"] = round(float(item.get("end", item["start"])) + offset, 2)
        shifted.append(item)
    return shifted


def _join_token(left: str, token: str) -> str:
    if not left:
        return token
    if not token:
        return left
    if token[0] in ".,;:!?，。！？；：、)]}":
        return left + token
    if re.search(r"[\u4e00-\u9fff]$", left) or re.match(r"^[\u4e00-\u9fff]", token):
        return left + token
    return f"{left} {token}"


def _token_from_timestamp(item: Any) -> tuple[str, float, float] | None:
    if isinstance(item, (list, tuple)):
        if len(item) >= 3 and isinstance(item[0], str):
            return _clean_text(item[0]), _to_seconds(item[1]), _to_seconds(item[2])
        if len(item) >= 2:
            return "", _to_seconds(item[0]), _to_seconds(item[1])

    text = _clean_text(_get_attr(item, "text", "word", "token", default=""))
    start = _to_seconds(_get_attr(item, "start_time", "start", "begin_time", default=0))
    end = _to_seconds(_get_attr(item, "end_time", "end", "end_time", default=start))
    if not text and start == end == 0:
        return None
    return text, start, end


def _text_measure(text: str) -> int:
    return len(re.sub(r"\s+", "", text))


def _speaker_label(index: int) -> str:
    if index < 26:
        return f"Speaker {chr(65 + index)}"
    return f"Speaker {index + 1}"


def _normalize_speaker_spans(spans: list[tuple[float, float, str]]) -> list[tuple[float, float, str]]:
    mapping: dict[str, str] = {}
    normalized: list[tuple[float, float, str]] = []
    for start, end, raw_label in sorted(spans, key=lambda item: (item[0], item[1], item[2])):
        label = raw_label.strip() or "speaker"
        if label not in mapping:
            mapping[label] = _speaker_label(len(mapping))
        normalized.append((round(start, 2), round(end, 2), mapping[label]))
    return normalized


def _extract_speaker_spans(diarization_result: Any) -> list[tuple[float, float, str]]:
    annotation = getattr(diarization_result, "speaker_diarization", diarization_result)
    spans: list[tuple[float, float, str]] = []

    if hasattr(annotation, "itertracks"):
        for turn, _, speaker in annotation.itertracks(yield_label=True):
            start = max(0.0, float(getattr(turn, "start", 0.0)))
            end = max(start, float(getattr(turn, "end", start)))
            spans.append((start, end, str(speaker)))
        return _normalize_speaker_spans(spans)

    if isinstance(annotation, list):
        for item in annotation:
            start = _to_seconds(_get_attr(item, "start", default=0))
            end = _to_seconds(_get_attr(item, "end", default=start))
            label = str(_get_attr(item, "speaker", "label", default="speaker"))
            spans.append((start, end, label))
        return _normalize_speaker_spans(spans)

    return []


def _speaker_for_interval(
    start: float,
    end: float,
    speaker_spans: list[tuple[float, float, str]] | None,
) -> str | None:
    if not speaker_spans:
        return None

    best_label: str | None = None
    best_overlap = 0.0
    midpoint = start + max(0.0, end - start) / 2

    for span_start, span_end, label in speaker_spans:
        overlap = max(0.0, min(end, span_end) - max(start, span_start))
        if overlap > best_overlap:
            best_label = label
            best_overlap = overlap
        if best_overlap <= 0 and span_start <= midpoint <= span_end:
            best_label = label

    return best_label


def _attach_speakers_to_segments(
    segments: list[dict[str, Any]],
    speaker_spans: list[tuple[float, float, str]] | None,
) -> list[dict[str, Any]]:
    if not speaker_spans:
        return segments

    attached: list[dict[str, Any]] = []
    for segment in segments:
        item = dict(segment)
        speaker = _speaker_for_interval(float(item.get("start", 0.0)), float(item.get("end", 0.0)), speaker_spans)
        if speaker:
            item["speaker"] = speaker
        attached.append(item)
    return attached


def _run_speaker_diarization(media_path: Path) -> tuple[list[tuple[float, float, str]], list[str]]:
    token = _diarization_token()
    if not token:
        return [], []

    pipeline = _load_diarization_pipeline()
    if pipeline is None:
        detail = _diarization_error or "failed to load pyannote pipeline"
        return [], [f"Speaker diarization was skipped: {detail}"]

    try:
        diarization_result = pipeline(str(media_path))
        spans = _extract_speaker_spans(diarization_result)
        if not spans:
            return [], ["Speaker diarization returned no usable speaker turns."]
        return spans, []
    except Exception as exc:
        return [], [f"Speaker diarization was skipped: {exc}"]


def _segments_from_timestamps(
    timestamps: Any,
    full_text: str,
    duration: float,
    speaker_spans: list[tuple[float, float, str]] | None = None,
) -> list[dict[str, Any]]:
    if not timestamps:
        return []

    tokens: list[tuple[str, float, float]] = []
    for item in timestamps:
        token = _token_from_timestamp(item)
        if token is None:
            continue
        text, start, end = token
        if not text:
            continue
        tokens.append((text, max(0.0, start), max(start, end)))

    if not tokens:
        return []

    segments: list[dict[str, Any]] = []
    current = ""
    start_time = tokens[0][1]
    end_time = tokens[0][2]
    current_speaker: str | None = None
    previous_token_end = start_time
    target_seconds = _segment_target_seconds()
    max_seconds = _segment_max_seconds()
    max_chars = _segment_max_chars()
    silence_seconds = _segment_silence_seconds()

    def flush() -> None:
        nonlocal current, current_speaker, start_time, end_time
        text = _clean_text(current)
        if not text:
            return
        idx = len(segments) + 1
        segment = {
            "id": f"seg_{idx:04d}",
            "start": round(start_time, 2),
            "end": round(max(end_time, start_time + 0.2), 2),
            "raw_text": text,
            "edited_text": text,
            "status": "review",
            "important": False,
            "needsCheck": False,
        }
        if current_speaker:
            segment["speaker"] = current_speaker
        segments.append(segment)
        current = ""
        current_speaker = None

    for text, start, end in tokens:
        token_speaker = _speaker_for_interval(start, end, speaker_spans)
        if current and token_speaker and current_speaker and token_speaker != current_speaker:
            flush()

        if not current:
            start_time = start
            current_speaker = token_speaker
        elif token_speaker and not current_speaker:
            current_speaker = token_speaker
        current = _join_token(current, text)
        end_time = end
        previous_gap = max(0.0, start - previous_token_end)
        previous_token_end = end

        last_char = text[-1]
        segment_length = end_time - start_time
        compact_length = _text_measure(current)
        should_flush = False
        if previous_gap >= silence_seconds and segment_length >= 1.6:
            should_flush = True
        elif last_char in BREAK_CHARS and segment_length >= 1.2:
            should_flush = True
        elif last_char in SOFT_BREAK_CHARS and (segment_length >= target_seconds or compact_length >= int(max_chars * 0.7)):
            should_flush = True
        elif segment_length >= max_seconds or compact_length >= max_chars:
            should_flush = True

        if should_flush:
            flush()

    flush()

    if segments:
        return segments

    return _segments_from_text(full_text, duration, speaker_spans)


def _segments_from_text(
    text: str,
    duration: float,
    speaker_spans: list[tuple[float, float, str]] | None = None,
) -> list[dict[str, Any]]:
    full_text = _clean_text(text)
    if not full_text:
        return []

    parts = [part.strip() for part in re.split(r"(?<=[。！？!?；;，,、])", full_text) if part.strip()]
    if not parts:
        parts = [full_text]

    max_chars = _segment_max_chars()
    normalized_parts: list[str] = []
    for part in parts:
        if _text_measure(part) <= max_chars:
            normalized_parts.append(part)
            continue

        chunk = ""
        for char in part:
            chunk += char
            if _text_measure(chunk) >= max_chars:
                normalized_parts.append(chunk.strip())
                chunk = ""
        if chunk.strip():
            normalized_parts.append(chunk.strip())

    parts = normalized_parts or parts
    per_segment = duration / len(parts) if duration > 0 else 4
    segments = []
    cursor = 0.0
    for index, part in enumerate(parts, start=1):
        start = cursor
        end = duration if index == len(parts) and duration > 0 else cursor + max(1.5, per_segment)
        segment = {
            "id": f"seg_{index:04d}",
            "start": round(start, 2),
            "end": round(max(end, start + 0.2), 2),
            "raw_text": part,
            "edited_text": part,
            "status": "review",
            "important": False,
            "needsCheck": False,
        }
        speaker = _speaker_for_interval(start, end, speaker_spans)
        if speaker:
            segment["speaker"] = speaker
        segments.append(segment)
        cursor = end
    return segments


def _parse_result(raw_result: Any, duration: float) -> tuple[str, list[dict[str, Any]], list[str]]:
    result = raw_result[0] if isinstance(raw_result, list) and raw_result else raw_result
    full_text = _clean_text(_get_attr(result, "text", "output", default=""))
    timestamps = _get_attr(result, "time_stamps", "timestamps", "timestamp", default=None)
    warnings: list[str] = []

    segments = _segments_from_timestamps(timestamps, full_text, duration)
    if not segments:
        warnings.append("Qwen3-ASR did not return usable timestamps; generated coarse subtitle timing.")
        segments = _segments_from_text(full_text, duration)

    if not full_text:
        full_text = "".join(segment["edited_text"] for segment in segments)

    return full_text, segments, warnings


def _apply_diarization_to_result(
    result: dict[str, Any],
    media_path: Path,
    job_id: str | None = None,
    progress: int | None = None,
) -> dict[str, Any]:
    if not _diarization_token():
        return result

    if job_id is not None:
        _set_job(
            job_id,
            status="transcribing",
            progress=progress if progress is not None else 96,
            message="Running speaker diarization.",
        )

    diarization_spans, diarization_warnings = _run_speaker_diarization(media_path)
    merged = dict(result)
    merged["warnings"] = [*result.get("warnings", []), *diarization_warnings]
    if diarization_spans:
        merged["segments"] = _attach_speakers_to_segments(list(result.get("segments", [])), diarization_spans)
    return merged


def _transcribe_one_sync(
    media_path: Path,
    duration: float,
    job_id: str | None = None,
    current_chunk: int | None = None,
    total_chunks: int | None = None,
    progress_start: float = 20.0,
    progress_end: float = 92.0,
    observed_ratio: float | None = None,
) -> tuple[dict[str, Any], float]:
    language = os.getenv("QWEN3_LANGUAGE") or None
    warnings: list[str] = []
    started = time.perf_counter()
    stop_event: threading.Event | None = None
    pacer_thread: threading.Thread | None = None
    message = "Running local ASR transcription."
    if current_chunk is not None and total_chunks is not None and total_chunks > 1:
        message = f"Transcribing chunk {current_chunk}/{total_chunks}."

    try:
        if job_id is not None:
            _set_job(
                job_id,
                status="transcribing",
                progress=int(round(progress_start)),
                message=message,
                currentChunk=current_chunk,
                totalChunks=total_chunks,
            )
            stop_event, pacer_thread = _start_progress_pacer(
                job_id,
                message,
                progress_start,
                progress_end,
                _estimate_chunk_seconds(duration, observed_ratio),
                current_chunk,
                total_chunks,
            )

        model = _load_model()
        raw_result = model.transcribe(
            audio=str(media_path),
            language=language,
            return_time_stamps=True,
        )
    except Exception as exc:
        if not _is_oom(exc):
            raise
        warnings.append("Primary model ran out of GPU memory; retried with Qwen3-ASR-0.6B.")
        if job_id is not None:
            _set_job(
                job_id,
                status="transcribing",
                progress=int(round(progress_start)),
                message="Primary model hit GPU memory limits, retrying with the fallback model.",
                currentChunk=current_chunk,
                totalChunks=total_chunks,
            )
        model = _load_model(force_fallback=True)
        raw_result = model.transcribe(
            audio=str(media_path),
            language=language,
            return_time_stamps=True,
        )
    finally:
        if stop_event is not None:
            stop_event.set()
        if pacer_thread is not None:
            pacer_thread.join(timeout=0.2)

    full_text, segments, parse_warnings = _parse_result(raw_result, duration)
    warnings.extend(parse_warnings)
    if not segments:
        raise HTTPException(status_code=422, detail="No speech text was recognized from this file")
    elapsed = time.perf_counter() - started
    if job_id is not None:
        _set_job(
            job_id,
            status="transcribing",
            progress=int(round(progress_end)),
            message="Chunk finished, preparing subtitle segments." if total_chunks and total_chunks > 1 else "Preparing subtitle segments.",
            currentChunk=current_chunk,
            totalChunks=total_chunks,
        )

    return {
        "provider": PROVIDER,
        "model": _model_name or _env("QWEN3_ASR_MODEL", DEFAULT_MODEL),
        "aligner": _aligner_name or _env("QWEN3_ALIGNER_MODEL", DEFAULT_ALIGNER),
        "segments": segments,
        "fullText": full_text,
        "durationSeconds": round(duration, 2),
        "warnings": warnings,
    }, elapsed


def _transcribe_sync(media_path: Path, duration: float, workdir: Path, job_id: str | None = None) -> dict[str, Any]:
    if job_id is not None:
        _set_job(job_id, status="transcribing", progress=14, message="Inspecting media and preparing chunks.")
    chunks = _split_audio(media_path, workdir, duration)
    total_chunks = len(chunks)
    if len(chunks) == 1:
        try:
            result, _ = _transcribe_one_sync(
                chunks[0][0],
                chunks[0][2] or duration,
                job_id=job_id,
                current_chunk=1,
                total_chunks=1,
                progress_start=20,
                progress_end=94,
            )
            if job_id is not None:
                _set_job(job_id, status="transcribing", progress=96, message="Finalizing subtitle segments.")
            return _apply_diarization_to_result(result, media_path, job_id=job_id, progress=98)
        finally:
            _empty_cuda_cache()

    all_segments: list[dict[str, Any]] = []
    full_text_parts: list[str] = []
    warnings = [f"Long media split into {len(chunks)} chunks of about {int(_chunk_seconds())} seconds."]
    used_model = _model_name or _env("QWEN3_ASR_MODEL", DEFAULT_MODEL)
    used_aligner = _aligner_name or _env("QWEN3_ALIGNER_MODEL", DEFAULT_ALIGNER)
    observed_ratio: float | None = None

    if job_id is not None:
        _set_job(
            job_id,
            status="transcribing",
            progress=18,
            message=f"Split long media into {total_chunks} chunks.",
            currentChunk=0,
            totalChunks=total_chunks,
        )

    for chunk_index, (chunk_path, offset, chunk_duration) in enumerate(chunks, start=1):
        progress_start = 20 + ((chunk_index - 1) / total_chunks) * 70
        progress_end = 20 + (chunk_index / total_chunks) * 70
        try:
            chunk_result, elapsed = _transcribe_one_sync(
                chunk_path,
                chunk_duration,
                job_id=job_id,
                current_chunk=chunk_index,
                total_chunks=total_chunks,
                progress_start=progress_start,
                progress_end=progress_end,
                observed_ratio=observed_ratio,
            )
        finally:
            _empty_cuda_cache()

        if chunk_duration > 0 and elapsed > 0:
            latest_ratio = elapsed / chunk_duration
            observed_ratio = latest_ratio if observed_ratio is None else (observed_ratio * 0.6 + latest_ratio * 0.4)

        used_model = chunk_result["model"]
        used_aligner = chunk_result["aligner"]
        chunk_segments = chunk_result["segments"]
        if chunk_segments:
            last_end = max(float(segment["end"]) for segment in chunk_segments)
            if chunk_duration > 0 and last_end < chunk_duration - 30:
                warnings.append(
                    f"Chunk {chunk_index} ended at {last_end:.2f}s of {chunk_duration:.2f}s; audio may contain silence or the model may have stopped early."
                )
        all_segments.extend(_offset_segments(chunk_segments, offset, len(all_segments) + 1))
        full_text_parts.append(chunk_result.get("fullText", ""))
        warnings.extend(chunk_result.get("warnings", []))

    if not all_segments:
        raise HTTPException(status_code=422, detail="No speech text was recognized from this file")

    if job_id is not None:
        _set_job(
            job_id,
            status="transcribing",
            progress=97,
            message="Merging chunk subtitles into the final timeline.",
            currentChunk=total_chunks,
            totalChunks=total_chunks,
        )

    merged_result = {
        "provider": PROVIDER,
        "model": used_model,
        "aligner": used_aligner,
        "segments": all_segments,
        "fullText": "".join(full_text_parts),
        "durationSeconds": round(duration, 2),
        "warnings": warnings,
    }
    return _apply_diarization_to_result(merged_result, media_path, job_id=job_id, progress=98)


async def _run_transcription_job(job_id: str, input_path: Path, workdir: Path) -> None:
    try:
        async with _lock:
            _set_job(
                job_id,
                status="transcribing",
                progress=6,
                message="Preparing media for local transcription.",
                startedAt=_now(),
            )

            if input_path.suffix.lower() in VIDEO_EXTENSIONS:
                _set_job(job_id, status="transcribing", progress=10, message="Extracting audio from the video file.")

            media_path = _extract_audio_if_needed(input_path, workdir)
            _set_job(job_id, status="transcribing", progress=12, message="Reading media duration.")
            duration = _duration_seconds(media_path) or _duration_seconds(input_path)
            result = await asyncio.to_thread(_transcribe_sync, media_path, duration, workdir, job_id)
            _set_job(
                job_id,
                status="done",
                progress=100,
                message="Transcription ready for review.",
                finishedAt=_now(),
                currentChunk=None,
                totalChunks=None,
                errorMessage=None,
                result=result,
            )
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        _set_job(
            job_id,
            status="error",
            progress=0,
            message="Transcription failed.",
            finishedAt=_now(),
            errorMessage=detail,
        )
    except Exception as exc:
        message = str(exc)
        if _is_oom(exc):
            message = "Local ASR ran out of GPU memory. Close other GPU apps or use the 0.6B fallback model."
        _set_job(
            job_id,
            status="error",
            progress=0,
            message="Transcription failed.",
            finishedAt=_now(),
            errorMessage=message,
        )
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def _volcengine_api_key() -> str | None:
    return _env_optional("VOLCENGINE_SPEECH_API_KEY")


def _volcengine_app_id() -> str | None:
    return _env_optional("VOLCENGINE_SPEECH_APP_ID")


def _volcengine_access_token() -> str | None:
    return _env_optional("VOLCENGINE_SPEECH_ACCESS_TOKEN") or _env_optional("VOLCENGINE_SPEECH_ACCESS_KEY")


def _volcengine_resource_id() -> str:
    return _env("VOLCENGINE_SPEECH_RESOURCE_ID", CLOUD_MODEL)


def _cloud_segments_from_response(data: dict[str, Any], duration: float) -> tuple[list[dict[str, Any]], str]:
    """Convert Volcengine Doubao ASR response to our segment format."""
    segments: list[dict[str, Any]] = []
    result = data.get("result") or {}
    raw_segments = result.get("utterances") or []
    full_text = _clean_text(result.get("text", ""))

    if not raw_segments:
        # Fallback: build coarse segments from full text
        if full_text:
            return _segments_from_text(_clean_text(full_text), duration), _clean_text(full_text)
        return [], ""

    for index, seg in enumerate(raw_segments, start=1):
        text = _clean_text(seg.get("text", ""))
        if not text:
            continue
        start = _to_seconds(seg.get("start_time", 0))
        end = _to_seconds(seg.get("end_time", start + 2))
        segments.append({
            "id": f"seg_{index:04d}",
            "start": round(start, 2),
            "end": round(max(end, start + 0.2), 2),
            "raw_text": text,
            "edited_text": text,
            "status": "review",
            "important": False,
            "needsCheck": False,
        })

    if not segments and full_text:
        # All raw segments had empty text; fall back to coarse segmentation
        return _segments_from_text(_clean_text(full_text), duration), _clean_text(full_text)

    if not full_text:
        full_text = "".join(seg["edited_text"] for seg in segments)

    return segments, _clean_text(full_text)


def _transcribe_cloud_one_sync(audio_path: Path) -> dict[str, Any]:
    """Call Volcengine Doubao flash recognition API for a single audio file."""
    api_key = _volcengine_api_key()
    app_id = _volcengine_app_id()
    access_token = _volcengine_access_token()

    headers = {
        "X-Api-Resource-Id": _volcengine_resource_id(),
        "X-Api-Request-Id": str(uuid4()),
        "X-Api-Sequence": "-1",
    }
    if api_key:
        headers["X-Api-Key"] = api_key
    elif app_id and access_token:
        headers["X-Api-App-Key"] = app_id
        headers["X-Api-Access-Key"] = access_token
    else:
        raise HTTPException(
            status_code=400,
            detail="未配置火山引擎豆包语音鉴权信息，请在 .env 中设置 VOLCENGINE_SPEECH_API_KEY，或设置 VOLCENGINE_SPEECH_APP_ID 与 VOLCENGINE_SPEECH_ACCESS_TOKEN。",
        )

    with audio_path.open("rb") as f:
        audio_base64 = base64.b64encode(f.read()).decode("utf-8")

    payload = {
        "user": {
            "uid": "echoscribe",
        },
        "audio": {
            "data": audio_base64,
        },
        "request": {
            "model_name": "bigmodel",
        },
    }

    response = httpx.post(VOLCENGINE_ASR_URL, headers=headers, json=payload, timeout=600)

    status_code = response.headers.get("X-Api-Status-Code", "")
    message = response.headers.get("X-Api-Message", "")

    if response.status_code in {401, 403} or status_code == "40300001":
        detail = message or "鉴权失败，请检查 API Key，或检查 App ID + Access Token 是否正确。"
        raise HTTPException(status_code=401, detail=f"火山引擎豆包语音鉴权失败: {detail}")
    if response.status_code == 429:
        detail = message or "请求频率超限，请稍后重试。"
        raise HTTPException(status_code=429, detail=f"火山引擎豆包语音限流: {detail}")
    if response.status_code != 200 or (status_code and status_code != "20000000"):
        detail = ""
        try:
            body = response.json()
            detail = str(body)
        except Exception:
            detail = response.text[:500]
        if message:
            detail = f"{message} {detail}".strip()
        raise HTTPException(status_code=response.status_code or 500, detail=f"火山引擎豆包语音调用失败: {detail}")

    return response.json()


def _transcribe_cloud_sync(
    media_path: Path,
    duration: float,
    workdir: Path,
    job_id: str | None = None,
) -> dict[str, Any]:
    """Cloud transcription with chunking support for long files."""
    chunks = _split_audio(media_path, workdir, duration)
    total_chunks = len(chunks)
    all_segments: list[dict[str, Any]] = []
    full_text_parts: list[str] = []
    warnings: list[str] = []

    if total_chunks > 1 and job_id is not None:
        warnings.append(f"Long media split into {total_chunks} chunks.")
        _set_job(
            job_id,
            status="transcribing",
            progress=18,
            message=f"Split long media into {total_chunks} chunks.",
            currentChunk=0,
            totalChunks=total_chunks,
        )

    for chunk_index, (chunk_path, offset, chunk_duration) in enumerate(chunks, start=1):
        progress = int(20 + (chunk_index / total_chunks) * 70)
        if job_id is not None:
            _set_job(
                job_id,
                status="transcribing",
                progress=max(20, progress - 10),
                message=f"Transcribing chunk {chunk_index}/{total_chunks}." if total_chunks > 1 else "Calling Volcengine Doubao Speech API.",
                currentChunk=chunk_index,
                totalChunks=total_chunks,
            )

        result_data = _transcribe_cloud_one_sync(chunk_path)
        chunk_segments, chunk_text = _cloud_segments_from_response(result_data, chunk_duration)
        all_segments.extend(_offset_segments(chunk_segments, offset, len(all_segments) + 1))
        full_text_parts.append(chunk_text)

        if job_id is not None:
            _set_job(
                job_id,
                status="transcribing",
                progress=progress,
                message=f"Chunk {chunk_index}/{total_chunks} finished." if total_chunks > 1 else "Preparing subtitle segments.",
                currentChunk=chunk_index,
                totalChunks=total_chunks,
            )

    if not all_segments:
        raise HTTPException(status_code=422, detail="云端识别未返回任何文本，请检查音频是否包含语音。")

    return {
        "provider": CLOUD_PROVIDER,
        "model": CLOUD_MODEL,
        "aligner": "",
        "segments": all_segments,
        "fullText": "".join(full_text_parts),
        "durationSeconds": round(duration, 2),
        "warnings": warnings,
    }


async def _run_cloud_transcription_job(job_id: str, input_path: Path, workdir: Path) -> None:
    if not _volcengine_api_key() and not (_volcengine_app_id() and _volcengine_access_token()):
        _set_job(
            job_id,
            status="error",
            progress=0,
            message="Transcription failed.",
            finishedAt=_now(),
            errorMessage="未配置火山引擎豆包语音鉴权信息，请在 .env 中设置 VOLCENGINE_SPEECH_API_KEY，或设置 VOLCENGINE_SPEECH_APP_ID 与 VOLCENGINE_SPEECH_ACCESS_TOKEN。",
        )
        shutil.rmtree(workdir, ignore_errors=True)
        return

    try:
        _set_job(
            job_id,
            status="transcribing",
            progress=6,
            message="Preparing media for cloud transcription.",
            startedAt=_now(),
        )

        if input_path.suffix.lower() in VIDEO_EXTENSIONS:
            _set_job(job_id, status="transcribing", progress=10, message="Extracting audio from the video file.")

        media_path = _extract_audio_if_needed(input_path, workdir)
        media_path = _transcode_audio_for_cloud(media_path, workdir)
        _set_job(job_id, status="transcribing", progress=12, message="Reading media duration.")
        duration = _duration_seconds(media_path) or _duration_seconds(input_path)

        result = await asyncio.to_thread(
            _transcribe_cloud_sync, media_path, duration, workdir, job_id
        )

        _set_job(
            job_id,
            status="done",
            progress=100,
            message="Transcription ready for review.",
            finishedAt=_now(),
            currentChunk=None,
            totalChunks=None,
            errorMessage=None,
            result=result,
        )
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        _set_job(
            job_id,
            status="error",
            progress=0,
            message="Transcription failed.",
            finishedAt=_now(),
            errorMessage=detail,
        )
    except Exception as exc:
        _set_job(
            job_id,
            status="error",
            progress=0,
            message="Transcription failed.",
            finishedAt=_now(),
            errorMessage=str(exc),
        )
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


@app.post("/transcribe/cloud/jobs")
async def create_cloud_transcription_job(file: UploadFile = File(...)) -> dict[str, Any]:
    if not _volcengine_api_key() and not (_volcengine_app_id() and _volcengine_access_token()):
        raise HTTPException(
            status_code=400,
            detail="未配置火山引擎豆包语音鉴权信息，请在 .env 中设置 VOLCENGINE_SPEECH_API_KEY，或设置 VOLCENGINE_SPEECH_APP_ID 与 VOLCENGINE_SPEECH_ACCESS_TOKEN。",
        )

    suffix = Path(file.filename or "media").suffix.lower()
    workdir = Path(tempfile.mkdtemp(prefix="echoscribe-cloud-"))
    input_path = workdir / _safe_name(file.filename or f"media{suffix}")
    try:
        with input_path.open("wb") as output:
            shutil.copyfileobj(file.file, output)
    except Exception:
        shutil.rmtree(workdir, ignore_errors=True)
        raise

    job_id = _create_job(file.filename or input_path.name)
    task = asyncio.create_task(_run_cloud_transcription_job(job_id, input_path, workdir))
    _job_tasks.add(task)
    task.add_done_callback(_job_tasks.discard)
    return _public_job(job_id)


@app.get("/health")
def health() -> dict[str, Any]:
    torch_info: dict[str, Any]
    try:
        import torch

        torch_info = {
            "available": True,
            "version": torch.__version__,
            "cudaAvailable": torch.cuda.is_available(),
            "cudaDevice": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        }
    except Exception as exc:
        torch_info = {"available": False, "error": str(exc)}

    return {
        "status": "ok",
        "provider": PROVIDER,
        "loaded": _model is not None,
        "loadedModel": _model_name,
        "loadedAligner": _aligner_name,
        "device": _device,
        "defaultModel": _env("QWEN3_ASR_MODEL", DEFAULT_MODEL),
        "fallbackModel": _env("QWEN3_ASR_FALLBACK_MODEL", DEFAULT_FALLBACK_MODEL),
        "defaultAligner": _env("QWEN3_ALIGNER_MODEL", DEFAULT_ALIGNER),
        "diarization": {
            "configured": bool(_diarization_token()),
            "loaded": _diarization_pipeline is not None,
            "model": _diarization_model_name or _env("PYANNOTE_DIARIZATION_MODEL", DEFAULT_DIARIZATION_MODEL),
            "device": _diarization_device or _env("PYANNOTE_DEVICE", "cuda"),
            "lastError": _diarization_error,
        },
        "gpu": _gpu_info(),
        "torch": torch_info,
    }


@app.post("/transcribe/jobs")
async def create_transcription_job(file: UploadFile = File(...)) -> dict[str, Any]:
    suffix = Path(file.filename or "media").suffix.lower()
    workdir = Path(tempfile.mkdtemp(prefix="echoscribe-asr-"))
    input_path = workdir / _safe_name(file.filename or f"media{suffix}")
    try:
        with input_path.open("wb") as output:
            shutil.copyfileobj(file.file, output)
    except Exception:
        shutil.rmtree(workdir, ignore_errors=True)
        raise

    job_id = _create_job(file.filename or input_path.name)
    task = asyncio.create_task(_run_transcription_job(job_id, input_path, workdir))
    _job_tasks.add(task)
    task.add_done_callback(_job_tasks.discard)
    return _public_job(job_id)


@app.get("/transcribe/jobs/{job_id}")
def get_transcription_job(job_id: str) -> dict[str, Any]:
    return _public_job(job_id)


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)) -> dict[str, Any]:
    async with _lock:
        suffix = Path(file.filename or "media").suffix.lower()
        with tempfile.TemporaryDirectory(prefix="echoscribe-asr-") as tmp:
            workdir = Path(tmp)
            input_path = workdir / _safe_name(file.filename or f"media{suffix}")
            with input_path.open("wb") as output:
                shutil.copyfileobj(file.file, output)

            media_path = _extract_audio_if_needed(input_path, workdir)
            duration = _duration_seconds(media_path) or _duration_seconds(input_path)

            try:
                return await asyncio.to_thread(_transcribe_sync, media_path, duration, workdir, None)
            except HTTPException:
                raise
            except Exception as exc:
                message = str(exc)
                if _is_oom(exc):
                    message = "Local ASR ran out of GPU memory. Close other GPU apps or use the 0.6B fallback model."
                raise HTTPException(status_code=500, detail=message) from exc
