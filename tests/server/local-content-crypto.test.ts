import {
  createDecipheriv,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  verify,
} from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  issueLocalPackage,
  localContentVerifyingKey,
  type LocalPackageArtifact,
} from '@/lib/server/local-content-crypto';

const x25519SpkiPrefix = Buffer.from('302a300506032b656e032100', 'hex');
const envelopeInfo = Buffer.from('qalem-local-key-envelope-v1', 'utf8');

describe('local content crypto (S2-012)', () => {
  it('binds a signed encrypted package to one X25519 device without exposing its content', () => {
    const signing = generateKeyPairSync('ed25519').privateKey;
    const device = generateKeyPairSync('x25519');
    const devicePublicKey = Buffer.from(device.publicKey.export({ format: 'der', type: 'spki' }))
      .subarray(-32)
      .toString('base64url');
    const issued = issueLocalPackage(
      {
        packageId: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        tenantId: '33333333-3333-3333-3333-333333333333',
        deviceId: '44444444-4444-4444-4444-444444444444',
        devicePublicKey,
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        content: Buffer.from('contenu adulte source', 'utf8'),
      },
      signing,
      new Date('2029-01-01T00:00:00.000Z'),
    );
    const artifact = JSON.parse(issued.artifact.toString('utf8')) as LocalPackageArtifact;
    expect(artifact.package.ciphertext).not.toContain('contenu adulte source');
    expect(
      verify(
        null,
        Buffer.from(JSON.stringify(artifact.package.license.claims), 'utf8'),
        createPublicKey(signing),
        Buffer.from(artifact.package.license.signature, 'base64url'),
      ),
    ).toBe(true);
    expect(localContentVerifyingKey(signing)).toHaveLength(43);

    const envelopeKey = Buffer.from(
      hkdfSync(
        'sha256',
        diffieHellman({
          privateKey: device.privateKey,
          publicKey: createPublicKey({
            key: Buffer.concat([
              x25519SpkiPrefix,
              Buffer.from(artifact.key_envelope.ephemeral_public_key, 'base64url'),
            ]),
            format: 'der',
            type: 'spki',
          }),
        }),
        Buffer.from(JSON.stringify(artifact.package.license), 'utf8'),
        envelopeInfo,
        32,
      ),
    );
    const envelopeCiphertext = Buffer.from(artifact.key_envelope.ciphertext, 'base64url');
    const envelopeDecipher = createDecipheriv(
      'aes-256-gcm',
      envelopeKey,
      Buffer.from(artifact.key_envelope.nonce, 'base64url'),
    );
    envelopeDecipher.setAAD(Buffer.from(JSON.stringify(artifact.package.license), 'utf8'));
    envelopeDecipher.setAuthTag(envelopeCiphertext.subarray(-16));
    const contentKey = Buffer.concat([
      envelopeDecipher.update(envelopeCiphertext.subarray(0, -16)),
      envelopeDecipher.final(),
    ]);
    const packageCiphertext = Buffer.from(artifact.package.ciphertext, 'base64url');
    const packageDecipher = createDecipheriv(
      'aes-256-gcm',
      contentKey,
      Buffer.from(artifact.package.nonce, 'base64url'),
    );
    packageDecipher.setAAD(Buffer.from(JSON.stringify(artifact.package.license), 'utf8'));
    packageDecipher.setAuthTag(packageCiphertext.subarray(-16));
    expect(
      Buffer.concat([
        packageDecipher.update(packageCiphertext.subarray(0, -16)),
        packageDecipher.final(),
      ]).toString('utf8'),
    ).toBe('contenu adulte source');
  });

  it('refuses an invalid device key and a non-future licence', () => {
    const signing = generateKeyPairSync('ed25519').privateKey;
    const input = {
      packageId: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
      tenantId: '33333333-3333-3333-3333-333333333333',
      deviceId: '44444444-4444-4444-4444-444444444444',
      devicePublicKey: 'invalid',
      expiresAt: new Date('2029-01-01T00:00:00.000Z'),
      content: Buffer.from('source', 'utf8'),
    };
    expect(() => issueLocalPackage(input, signing, new Date('2029-01-01T00:00:00.000Z'))).toThrow(
      'Local package expiry must be in the future',
    );
    expect(() =>
      issueLocalPackage(
        { ...input, expiresAt: new Date('2030-01-01T00:00:00.000Z') },
        signing,
        new Date('2029-01-01T00:00:00.000Z'),
      ),
    ).toThrow('Invalid device key');
  });
});
