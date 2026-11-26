// Downloads Google's official MediaPipe face_landmarker.task, registers it in models/manifest.json (SHA-256), ready to deploy.
// Usage: node fetch-face-model.mjs && npx vercel --prod
import { writeFileSync, readFileSync } from 'node:fs'; import { createHash } from 'node:crypto';
const URL_ = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const r = await fetch(URL_); if (!r.ok) { console.error('download failed', r.status); process.exit(1); }
const buf = Buffer.from(await r.arrayBuffer()); writeFileSync('models/face_landmarker.task', buf);
const m = JSON.parse(readFileSync('models/manifest.json', 'utf8'));
m.files['models/face_landmarker.task'] = { sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.length };
writeFileSync('models/manifest.json', JSON.stringify(m, null, 1)); console.log('face model installed:', buf.length, 'bytes');
