import { useMemo } from 'react';

interface DeviceCapability {
  isLowEnd: boolean;
  blurScale: number;
  disableNoise: boolean;
}

export function useDeviceCapability(): DeviceCapability {
  return useMemo(() => {
    const cores = navigator.hardwareConcurrency ?? 8;
    const isLowEnd = cores < 4;
    return {
      isLowEnd,
      blurScale: isLowEnd ? 0.5 : 1,
      disableNoise: isLowEnd,
    };
  }, []);
}
