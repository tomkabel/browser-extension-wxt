import { Dimensions, Platform } from 'react-native';
import type { Coordinate } from '../types';

interface DeviceProfile {
  model: string;
  modelAliases: string[];
  screenWidth: number;
  screenHeight: number;
  dpi: number;
  pinGrid: {
    digit: number;
    x: number;
    y: number;
  }[];
}

const DEVICE_PROFILES: DeviceProfile[] = [
  {
    model: 'Samsung Galaxy S23',
    modelAliases: ['SM-S911', 'SM-S916', 'SM-S918', 'SM-S901', 'SM-S906', 'SM-S908', 'Galaxy S23'],
    screenWidth: 1080,
    screenHeight: 2340,
    dpi: 425,
    pinGrid: [
      { digit: 1, x: 180, y: 980 },
      { digit: 2, x: 540, y: 980 },
      { digit: 3, x: 900, y: 980 },
      { digit: 4, x: 180, y: 1180 },
      { digit: 5, x: 540, y: 1180 },
      { digit: 6, x: 900, y: 1180 },
      { digit: 7, x: 180, y: 1380 },
      { digit: 8, x: 540, y: 1380 },
      { digit: 9, x: 900, y: 1380 },
      { digit: 0, x: 540, y: 1580 },
    ],
  },
  {
    model: 'Samsung Galaxy S23 FE',
    modelAliases: ['SM-S711'],
    screenWidth: 1080,
    screenHeight: 2340,
    dpi: 403,
    pinGrid: [
      { digit: 1, x: 180, y: 980 },
      { digit: 2, x: 540, y: 980 },
      { digit: 3, x: 900, y: 980 },
      { digit: 4, x: 180, y: 1180 },
      { digit: 5, x: 540, y: 1180 },
      { digit: 6, x: 900, y: 1180 },
      { digit: 7, x: 180, y: 1380 },
      { digit: 8, x: 540, y: 1380 },
      { digit: 9, x: 900, y: 1380 },
      { digit: 0, x: 540, y: 1580 },
    ],
  },
  {
    model: 'Pixel 8',
    modelAliases: ['Pixel 8', 'shiba'],
    screenWidth: 1080,
    screenHeight: 2400,
    dpi: 420,
    pinGrid: [
      { digit: 1, x: 180, y: 1020 },
      { digit: 2, x: 540, y: 1020 },
      { digit: 3, x: 900, y: 1020 },
      { digit: 4, x: 180, y: 1220 },
      { digit: 5, x: 540, y: 1220 },
      { digit: 6, x: 900, y: 1220 },
      { digit: 7, x: 180, y: 1420 },
      { digit: 8, x: 540, y: 1420 },
      { digit: 9, x: 900, y: 1420 },
      { digit: 0, x: 540, y: 1620 },
    ],
  },
  {
    model: 'Pixel 8 Pro',
    modelAliases: ['Pixel 8 Pro', 'husky'],
    screenWidth: 1344,
    screenHeight: 2992,
    dpi: 489,
    pinGrid: [
      { digit: 1, x: 224, y: 1260 },
      { digit: 2, x: 672, y: 1260 },
      { digit: 3, x: 1120, y: 1260 },
      { digit: 4, x: 224, y: 1500 },
      { digit: 5, x: 672, y: 1500 },
      { digit: 6, x: 1120, y: 1500 },
      { digit: 7, x: 224, y: 1740 },
      { digit: 8, x: 672, y: 1740 },
      { digit: 9, x: 1120, y: 1740 },
      { digit: 0, x: 672, y: 1980 },
    ],
  },
  {
    model: 'Pixel 8a',
    modelAliases: ['Pixel 8a', 'akita'],
    screenWidth: 1080,
    screenHeight: 2400,
    dpi: 420,
    pinGrid: [
      { digit: 1, x: 180, y: 1020 },
      { digit: 2, x: 540, y: 1020 },
      { digit: 3, x: 900, y: 1020 },
      { digit: 4, x: 180, y: 1220 },
      { digit: 5, x: 540, y: 1220 },
      { digit: 6, x: 900, y: 1220 },
      { digit: 7, x: 180, y: 1420 },
      { digit: 8, x: 540, y: 1420 },
      { digit: 9, x: 900, y: 1420 },
      { digit: 0, x: 540, y: 1620 },
    ],
  },
  {
    model: 'Pixel 7',
    modelAliases: ['Pixel 7', 'panther'],
    screenWidth: 1080,
    screenHeight: 2400,
    dpi: 420,
    pinGrid: [
      { digit: 1, x: 180, y: 1020 },
      { digit: 2, x: 540, y: 1020 },
      { digit: 3, x: 900, y: 1020 },
      { digit: 4, x: 180, y: 1220 },
      { digit: 5, x: 540, y: 1220 },
      { digit: 6, x: 900, y: 1220 },
      { digit: 7, x: 180, y: 1420 },
      { digit: 8, x: 540, y: 1420 },
      { digit: 9, x: 900, y: 1420 },
      { digit: 0, x: 540, y: 1620 },
    ],
  },
  {
    model: 'Pixel 7 Pro',
    modelAliases: ['Pixel 7 Pro', 'cheetah'],
    screenWidth: 1440,
    screenHeight: 3120,
    dpi: 512,
    pinGrid: [
      { digit: 1, x: 240, y: 1320 },
      { digit: 2, x: 720, y: 1320 },
      { digit: 3, x: 1200, y: 1320 },
      { digit: 4, x: 240, y: 1580 },
      { digit: 5, x: 720, y: 1580 },
      { digit: 6, x: 1200, y: 1580 },
      { digit: 7, x: 240, y: 1840 },
      { digit: 8, x: 720, y: 1840 },
      { digit: 9, x: 1200, y: 1840 },
      { digit: 0, x: 720, y: 2100 },
    ],
  },
  {
    model: 'Samsung Galaxy S24',
    modelAliases: ['SM-S921', 'SM-S926', 'SM-S928', 'Galaxy S24'],
    screenWidth: 1080,
    screenHeight: 2340,
    dpi: 425,
    pinGrid: [
      { digit: 1, x: 180, y: 980 },
      { digit: 2, x: 540, y: 980 },
      { digit: 3, x: 900, y: 980 },
      { digit: 4, x: 180, y: 1180 },
      { digit: 5, x: 540, y: 1180 },
      { digit: 6, x: 900, y: 1180 },
      { digit: 7, x: 180, y: 1380 },
      { digit: 8, x: 540, y: 1380 },
      { digit: 9, x: 900, y: 1380 },
      { digit: 0, x: 540, y: 1580 },
    ],
  },
  {
    model: 'OnePlus 12',
    modelAliases: ['CPH2573', 'CPH2583', 'OnePlus 12'],
    screenWidth: 1440,
    screenHeight: 3168,
    dpi: 510,
    pinGrid: [
      { digit: 1, x: 240, y: 1320 },
      { digit: 2, x: 720, y: 1320 },
      { digit: 3, x: 1200, y: 1320 },
      { digit: 4, x: 240, y: 1580 },
      { digit: 5, x: 720, y: 1580 },
      { digit: 6, x: 1200, y: 1580 },
      { digit: 7, x: 240, y: 1840 },
      { digit: 8, x: 720, y: 1840 },
      { digit: 9, x: 1200, y: 1840 },
      { digit: 0, x: 720, y: 2100 },
    ],
  },
  {
    model: 'Xiaomi 14',
    modelAliases: ['23127PN0CC', '23127PN0CG', 'Xiaomi 14'],
    screenWidth: 1200,
    screenHeight: 2670,
    dpi: 460,
    pinGrid: [
      { digit: 1, x: 200, y: 1110 },
      { digit: 2, x: 600, y: 1110 },
      { digit: 3, x: 1000, y: 1110 },
      { digit: 4, x: 200, y: 1330 },
      { digit: 5, x: 600, y: 1330 },
      { digit: 6, x: 1000, y: 1330 },
      { digit: 7, x: 200, y: 1550 },
      { digit: 8, x: 600, y: 1550 },
      { digit: 9, x: 1000, y: 1550 },
      { digit: 0, x: 600, y: 1770 },
    ],
  },
];

