/** Model loading with SHA-256 integrity verification against models/manifest.json. A mismatch is a hard failure. */
import type { GateModel } from '@core/gate';

export interface ManifestEntry { sha256: string; bytes: number }
export interface Manifest { files: Record<string, ManifestEntry> }
export class ModelError extends Error {
  constructor(public code: 'MANIFEST_MISSING' | 'MODEL_MISSING' | 'HASH_MISMATCH' | 'LOAD_FAILED', message: string) { super(message); this.name = 'ModelError'; }
}
const base = (): string => import.meta.env.BASE_URL.replace(/\/$/, '');
export const hex = (buf: ArrayBuffer): string => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256(bytes: ArrayBuffer): Promise<string> { return hex(await crypto.subtle.digest('SHA-256', bytes)); }

export async function loadManifest(fetchFn: typeof fetch = fetch): Promise<Manifest> {
  const r = await fetchFn(`${base()}/models/manifest.json`, { cache: 'no-cache' });
  if (!r.ok) throw new ModelError('MANIFEST_MISSING', 'models/manifest.json not found. Run "npm run build" or "node scripts/copy-wasm.mjs".');
  return (await r.json()) as Manifest;
}

export async function fetchVerified(rel: string, manifest: Manifest, fetchFn: typeof fetch = fetch, optional = false): Promise<ArrayBuffer | null> {
  const entry = manifest.files[rel];
  if (!entry) { if (optional) return null; throw new ModelError('MODEL_MISSING', `${rel} is not installed.`); }
  const r = await fetchFn(`${base()}/${rel}`);
  if (!r.ok) throw new ModelError('MODEL_MISSING', `${rel} could not be loaded (HTTP ${r.status}).`);
  const bytes = await r.arrayBuffer();
  if (bytes.byteLength !== entry.bytes) throw new ModelError('HASH_MISMATCH', `${rel}: size ${bytes.byteLength} differs from manifest ${entry.bytes}.`);
  const got = await sha256(bytes);
  if (got !== entry.sha256) throw new ModelError('HASH_MISMATCH', `${rel}: integrity check failed (hash mismatch). The file was altered or corrupted.`);
  return bytes;
}

export interface LoadedModels {
  dentalNet: ArrayBuffer; dentalNetInt8: ArrayBuffer | null; gate: GateModel; faceTask: ArrayBuffer | null;
  versions: { dentalNet: string; gate: string; face: string };
}
export async function loadModels(fetchFn: typeof fetch = fetch): Promise<LoadedModels> {
  const manifest = await loadManifest(fetchFn);
  const net = (await fetchVerified('models/lumina_dental_net.onnx', manifest, fetchFn)) as ArrayBuffer;
  const gateBytes = (await fetchVerified('models/visibility_gate.json', manifest, fetchFn)) as ArrayBuffer;
  const face = await fetchVerified('models/face_landmarker.task', manifest, fetchFn, true);
  const int8 = await fetchVerified('models/lumina_dental_net.int8.onnx', manifest, fetchFn, true);
  const short = (rel: string) => manifest.files[rel]?.sha256.slice(0, 12) ?? 'absent';
  return { dentalNet: net, dentalNetInt8: int8, gate: JSON.parse(new TextDecoder().decode(gateBytes)) as GateModel, faceTask: face,
    versions: { dentalNet: short('models/lumina_dental_net.onnx'), gate: short('models/visibility_gate.json'), face: short('models/face_landmarker.task') } };
}
