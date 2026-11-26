# Standalone Windows launcher

From the "Lumina Smile Lab" offline bundle (Nov 25 build). Serves a built copy of the app from a folder
with Node.js, no install, nothing uploaded.

1. Build the client (`npm run build`) and copy `dist/public/*` into a folder.
2. Copy these three files next to it, run `node fetch-face-model.mjs`, then `node serve.mjs`
   (or double-click `Start-Lumina.bat` on Windows).

The old bundle also shipped the MediaPipe wasm (34 MB) and the ONNX runtime. Those are not committed
(size); the app loads them from /ort and the CDN.