// Smart-ID PIN grid is 3 columns × 3 rows + 0 centered below.
// The grid occupies roughly the center 60% of screen width and starts
// ~42% from the top. Row spacing is ~8.5% of screen height.
// These ratios are derived from the calibrated profiles above.
const GRID_WIDTH_RATIO = 0.6;
const GRID_TOP_RATIO = 0.42;
const ROW_HEIGHT_RATIO = 0.085;
const COL_COUNT = 3;

function getDeviceModel(): string {
  return (Platform.constants as any)?.Model ?? 'unknown';
}

function findProfile(model: string): DeviceProfile | null {
  const modelLower = model.toLowerCase();

  for (const profile of DEVICE_PROFILES) {
    if (profile.modelAliases.some((alias) => modelLower.includes(alias.toLowerCase()))) {
      return profile;
    }
  }

  return null;
}

function findClosestProfileByDpi(dpi: number): DeviceProfile {
  let closest = DEVICE_PROFILES[0]!;
  let minDiff = Math.abs(dpi - closest.dpi);

  for (const profile of DEVICE_PROFILES) {
    const diff = Math.abs(dpi - profile.dpi);
    if (diff < minDiff) {
      minDiff = diff;
      closest = profile;
    }
  }

  return closest;
}

/**
 * Generate a fallback profile for an uncalibrated device by interpolating
 * from the closest calibrated profile by DPI. The Smart-ID PIN grid layout
 * is relatively consistent across devices (3×3 + 0), so scaling from a
 * similar-density device produces usable coordinates.
 *
 * LIMITATION: This is an approximation. For production accuracy, each device
 * model should be calibrated by measuring the actual Smart-ID app PIN button
 * positions. The fallback exists to avoid a hard failure on uncalibrated
 * devices — it will likely work but may be off by a few pixels.
 */
