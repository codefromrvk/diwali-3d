// Shared clock — every shader and system reads the same timebase,
// so "lit at" timestamps can be compared on the GPU.
export const clock = { t: 0, dt: 0 };
