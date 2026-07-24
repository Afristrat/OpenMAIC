/**
 * Protocol bridge between Qalem's opaque 128-bit transmission identifier and
 * AudioSeal's native 16-bit message channel.
 *
 * AudioSeal gives us one unsigned 16-bit value per audio segment. The first
 * four bits identify the segment and the remaining twelve carry payload. Ten
 * segments carry 120 identifier bits; the eleventh carries the final eight
 * bits plus a four-bit integrity check. Decoding is deliberately fail-closed:
 * a missing, conflicting or corrupted segment never identifies a recipient.
 */

const WATERMARK_ID_PATTERN = /^[0-9a-f]{32}$/;
const SEGMENT_COUNT = 11;
const PAYLOAD_MASK = 0x0fff;
const FINAL_DATA_BITS = 8;

function assertWatermarkId(watermarkId: string): void {
  if (!WATERMARK_ID_PATTERN.test(watermarkId)) {
    throw new Error('L’identifiant audio doit contenir exactement 128 bits hexadécimaux');
  }
}

function checksum4(watermarkId: string): number {
  let checksum = 0;
  for (const byte of Buffer.from(watermarkId, 'hex')) checksum ^= byte;
  return checksum & 0x0f;
}

function encodePayloads(watermarkId: string): number[] {
  const bits = [...Buffer.from(watermarkId, 'hex')]
    .map((byte) => byte.toString(2).padStart(8, '0'))
    .join('');
  const payloads = Array.from({ length: SEGMENT_COUNT }, (_, index) => {
    if (index < SEGMENT_COUNT - 1) {
      return Number.parseInt(bits.slice(index * 12, index * 12 + 12), 2);
    }
    const remaining = Number.parseInt(bits.slice((SEGMENT_COUNT - 1) * 12), 2);
    return (remaining << 4) | checksum4(watermarkId);
  });
  return payloads;
}

/** Returns the exact 16-bit message to embed in each two-second segment. */
export function encodeAudioWatermarkMessages(watermarkId: string): readonly number[] {
  assertWatermarkId(watermarkId);
  return encodePayloads(watermarkId).map((payload, index) => (index << 12) | payload);
}

/**
 * Reconstructs the opaque identifier only when one valid message for every
 * segment is present. Duplicate segments are allowed only when they agree,
 * which makes repeated 22-second cycles safe to aggregate.
 */
export function decodeAudioWatermarkMessages(messages: Iterable<number>): string | null {
  const payloads = new Map<number, number>();
  for (const message of messages) {
    if (!Number.isInteger(message) || message < 0 || message > 0xffff) return null;
    const index = message >>> 12;
    const payload = message & PAYLOAD_MASK;
    if (index >= SEGMENT_COUNT) return null;
    const previous = payloads.get(index);
    if (previous !== undefined && previous !== payload) return null;
    payloads.set(index, payload);
  }

  if (payloads.size !== SEGMENT_COUNT) return null;
  const dataBits = Array.from({ length: SEGMENT_COUNT - 1 }, (_, index) =>
    payloads.get(index)?.toString(2).padStart(12, '0'),
  ).join('');
  const finalPayload = payloads.get(SEGMENT_COUNT - 1);
  if (finalPayload === undefined) return null;
  const finalBits = (finalPayload >>> 4).toString(2).padStart(FINAL_DATA_BITS, '0');
  const bits = dataBits + finalBits;
  const bytes = Array.from({ length: 16 }, (_, index) =>
    Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2),
  );
  const watermarkId = Buffer.from(bytes).toString('hex');
  return checksum4(watermarkId) === (finalPayload & 0x0f) ? watermarkId : null;
}

export const audioWatermarkProtocol = {
  segmentCount: SEGMENT_COUNT,
  segmentDurationSeconds: 2,
  cycleDurationSeconds: SEGMENT_COUNT * 2,
};
