/** Light names in the vendored SDK's LED table: `fill_light1` is the front
 * light, `fill_light3` the rear (`fill_light2` is listed as unavailable). One
 * LedsCmd carries a list, so both switch together in a single command with a
 * single ACK. */
export const FRONT_LIGHT = 'fill_light1'
export const REAR_LIGHT = 'fill_light3'
export const ALL_LIGHTS = [FRONT_LIGHT, REAR_LIGHT]