function generateFallbackProfile(screenWidth: number, screenHeight: number, dpi: number): DeviceProfile {
  const reference = findClosestProfileByDpi(dpi);
  const scaleX = screenWidth / reference.screenWidth;
  const scaleY = screenHeight / reference.screenHeight;

  return {
    model: `fallback(${dpi}dpi)`,
    modelAliases: [],
    screenWidth,
    screenHeight,
    dpi,
    pinGrid: reference.pinGrid.map((entry) => ({
      digit: entry.digit,
      x: Math.round(entry.x * scaleX),
      y: Math.round(entry.y * scaleY),
    })),
  };
}

function scaleCoordinates(
  profile: DeviceProfile,
  targetWidth: number,
  targetHeight: number,
): DeviceProfile {
  const scaleX = targetWidth / profile.screenWidth;
  const scaleY = targetHeight / profile.screenHeight;

  return {
    ...profile,
    screenWidth: targetWidth,
    screenHeight: targetHeight,
    pinGrid: profile.pinGrid.map((entry) => ({
      digit: entry.digit,
      x: Math.round(entry.x * scaleX),
      y: Math.round(entry.y * scaleY),
    })),
  };
}

type CalibrationSource = 'exact' | 'fallback';

let lastCalibrationSource: CalibrationSource = 'exact';

export function getPinCoordinates(pin: string): Coordinate[] | null {
  const model = getDeviceModel();
  let profile = findProfile(model);

  if (profile) {
    lastCalibrationSource = 'exact';
  } else {
    const screen = Dimensions.get('window');
    const dpi = (Platform.constants as any)?.fontScale
      ? (Platform.constants as any).fontScale * 160
      : 420;
    profile = generateFallbackProfile(screen.width, screen.height, dpi);
    lastCalibrationSource = 'fallback';
  }

  const { width, height } = Dimensions.get('window');
  const scaled = scaleCoordinates(profile, width, height);

  const coords: Coordinate[] = [];
  for (const char of pin) {
    const digit = parseInt(char, 10);
    if (isNaN(digit)) return null;

    const entry = scaled.pinGrid.find((e) => e.digit === digit);
    if (!entry) return null;

    coords.push({ x: entry.x, y: entry.y });
  }

  return coords;
}

export function isDeviceCalibrated(): boolean {
  const model = getDeviceModel();
  return findProfile(model) !== null;
}

export function getCalibrationSource(): CalibrationSource {
  return lastCalibrationSource;
}

export function getCalibratedDeviceName(): string | null {
  const model = getDeviceModel();
  const profile = findProfile(model);
  return profile?.model ?? null;
}

export function getSupportedDevices(): string[] {
  return DEVICE_PROFILES.map((p) => p.model);
}
