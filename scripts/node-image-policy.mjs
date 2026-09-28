// Accept the existing major tags and exact patch pins, with a required image variant.
// A digest, when present, must be a complete SHA-256 pin.
export function isNode24ImageTag(tag) {
  return /^24(?:\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))?-[a-z0-9][a-z0-9._-]*(?:@sha256:[a-f0-9]{64})?$/.test(tag);
}
