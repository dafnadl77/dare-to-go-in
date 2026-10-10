import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Is there a microphone to record with? Asked WITHOUT touching the microphone: enumerateDevices() and the permissions query never
 * open a prompt, so this is safe to run when the page loads (a permission prompt only ever follows the dreamer's own press).
 *
 *   'available'  at least one audio input is listed
 *   'none'       the browser reliably says there is no audio input (a desktop without a microphone)
 *   'unknown'    cannot tell yet — NEVER treated as "no microphone"
 *
 * An empty list is only trustworthy as "no microphone" where the browser lists devices before permission is granted (the Chromium
 * family: Chrome, Edge, ...) or once permission HAS been granted (any browser). Safari and Firefox return an empty list until the
 * dreamer grants access even when a microphone exists, so there an empty list means "not told yet", and recording stays fully
 * offered. The state follows the hardware: plugging a microphone in (the browser's `devicechange` event) updates it with no reload.
 */
export type MicAvailability = 'unknown' | 'available' | 'none';
export type MicPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

export function judgeMicAvailability(input: { inputCount: number; permission: MicPermissionState; chromium: boolean }): MicAvailability {
  if (input.inputCount > 0) return 'available';
  if (input.permission === 'granted' || input.chromium) return 'none';
  return 'unknown';
}

/** The Chromium family announces itself in userAgentData.brands (Chrome, Edge, Opera, Brave, ...). */
export function isChromiumFamily(brands: ReadonlyArray<{ brand: string }> | undefined): boolean {
  return !!brands?.some((b) => /chromium/i.test(b.brand));
}

export interface MicProbeEnv {
  enumerateDevices: (() => Promise<Array<{ kind: string }>>) | null;
  queryPermission: (() => Promise<MicPermissionState>) | null;
  chromium: boolean;
}

export async function probeMicAvailability(env: MicProbeEnv): Promise<MicAvailability> {
  if (!env.enumerateDevices) return 'unknown';
  try {
    const devices = await env.enumerateDevices();
    const inputCount = devices.filter((d) => d.kind === 'audioinput').length;
    if (inputCount > 0) return 'available';
    let permission: MicPermissionState = 'unknown';
    if (env.queryPermission) {
      try {
        permission = await env.queryPermission();
      } catch {
        permission = 'unknown';
      }
    }
    return judgeMicAvailability({ inputCount, permission, chromium: env.chromium });
  } catch {
    return 'unknown';
  }
}

function browserProbeEnv(): MicProbeEnv {
  const md = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  const brands = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { userAgentData?: { brands?: Array<{ brand: string }> } }).userAgentData?.brands;
  return {
    enumerateDevices: md?.enumerateDevices ? () => md.enumerateDevices() : null,
    queryPermission: navigator.permissions?.query
      ? async () => {
          const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          return status.state as MicPermissionState;
        }
      : null,
    chromium: isChromiumFamily(brands),
  };
}

interface MicAvailabilityApi {
  availability: MicAvailability;
  /** A press found no microphone (NotFoundError): remember it until the hardware changes. */
  markNone: () => void;
  /** A recording really started: there is a microphone. */
  markAvailable: () => void;
  /** Looks again now (the dreamer says they connected a microphone). Never opens a permission prompt. */
  recheck: () => void;
}

export function useMicAvailability(): MicAvailabilityApi {
  const [availability, setAvailability] = useState<MicAvailability>('unknown');
  const aliveRef = useRef(true);

  const recheck = useCallback(() => {
    void probeMicAvailability(browserProbeEnv()).then((result) => {
      if (aliveRef.current) setAvailability(result);
    });
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    recheck();
    const md = navigator.mediaDevices;
    md?.addEventListener?.('devicechange', recheck);
    return () => {
      aliveRef.current = false;
      md?.removeEventListener?.('devicechange', recheck);
    };
  }, [recheck]);

  const markNone = useCallback(() => setAvailability('none'), []);
  const markAvailable = useCallback(() => setAvailability('available'), []);
  return { availability, markNone, markAvailable, recheck };
}
