'use client';

import { useEffect, useState } from 'react';
import {
  archFromUAString,
  labelFor,
  osFromUAString,
  type DetectedArch,
  type DetectedOs,
  type DetectedPlatform,
} from '../utils/os';

/** Shape of the (partially-supported) modern client-hints API. */
interface UaDataLike {
  platform: string;
  getHighEntropyValues: (hints: string[]) => Promise<{
    architecture?: string;
    bitness?: string;
  }>;
}

function osFromPlatformString(platform: string): DetectedOs {
  const p = platform.toLowerCase();
  if (p.includes('mac')) return 'mac';
  if (p.includes('win')) return 'windows';
  if (p.includes('linux')) return 'linux';
  return 'unknown';
}

/**
 * Detect the visitor's OS/arch client-side. Returns `null` until resolved so
 * the UI can render a neutral shell (no flash of the wrong platform).
 */
export function useOsDetect(): DetectedPlatform | null {
  const [platform, setPlatform] = useState<DetectedPlatform | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function detect(): Promise<DetectedPlatform> {
      const uaData = (
        navigator as Navigator & { userAgentData?: UaDataLike }
      ).userAgentData;

      if (uaData) {
        const os = osFromPlatformString(uaData.platform);
        let arch: DetectedArch = 'unknown';
        try {
          const he = await uaData.getHighEntropyValues(['architecture', 'bitness']);
          if (he.architecture === 'arm') arch = 'arm64';
          else if (he.architecture === 'x86' && he.bitness === '64') arch = 'x64';
        } catch {
          /* client hints unavailable — fall through to unknown arch */
        }
        return { os, arch, label: labelFor(os) };
      }

      const os = osFromUAString(navigator.userAgent);
      return { os, arch: archFromUAString(navigator.userAgent), label: labelFor(os) };
    }

    void detect().then((p) => {
      if (!cancelled) setPlatform(p);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return platform;
}
