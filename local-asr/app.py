from __future__ import annotations

import asyncio
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware


PROVIDER = "local-qwen3-asr"
DEFAULT_MODEL = "Qwen/Qwen3-ASR-1.7B"
DEFAULT_FALLBACK_MODEL = "Qwen/Qwen3-ASR-0.6B"
DEFAULT_ALIGNER = "Qwen/Qwen3-ForcedAligner-0.6B"
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


def _env(name: str, default: str) -> str:
    return os.getenv(name, default).strip() or default


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


def _chunk_seconds() -> float:
    try:
        return max(60.0, float(_env("QWEN3_CHUNK_SECONDS", "600")))
    except ValueError:
        return 600.0


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


def _segments_from_timestamps(timestamps: Any, full_text: str, duration: float) -> list[dict[str, Any]]:
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

    def flush() -> None:
        nonlocal current, start_time, end_time
        text = _clean_text(current)
        if not text:
            return
        idx = len(segments) + 1
        segments.append(
            {
                "id": f"seg_{idx:04d}",
                "start": round(start_time, 2),
                "end": round(max(end_time, start_time + 0.2), 2),
                "raw_text": text,
                "edited_text": text,
                "status": "review",
                "important": False,
                "needsCheck": False,
            }
        )
        current = ""

    for text, start, end in tokens:
        if not current:
            start_time = start
        current = _join_token(current, text)
        end_time = end

        last_char = text[-1]
        segment_length = end_time - start_time
        if last_char in BREAK_CHARS or (last_char in SOFT_BREAK_CHARS and segment_length >= 8) or segment_length >= 14:
            flush()

    flush()

    if segments:
        return segments

    return _segments_from_text(full_text, duration)


def _segments_from_text(text: str, duration: float) -> list[dict[str, Any]]:
    full_text = _clean_text(text)
    if not full_text:
        return []

    parts = [part.strip() for part in re.split(r"(?<=[。！？!?；;])", full_text) if part.strip()]
    if not parts:
        parts = [full_text]

    per_segment = duration / len(parts) if duration > 0 else 4
    segments = []
    cursor = 0.0
    for index, part in enumerate(parts, start=1):
        start = cursor
        end = duration if index == len(parts) and duration > 0 else cursor + max(1.5, per_segment)
        segments.append(
            {
                "id": f"seg_{index:04d}",
                "start": round(start, 2),
                "end": round(max(end, start + 0.2), 2),
                "raw_text": part,
                "edited_text": part,
                "status": "review",
                "important": False,
                "needsCheck": False,
            }
        )
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


def _transcribe_one_sync(media_path: Path, duration: float) -> dict[str, Any]:
    language = os.getenv("QWEN3_LANGUAGE") or None
    warnings: list[str] = []

    try:
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
        model = _load_model(force_fallback=True)
        raw_result = model.transcribe(
            audio=str(media_path),
            language=language,
            return_time_stamps=True,
        )

    full_text, segments, parse_warnings = _parse_result(raw_result, duration)
    warnings.extend(parse_warnings)
    if not segments:
        raise HTTPException(status_code=422, detail="No speech text was recognized from this file")

    return {
        "provider": PROVIDER,
        "model": _model_name or _env("QWEN3_ASR_MODEL", DEFAULT_MODEL),
        "aligner": _aligner_name or _env("QWEN3_ALIGNER_MODEL", DEFAULT_ALIGNER),
        "segments": segments,
        "fullText": full_text,
        "durationSeconds": round(duration, 2),
        "warnings": warnings,
    }


def _transcribe_sync(media_path: Path, duration: float, workdir: Path) -> dict[str, Any]:
    chunks = _split_audio(media_path, workdir, duration)
    if len(chunks) == 1:
        try:
            return _transcribe_one_sync(chunks[0][0], chunks[0][2] or duration)
        finally:
            _empty_cuda_cache()

    all_segments: list[dict[str, Any]] = []
    full_text_parts: list[str] = []
    warnings = [f"Long media split into {len(chunks)} chunks of about {int(_chunk_seconds())} seconds."]
    used_model = _model_name or _env("QWEN3_ASR_MODEL", DEFAULT_MODEL)
    used_aligner = _aligner_name or _env("QWEN3_ALIGNER_MODEL", DEFAULT_ALIGNER)

    for chunk_index, (chunk_path, offset, chunk_duration) in enumerate(chunks, start=1):
        try:
            chunk_result = _transcribe_one_sync(chunk_path, chunk_duration)
        finally:
            _empty_cuda_cache()

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

    return {
        "provider": PROVIDER,
        "model": used_model,
        "aligner": used_aligner,
        "segments": all_segments,
        "fullText": "".join(full_text_parts),
        "durationSeconds": round(duration, 2),
        "warnings": warnings,
    }


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
        "gpu": _gpu_info(),
        "torch": torch_info,
    }


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
                return await asyncio.to_thread(_transcribe_sync, media_path, duration, workdir)
            except HTTPException:
                raise
            except Exception as exc:
                message = str(exc)
                if _is_oom(exc):
                    message = "Local ASR ran out of GPU memory. Close other GPU apps or use the 0.6B fallback model."
                raise HTTPException(status_code=500, detail=message) from exc
