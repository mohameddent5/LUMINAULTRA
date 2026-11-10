/**
 * Cross-machine camera engine.
 *
 * The previous implementation handed `facingMode: "environment"` to the browser
 * as a *required* constraint. Any machine whose only webcam is front-facing
 * (every laptop, most USB webcams, every iMac) then throws OverconstrainedError
 * and the camera dies permanently. It also had no secure-context guard, no
 * device enumeration, and no teardown, so a second attempt could hit a camera
 * still held open by the first.
 *
 * Everything here is written to degrade instead of throw: every failure is
 * converted into a typed, human-readable reason the UI can render.
 */

export type CameraFailureCode =
  | "insecure-context"
  | "unsupported"
  | "no-device"
  | "permission-denied"
  | "device-busy"
  | "overconstrained"
  | "no-video-data"
  | "disconnected"
  | "aborted"
  | "unknown";

export interface CameraFailure {
  code: CameraFailureCode;
  title: string;
  message: string;
  /** True when retrying the same camera could plausibly succeed. */
  recoverable: boolean;
}

export interface CameraSupport {
  supported: boolean;
  failure?: CameraFailure;
}

export interface OpenedCamera {
  stream: MediaStream;
  deviceId: string | null;
  label: string;
}

const METADATA_TIMEOUT_MS = 8000;

function failure(
  code: CameraFailureCode,
  title: string,
  message: string,
  recoverable = true,
): CameraFailure {
  return { code, title, message, recoverable };
}

/**
 * Pre-flight capability check. Run this *before* mounting a video element so an
 * unsupported machine gets an explanation rather than a black rectangle.
 */
export function checkCameraSupport(): CameraSupport {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      supported: false,
      failure: failure(
        "unsupported",
        "Camera not supported",
        "This browser cannot access cameras. Use Chrome, Edge, Firefox or Safari.",
        false,
      ),
    };
  }

  // getUserMedia only exists in a secure context. https:// and localhost are
  // secure; a plain http:// origin (or a raw IP over http) silently has no API.
  if (window.isSecureContext === false) {
    return {
      supported: false,
      failure: failure(
        "insecure-context",
        "Insecure connection",
        "Browsers only allow camera access on HTTPS or localhost. Open this page over HTTPS.",
        false,
      ),
    };
  }

  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") {
    return {
      supported: false,
      failure: failure(
        "unsupported",
        "Camera not supported",
        "This browser does not expose camera access. Use a recent Chrome, Edge, Firefox or Safari.",
        false,
      ),
    };
  }

  return { supported: true };
}

/** Map any thrown value onto a typed, user-facing reason. */
export function describeCameraError(error: unknown): CameraFailure {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name?: unknown }).name)
      : "";

  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return failure(
        "permission-denied",
        "Camera permission blocked",
        "Your browser blocked camera access. Click the camera icon in the address bar, allow access, then retry.",
      );
    case "NotFoundError":
    case "DevicesNotFoundError":
      return failure(
        "no-device",
        "No camera found",
        "No camera is connected to this machine. You can still analyze a photo instead.",
      );
    case "NotReadableError":
    case "TrackStartError":
      return failure(
        "device-busy",
        "Camera is in use",
        "Another app (Zoom, Teams, OBS, another browser tab) is holding the camera. Close it and retry.",
      );
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return failure(
        "overconstrained",
        "Camera cannot meet the requested settings",
        "The camera rejected the requested resolution or facing direction. Retrying will use safe defaults.",
      );
    case "AbortError":
      return failure(
        "aborted",
        "Camera start was interrupted",
        "The camera stopped responding while starting. Retry.",
      );
    default:
      return failure(
        "unknown",
        "Camera unavailable",
        "The camera could not be started. Retry, or analyze a photo instead.",
      );
  }
}

/** Enumerate real video inputs. Never throws. */
export async function listVideoInputs(): Promise<MediaDeviceInfo[]> {
  const mediaDevices = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  if (!mediaDevices || typeof mediaDevices.enumerateDevices !== "function") return [];
  try {
    const devices = await mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === "videoinput");
  } catch {
    return [];
  }
}

/**
 * Ordered constraint chain, most specific first.
 *
 * Note every field uses `ideal`, never an exact value: an unsatisfiable ideal
 * is ignored by the browser, whereas an unsatisfiable required constraint
 * throws. The chain exists for the cases where even that is not enough.
 */
