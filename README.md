# EchoScribe

Single-repo workspace for the EchoScribe web and desktop apps.

## Structure

```text
apps/
  web/      React + Vite transcription and rough-cut workspace
  desktop/  Avalonia desktop editor
```

## Web

```bash
cd apps/web
npm install
npm run dev
```

Cloud ASR without Docker:

```bash
cd apps/web
cp .env.example .env
# fill in VOLCENGINE_SPEECH_API_KEY
# or fill in VOLCENGINE_SPEECH_APP_ID + VOLCENGINE_SPEECH_ACCESS_TOKEN
cd local-asr
./run-cloud.sh
```

Then keep the Vite dev server running in `apps/web` and choose the cloud ASR option in the UI.

Production build:

```bash
cd apps/web
npm run build
```

## Desktop

```bash
cd apps/desktop
dotnet build
```

You can also open the root solution file `EchoScribe.sln`.
