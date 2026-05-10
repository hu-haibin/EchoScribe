# 本地 Qwen3-ASR 识别服务

EchoScribe 第一版真实识别走本地服务，不需要云厂商 API Key。

## 启动

1. 打开 Docker Desktop，确认 Linux engine 已启动。
2. 启动本地 ASR：

```bash
npm run asr:up
```

3. 另开终端启动前端：

```bash
npm run dev:local
```

4. 健康检查：

```bash
curl http://127.0.0.1:8787/health
```

首次启动会下载 `Qwen/Qwen3-ASR-1.7B` 和 `Qwen/Qwen3-ForcedAligner-0.6B`，会比较慢；模型缓存保存在 `.cache/local-asr`，不会进 git。

## 行为

- 前端上传音频/视频后，任务先显示“识别中”。
- `/api/transcribe` 会代理到 `http://127.0.0.1:8787/transcribe`。
- 本地服务一次只处理一个文件，避免多文件并发打爆显存。
- 如果 1.7B 显存不足，服务会自动尝试 `Qwen/Qwen3-ASR-0.6B`。
- 长音视频会按 `QWEN3_CHUNK_SECONDS` 自动切片识别，默认 600 秒一片，再合并时间戳。
- MP4/MOV 等视频会先用 ffmpeg 抽取音频，再送给 Qwen3-ASR。
- 视频复核页会显示画面预览，也可以折叠为音频式复核。

## 已验证结果

本机环境：RTX 4070 Ti SUPER，`Qwen/Qwen3-ASR-1.7B` + `Qwen/Qwen3-ForcedAligner-0.6B`。

- 10 分钟音频：HTTP 200，用时约 86 秒，返回 33 条字幕，时间戳递增。
- 30 分钟音频：未分片时只覆盖到约 991 秒；开启 600 秒分片后覆盖到 1800 秒，返回 106 条字幕。
- 60 分钟 MP4：先抽音频再分片识别，覆盖到 3599.71 秒，返回 194 条字幕。
- 3 小时音频：18 个分片，用时约 25 分 20 秒，覆盖到 10800.04 秒，返回 645 条字幕。
- 5000 条字幕复核页虚拟滚动稳定，实测只渲染约 16 行。

结论：长音视频必须走分片识别；不要关闭 `QWEN3_CHUNK_SECONDS`。

## 常见问题

- `本地识别服务未启动`：先运行 `npm run asr:up`。
- Docker 报无法连接 daemon：先启动 Docker Desktop。
- Docker 报 GPU 不可用：检查 NVIDIA 驱动、Docker Desktop WSL2 集成和 NVIDIA Container Toolkit。
- 识别很慢：首次加载和首次下载模型最慢，后续会复用缓存。
