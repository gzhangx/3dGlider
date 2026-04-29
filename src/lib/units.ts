/**
 * Scene-to-output unit conversion factors.
 * 1 scene unit = 1 cm. Change SCENE_TO_STL_MM to switch the STL export unit.
 */

/** Millimetres per scene unit — used for STL export and UI display. */
export const SCENE_TO_MM = 10   // 1 scene unit = 1 cm = 10 mm

// Aliases for other common targets (unused by default):
// export const SCENE_TO_MM = 1    // if scene units were already mm
// export const SCENE_TO_MM = 25.4 // if scene units were inches
