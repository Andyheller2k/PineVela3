export type RecordedInspectionCoordinates = { lat: number; lng: number; accuracyMeters?: number };
export type CapturedInspectionCoordinates = RecordedInspectionCoordinates & { accuracyMeters: number };

/** Read saved measurements without supplying coordinates or accuracy for missing data. */
export function recordedInspectionCoordinates(value: unknown): RecordedInspectionCoordinates | null {
  if (!value || typeof value !== 'object') return null;
  const point = value as Record<string, unknown>;
  if (typeof point.lat !== 'number' || !Number.isFinite(point.lat) || Math.abs(point.lat) > 90 ||
      typeof point.lng !== 'number' || !Number.isFinite(point.lng) || Math.abs(point.lng) > 180) return null;
  const accuracy = point.accuracyMeters;
  return { lat: point.lat, lng: point.lng,
    ...(typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0 ? { accuracyMeters: accuracy } : {}) };
}

/** Only the browser's successful device measurement can populate a new capture. */
export async function captureInspectionCoordinates(): Promise<CapturedInspectionCoordinates> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw Error('This browser cannot capture location. Use a device with location access, then retry.');
  }
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(position => {
    const { latitude, longitude, accuracy } = position.coords;
    const point = recordedInspectionCoordinates({ lat: latitude, lng: longitude, accuracyMeters: accuracy });
    if (!point || point.accuracyMeters === undefined) return reject(Error('The device returned an invalid location measurement. Please retry.'));
    resolve({ ...point, accuracyMeters: point.accuracyMeters });
  }, error => {
    reject(Error(error.code === error.PERMISSION_DENIED
      ? 'Location access was denied. Allow location access in your browser settings, then retry.'
      : error.code === error.TIMEOUT
      ? 'Location capture timed out. Check your device location service, then retry.'
      : 'Your device could not determine its location. Check its location service, then retry.'));
  }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }));
}
