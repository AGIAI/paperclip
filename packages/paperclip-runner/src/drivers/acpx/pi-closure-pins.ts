/**
 * Candidate closure pins from the isolated npm lock and official Node 24.21.0.
 * The non-Node graph is identical across targets, including platform resources.
 * Pi 1.0.0 dependency graphs were independently installed for all three targets.
 * Native platform execution and paid qualification remain separately required.
 * Changing any package, helper, extension or bootstrap requires regenerating all
 * three pins. Never accept a digest supplied only by an installed manifest.
 */
export const PI_DISTRIBUTION_CLOSURE_SHA256 = Object.freeze({
  "darwin-arm64": "729947513854dadc2d596a34186f7f19beaffead0fc97698d8eeac96b8479533",
  "darwin-x64": "80de2913634f83e958792ddebc17e94f6dbbe5aa9aed3cea3ff5b40f44c90a59",
  "linux-x64": "5fedea5f04f4f76d0e2ead0637b00322583d6c859f9df4f4dc8b332aca416eda",
});
