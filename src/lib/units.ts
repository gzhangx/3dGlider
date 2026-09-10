/**
 * Scene-to-output unit conversion factors.
 * 1 scene unit = 1 cm. Change SCENE_TO_STL_MM to switch the STL export unit.
 */

/** Millimetres per scene unit — used for STL export and UI display. */
export const SCENE_TO_MM = 10   // 1 scene unit = 1 cm = 10 mm

/** Print-bed size in millimetres (shown in the default view). */
export const PLATE_SIZE_MM = 256

/** Size of viewport plane gizmos and previews (scene units). */
export const PLANE_SIZE = PLATE_SIZE_MM / SCENE_TO_MM

/** Camera distance that fits the full plate in a perspective view. */
export function distanceToFitPlane(fovDeg = 50, padding = 1.25) {
  const fov = (fovDeg * Math.PI) / 180
  return ((PLANE_SIZE / 2) / Math.tan(fov / 2)) * padding
}

// Aliases for other common targets (unused by default):
// export const SCENE_TO_MM = 1    // if scene units were already mm
// export const SCENE_TO_MM = 25.4 // if scene units were inches
