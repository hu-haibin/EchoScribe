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
