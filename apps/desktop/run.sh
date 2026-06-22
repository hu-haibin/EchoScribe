#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ -x "../../.tools/dotnet/dotnet" ]; then
  export PATH="$(cd ../../.tools/dotnet && pwd):$PATH"
fi

echo "[1] Building desktop app..."
dotnet build --nologo

echo "[2] Launching desktop app..."
dotnet run --project EchoScribe.Desktop.csproj