export function buildConstraintChain(options: {
  deviceId?: string | null;
  facingMode?: "user" | "environment";
}): MediaStreamConstraints[] {
  const { deviceId, facingMode } = options;
  const chain: MediaStreamConstraints[] = [];

  if (deviceId) {
    chain.push({
      audio: false,
      video: { deviceId: { ideal: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  }

  if (facingMode) {
    chain.push({
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  }

  chain.push({
    audio: false,
    video: { width: { ideal: 1280 }, height: { ideal: 720 } },
  });

  // Absolute last resort: let the browser choose anything it can open.
  chain.push({ audio: false, video: true });

  return chain;
}

/** Stop every track so the OS camera light goes off and the device is released. */
export function stopStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        /* already stopped */
      }
    });
  } catch {
    /* stream already inactive */
  }
}

/**
 * Open a camera by walking the constraint chain until one succeeds.
 * Throws a CameraFailure (not a raw DOMException) when every attempt fails.
 */
export async function openCamera(options: {
  deviceId?: string | null;
  facingMode?: "user" | "environment";
}): Promise<OpenedCamera> {
  const support = checkCameraSupport();
  if (!support.supported) throw support.failure;

  const mediaDevices = navigator.mediaDevices;
  const chain = buildConstraintChain(options);

  // If the chain fails only because of facingMode, retry without it before
  // giving up, so a front-only webcam still opens when "environment" is asked.
  let lastError: unknown = null;
  const failures: CameraFailure[] = [];

  for (const constraints of chain) {
    try {
      const stream = await mediaDevices.getUserMedia(constraints);
      const track = stream.getVideoTracks()[0];
      if (!track) {
        stopStream(stream);
        failures.push(
          failure(
            "no-video-data",
            "Camera returned no video",
            "The camera opened but provided no video track. Try another camera.",
          ),
        );
        continue;
      }
      const settings =
        typeof track.getSettings === "function" ? track.getSettings() : ({} as MediaTrackSettings);
      return {
        stream,
        deviceId: settings.deviceId ?? options.deviceId ?? null,
        label: track.label || "Camera",
      };
    } catch (error) {
      lastError = error;
      const described = describeCameraError(error);
      failures.push(described);

      // Permission denial and "no camera" will not be fixed by relaxing
      // constraints, so stop walking the chain and surface the real cause.
      if (described.code === "permission-denied" || described.code === "no-device") {
        throw described;
      }
    }
  }

  // Report the most specific failure we saw, preferring a busy/insecure device
  // over the generic "overconstrained" that the final fallback produces.
  const priority: CameraFailureCode[] = [
    "device-busy",
    "insecure-context",
    "no-device",
    "permission-denied",
    "overconstrained",
    "no-video-data",
  ];
  const best = priority
    .map((code) => failures.find((item) => item.code === code))
    .find((item): item is CameraFailure => Boolean(item));

  throw best ?? describeCameraError(lastError);
}

/**
 * Attach a stream to a <video> element and resolve only once real frames are
 * flowing. Browsers differ on autoplay policy and on when `loadedmetadata`
 * fires, so this waits explicitly and times out instead of hanging forever.
 */
export function attachStreamToVideo(
  video: HTMLVideoElement,
  stream: MediaStream,
  timeoutMs: number = METADATA_TIMEOUT_MS,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      settled = true;
      window.clearTimeout(timer);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
    };

    const finish = () => {
      if (settled) return;
      cleanup();
      resolve();
    };

    const onReady = () => {
      if (settled) return;
      // readyState >= 2 means metadata (and dimensions) are available.
      if (video.readyState >= 2) finish();
    };

    const onError = () => {
      if (settled) return;
      cleanup();
      reject(
        failure(
          "no-video-data",
          "Camera sent no picture",
          "The camera opened but produced no image. Try another camera or analyze a photo.",
        ),
      );
    };

    const timer = window.setTimeout(() => {
      if (settled) return;
      cleanup();
      reject(
        failure(
          "no-video-data",
          "Camera is slow to start",
          "The camera did not deliver a picture in time. It may be held by another app — close it and retry.",
        ),
      );
    }, timeoutMs);

    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("error", onError);

    try {
      // `muted` + `playsInline` are what make autoplay legal on iOS and Chrome.
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
    } catch {
      cleanup();
      reject(
        failure("unknown", "Camera unavailable", "This browser refused the camera stream."),
      );
      return;
    }

    const playResult = video.play();
    if (playResult && typeof playResult.then === "function") {
      playResult.then(finish).catch((error: unknown) => {
        if (settled) return;
        const name = error && typeof error === "object" && "name" in error
          ? String((error as { name?: unknown }).name)
          : "";
        if (name === "AbortError") return; // interrupted by a newer srcObject; let timeout handle it
        if (name === "NotAllowedError") {
          cleanup();
          reject(
            failure(
              "permission-denied",
              "Autoplay blocked",
              "The browser blocked camera playback. Click anywhere on the page and retry.",
            ),
          );
          return;
        }
        // Other play() rejections often resolve once metadata loads.
        onReady();
      });
    } else {
      onReady();
    }
  });
}

/** Detach and release a video element completely. */
export function detachVideo(video: HTMLVideoElement | null | undefined): void {
  if (!video) return;
  try {
    const stream = video.srcObject as MediaStream | null;
    stopStream(stream);
    video.pause();
  } catch {
    /* ignore */
  }
  try {
    video.srcObject = null;
  } catch {
    /* ignore */
  }
}

/**
 * Watch a live stream for the camera disappearing mid-session (USB unplugged,
 * lid closed, another app grabbing it). Returns an unsubscribe function.
 */
export function watchStreamEnded(stream: MediaStream, onEnded: () => void): () => void {
  const tracks = stream.getVideoTracks();
  let fired = false;
  const handler = () => {
    if (fired) return;
    fired = true;
    onEnded();
  };
  tracks.forEach((track) => {
    track.addEventListener("ended", handler);
  });
  return () => {
    tracks.forEach((track) => {
      track.removeEventListener("ended", handler);
    });
  };
}
