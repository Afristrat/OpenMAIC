//! Noyau sans interface de Qalem Local.
//!
//! Le client natif vérifie une licence signée avant de déchiffrer un paquet.
//! Il ne constitue pas un DRM : une copie peut toujours exister après une
//! ouverture légitime sur un appareil compromis.

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use hkdf::Hkdf;
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use x25519_dalek::{PublicKey as X25519PublicKey, StaticSecret};

const FORMAT_VERSION: u8 = 1;
const NONCE_LENGTH: usize = 12;
const KEY_ENVELOPE_VERSION: u8 = 1;
const KEY_ENVELOPE_INFO: &[u8] = b"qalem-local-key-envelope-v1";

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct LicenseClaims {
    pub format_version: u8,
    pub package_id: String,
    pub content_sha256: String,
    pub user_id: String,
    pub tenant_id: String,
    pub device_id: String,
    pub device_key_sha256: String,
    pub issued_at: i64,
    pub expires_at: i64,
    pub revoked: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SignedLicense {
    pub claims: LicenseClaims,
    pub signature: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct EncryptedPackage {
    pub license: SignedLicense,
    pub nonce: String,
    pub ciphertext: String,
}

/// Artefact opaque remis par Qalem au client local.
/// Il ne contient jamais le contenu déchiffré ni la clé de contenu en clair.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct LocalPackageArtifact {
    pub format_version: u8,
    pub package: EncryptedPackage,
    pub key_envelope: DeviceKeyEnvelope,
}

/// Clé de contenu chiffrée vers la clé X25519 d’un appareil enrôlé.
/// La clé de signature Ed25519 du serveur ne sert jamais à ce chiffrement.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct DeviceKeyEnvelope {
    pub format_version: u8,
    pub ephemeral_public_key: String,
    pub nonce: String,
    pub ciphertext: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AccessContext<'a> {
    pub user_id: &'a str,
    pub tenant_id: &'a str,
    pub device_id: &'a str,
    pub now: i64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PackageError {
    InvalidKey,
    InvalidEncoding,
    InvalidSignature,
    UnsupportedFormat,
    Expired,
    Revoked,
    ContextMismatch,
    ContentMismatch,
    DeviceKeyMismatch,
    KeyDerivationFailed,
    EncryptionFailed,
    DecryptionFailed,
}

fn encoded_claims(claims: &LicenseClaims) -> Result<Vec<u8>, PackageError> {
    serde_json::to_vec(claims).map_err(|_| PackageError::InvalidEncoding)
}

fn encoded_license(license: &SignedLicense) -> Result<Vec<u8>, PackageError> {
    serde_json::to_vec(license).map_err(|_| PackageError::InvalidEncoding)
}

fn sha256_hex(content: &[u8]) -> String {
    format!("{:x}", Sha256::digest(content))
}

fn decode_32(value: &str) -> Result<[u8; 32], PackageError> {
    let bytes = URL_SAFE_NO_PAD
        .decode(value)
        .map_err(|_| PackageError::InvalidEncoding)?;
    bytes.try_into().map_err(|_| PackageError::InvalidEncoding)
}

pub fn verifying_key_from_base64(value: &str) -> Result<VerifyingKey, PackageError> {
    VerifyingKey::from_bytes(&decode_32(value)?).map_err(|_| PackageError::InvalidKey)
}

pub fn generate_device_secret() -> StaticSecret {
    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    StaticSecret::from(bytes)
}

pub fn encode_device_secret(device_secret: &StaticSecret) -> String {
    URL_SAFE_NO_PAD.encode(device_secret.to_bytes())
}

pub fn decode_device_secret(value: &str) -> Result<StaticSecret, PackageError> {
    Ok(StaticSecret::from(decode_32(value)?))
}

pub fn device_public_key(device_secret: &StaticSecret) -> String {
    URL_SAFE_NO_PAD.encode(X25519PublicKey::from(device_secret).as_bytes())
}

fn derive_envelope_key(
    shared_secret: &[u8],
    license: &SignedLicense,
) -> Result<[u8; 32], PackageError> {
    let salt = encoded_license(license)?;
    let hkdf = Hkdf::<Sha256>::new(Some(&salt), shared_secret);
    let mut key = [0_u8; 32];
    hkdf.expand(KEY_ENVELOPE_INFO, &mut key)
        .map_err(|_| PackageError::KeyDerivationFailed)?;
    Ok(key)
}

pub fn sign_license(
    signing_key: &SigningKey,
    claims: LicenseClaims,
) -> Result<SignedLicense, PackageError> {
    let signature = signing_key.sign(&encoded_claims(&claims)?);
    Ok(SignedLicense {
        claims,
        signature: URL_SAFE_NO_PAD.encode(signature.to_bytes()),
    })
}

pub fn seal_package(
    signing_key: &SigningKey,
    content_key: &[u8; 32],
    claims: LicenseClaims,
    content: &[u8],
) -> Result<EncryptedPackage, PackageError> {
    if claims.content_sha256 != sha256_hex(content) {
        return Err(PackageError::ContentMismatch);
    }

    let license = sign_license(signing_key, claims)?;
    let cipher = Aes256Gcm::new_from_slice(content_key).map_err(|_| PackageError::InvalidKey)?;
    let mut nonce = [0_u8; NONCE_LENGTH];
    OsRng.fill_bytes(&mut nonce);
    let ciphertext = cipher
        .encrypt(
            Nonce::from_slice(&nonce),
            aes_gcm::aead::Payload {
                msg: content,
                aad: &encoded_license(&license)?,
            },
        )
        .map_err(|_| PackageError::EncryptionFailed)?;

    Ok(EncryptedPackage {
        license,
        nonce: URL_SAFE_NO_PAD.encode(nonce),
        ciphertext: URL_SAFE_NO_PAD.encode(ciphertext),
    })
}

pub fn seal_content_key_for_device(
    device_public_key: &[u8; 32],
    content_key: &[u8; 32],
    license: &SignedLicense,
) -> Result<DeviceKeyEnvelope, PackageError> {
    let mut ephemeral_secret_bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut ephemeral_secret_bytes);
    let ephemeral_secret = StaticSecret::from(ephemeral_secret_bytes);
    let ephemeral_public_key = X25519PublicKey::from(&ephemeral_secret);
    let device_public_key = X25519PublicKey::from(*device_public_key);
    let envelope_key = derive_envelope_key(
        ephemeral_secret
            .diffie_hellman(&device_public_key)
            .as_bytes(),
        license,
    )?;
    let cipher = Aes256Gcm::new_from_slice(&envelope_key).map_err(|_| PackageError::InvalidKey)?;
    let mut nonce = [0_u8; NONCE_LENGTH];
    OsRng.fill_bytes(&mut nonce);
    let ciphertext = cipher
        .encrypt(
            Nonce::from_slice(&nonce),
            aes_gcm::aead::Payload {
                msg: content_key,
                aad: &encoded_license(license)?,
            },
        )
        .map_err(|_| PackageError::EncryptionFailed)?;
    Ok(DeviceKeyEnvelope {
        format_version: KEY_ENVELOPE_VERSION,
        ephemeral_public_key: URL_SAFE_NO_PAD.encode(ephemeral_public_key.as_bytes()),
        nonce: URL_SAFE_NO_PAD.encode(nonce),
        ciphertext: URL_SAFE_NO_PAD.encode(ciphertext),
    })
}

fn validate_license(
    verifying_key: &VerifyingKey,
    license: &SignedLicense,
    context: AccessContext<'_>,
) -> Result<(), PackageError> {
    let claims = &license.claims;
    if claims.format_version != FORMAT_VERSION {
        return Err(PackageError::UnsupportedFormat);
    }
    if claims.revoked {
        return Err(PackageError::Revoked);
    }
    if claims.expires_at <= context.now {
        return Err(PackageError::Expired);
    }
    if claims.user_id != context.user_id
        || claims.tenant_id != context.tenant_id
        || claims.device_id != context.device_id
    {
        return Err(PackageError::ContextMismatch);
    }
    let signature = URL_SAFE_NO_PAD
        .decode(&license.signature)
        .map_err(|_| PackageError::InvalidEncoding)?;
    let signature =
        Signature::from_slice(&signature).map_err(|_| PackageError::InvalidSignature)?;
    verifying_key
        .verify(&encoded_claims(claims)?, &signature)
        .map_err(|_| PackageError::InvalidSignature)
}

pub fn open_content_key_for_device(
    verifying_key: &VerifyingKey,
    device_secret: &StaticSecret,
    envelope: &DeviceKeyEnvelope,
    license: &SignedLicense,
    context: AccessContext<'_>,
) -> Result<[u8; 32], PackageError> {
    validate_license(verifying_key, license, context)?;
    if envelope.format_version != KEY_ENVELOPE_VERSION {
        return Err(PackageError::UnsupportedFormat);
    }
    let device_public_key = X25519PublicKey::from(device_secret);
    if license.claims.device_key_sha256 != sha256_hex(device_public_key.as_bytes()) {
        return Err(PackageError::DeviceKeyMismatch);
    }
    let ephemeral_public_key = X25519PublicKey::from(decode_32(&envelope.ephemeral_public_key)?);
    let nonce = URL_SAFE_NO_PAD
        .decode(&envelope.nonce)
        .map_err(|_| PackageError::InvalidEncoding)?;
    if nonce.len() != NONCE_LENGTH {
        return Err(PackageError::InvalidEncoding);
    }
    let ciphertext = URL_SAFE_NO_PAD
        .decode(&envelope.ciphertext)
        .map_err(|_| PackageError::InvalidEncoding)?;
    let envelope_key = derive_envelope_key(
        device_secret
            .diffie_hellman(&ephemeral_public_key)
            .as_bytes(),
        license,
    )?;
    let cipher = Aes256Gcm::new_from_slice(&envelope_key).map_err(|_| PackageError::InvalidKey)?;
    let key = cipher
        .decrypt(
            Nonce::from_slice(&nonce),
            aes_gcm::aead::Payload {
                msg: &ciphertext,
                aad: &encoded_license(license)?,
            },
        )
        .map_err(|_| PackageError::DecryptionFailed)?;
    key.try_into().map_err(|_| PackageError::InvalidEncoding)
}

pub fn open_package(
    verifying_key: &VerifyingKey,
    content_key: &[u8; 32],
    package: &EncryptedPackage,
    context: AccessContext<'_>,
) -> Result<Vec<u8>, PackageError> {
    let claims = &package.license.claims;
    validate_license(verifying_key, &package.license, context)?;

    let nonce = URL_SAFE_NO_PAD
        .decode(&package.nonce)
        .map_err(|_| PackageError::InvalidEncoding)?;
    if nonce.len() != NONCE_LENGTH {
        return Err(PackageError::InvalidEncoding);
    }
    let ciphertext = URL_SAFE_NO_PAD
        .decode(&package.ciphertext)
        .map_err(|_| PackageError::InvalidEncoding)?;
    let cipher = Aes256Gcm::new_from_slice(content_key).map_err(|_| PackageError::InvalidKey)?;
    let content = cipher
        .decrypt(
            Nonce::from_slice(&nonce),
            aes_gcm::aead::Payload {
                msg: &ciphertext,
                aad: &encoded_license(&package.license)?,
            },
        )
        .map_err(|_| PackageError::DecryptionFailed)?;
    if claims.content_sha256 != sha256_hex(&content) {
        return Err(PackageError::ContentMismatch);
    }
    Ok(content)
}

pub fn open_artifact(
    verifying_key: &VerifyingKey,
    device_secret: &StaticSecret,
    artifact: &LocalPackageArtifact,
    context: AccessContext<'_>,
) -> Result<Vec<u8>, PackageError> {
    if artifact.format_version != FORMAT_VERSION {
        return Err(PackageError::UnsupportedFormat);
    }
    let content_key = open_content_key_for_device(
        verifying_key,
        device_secret,
        &artifact.key_envelope,
        &artifact.package.license,
        context.clone(),
    )?;
    open_package(verifying_key, &content_key, &artifact.package, context)
}

pub fn open_artifact_bytes(
    verifying_key: &VerifyingKey,
    device_secret: &StaticSecret,
    bytes: &[u8],
    context: AccessContext<'_>,
) -> Result<Vec<u8>, PackageError> {
    let artifact = serde_json::from_slice(bytes).map_err(|_| PackageError::InvalidEncoding)?;
    open_artifact(verifying_key, device_secret, &artifact, context)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn claims(content: &[u8]) -> LicenseClaims {
        let device_secret = StaticSecret::from([3_u8; 32]);
        let device_public_key = X25519PublicKey::from(&device_secret);
        LicenseClaims {
            format_version: FORMAT_VERSION,
            package_id: "package-1".to_owned(),
            content_sha256: sha256_hex(content),
            user_id: "user-1".to_owned(),
            tenant_id: "tenant-1".to_owned(),
            device_id: "device-1".to_owned(),
            device_key_sha256: sha256_hex(device_public_key.as_bytes()),
            issued_at: 1_700_000_000,
            expires_at: 1_700_086_400,
            revoked: false,
        }
    }

    fn context() -> AccessContext<'static> {
        AccessContext {
            user_id: "user-1",
            tenant_id: "tenant-1",
            device_id: "device-1",
            now: 1_700_000_001,
        }
    }

    #[test]
    fn opens_only_the_signed_package_for_its_bound_context() {
        let signing_key = SigningKey::generate(&mut OsRng);
        let content_key = [7_u8; 32];
        let content = b"contenu local Qalem";
        let package = seal_package(&signing_key, &content_key, claims(content), content).unwrap();

        assert_eq!(
            open_package(
                &signing_key.verifying_key(),
                &content_key,
                &package,
                context()
            )
            .unwrap(),
            content
        );
    }

    #[test]
    fn refuses_tampering_expiry_revocation_and_wrong_context() {
        let signing_key = SigningKey::generate(&mut OsRng);
        let content_key = [8_u8; 32];
        let content = b"contenu local Qalem";

        let mut tampered =
            seal_package(&signing_key, &content_key, claims(content), content).unwrap();
        tampered.license.claims.tenant_id = "tenant-2".to_owned();
        assert_eq!(
            open_package(
                &signing_key.verifying_key(),
                &content_key,
                &tampered,
                context()
            ),
            Err(PackageError::ContextMismatch)
        );

        let mut expired_claims = claims(content);
        expired_claims.expires_at = context().now;
        let expired = seal_package(&signing_key, &content_key, expired_claims, content).unwrap();
        assert_eq!(
            open_package(
                &signing_key.verifying_key(),
                &content_key,
                &expired,
                context()
            ),
            Err(PackageError::Expired)
        );

        let mut revoked_claims = claims(content);
        revoked_claims.revoked = true;
        let revoked = seal_package(&signing_key, &content_key, revoked_claims, content).unwrap();
        assert_eq!(
            open_package(
                &signing_key.verifying_key(),
                &content_key,
                &revoked,
                context()
            ),
            Err(PackageError::Revoked)
        );

        let package = seal_package(&signing_key, &content_key, claims(content), content).unwrap();
        let wrong_context = AccessContext {
            tenant_id: "tenant-2",
            ..context()
        };
        assert_eq!(
            open_package(
                &signing_key.verifying_key(),
                &content_key,
                &package,
                wrong_context
            ),
            Err(PackageError::ContextMismatch)
        );
    }

    #[test]
    fn refuses_an_altered_ciphertext() {
        let signing_key = SigningKey::generate(&mut OsRng);
        let content_key = [9_u8; 32];
        let content = b"contenu local Qalem";
        let mut package =
            seal_package(&signing_key, &content_key, claims(content), content).unwrap();
        package.ciphertext.push('A');

        assert_eq!(
            open_package(
                &signing_key.verifying_key(),
                &content_key,
                &package,
                context()
            ),
            Err(PackageError::DecryptionFailed)
        );
    }

    #[test]
    fn opens_a_content_key_only_for_its_enrolled_device() {
        let signing_key = SigningKey::generate(&mut OsRng);
        let device_secret = StaticSecret::from([3_u8; 32]);
        let device_public_key = X25519PublicKey::from(&device_secret);
        let content_key = [5_u8; 32];
        let content = b"contenu local Qalem";
        let package = seal_package(&signing_key, &content_key, claims(content), content).unwrap();
        let envelope = seal_content_key_for_device(
            device_public_key.as_bytes(),
            &content_key,
            &package.license,
        )
        .unwrap();

        assert_eq!(
            open_content_key_for_device(
                &signing_key.verifying_key(),
                &device_secret,
                &envelope,
                &package.license,
                context(),
            )
            .unwrap(),
            content_key
        );
    }

    #[test]
    fn refuses_a_key_envelope_for_another_device_or_an_altered_license() {
        let signing_key = SigningKey::generate(&mut OsRng);
        let device_secret = StaticSecret::from([3_u8; 32]);
        let device_public_key = X25519PublicKey::from(&device_secret);
        let other_device_secret = StaticSecret::from([4_u8; 32]);
        let content_key = [6_u8; 32];
        let content = b"contenu local Qalem";
        let package = seal_package(&signing_key, &content_key, claims(content), content).unwrap();
        let envelope = seal_content_key_for_device(
            device_public_key.as_bytes(),
            &content_key,
            &package.license,
        )
        .unwrap();

        assert_eq!(
            open_content_key_for_device(
                &signing_key.verifying_key(),
                &other_device_secret,
                &envelope,
                &package.license,
                context(),
            ),
            Err(PackageError::DeviceKeyMismatch)
        );

        let mut altered_license = package.license;
        altered_license.claims.content_sha256 = "0".repeat(64);
        assert_eq!(
            open_content_key_for_device(
                &signing_key.verifying_key(),
                &device_secret,
                &envelope,
                &altered_license,
                context(),
            ),
            Err(PackageError::InvalidSignature)
        );
    }

    #[test]
    fn opens_the_serialized_artifact_format_only_on_its_enrolled_device() {
        let signing_key = SigningKey::generate(&mut OsRng);
        let device_secret = StaticSecret::from([3_u8; 32]);
        let device_public_key = X25519PublicKey::from(&device_secret);
        let content_key = [4_u8; 32];
        let content = b"contenu local Qalem";
        let package = seal_package(&signing_key, &content_key, claims(content), content).unwrap();
        let artifact = LocalPackageArtifact {
            format_version: FORMAT_VERSION,
            key_envelope: seal_content_key_for_device(
                device_public_key.as_bytes(),
                &content_key,
                &package.license,
            )
            .unwrap(),
            package,
        };
        let serialized = serde_json::to_vec(&artifact).unwrap();

        assert_eq!(
            open_artifact_bytes(
                &signing_key.verifying_key(),
                &device_secret,
                &serialized,
                context(),
            )
            .unwrap(),
            content
        );
    }

    #[test]
    fn encodes_only_valid_device_and_signing_keys() {
        let device_secret = generate_device_secret();
        assert_eq!(
            device_public_key(
                &decode_device_secret(&encode_device_secret(&device_secret)).unwrap()
            ),
            device_public_key(&device_secret)
        );
        assert!(matches!(
            decode_device_secret("not-a-key"),
            Err(PackageError::InvalidEncoding)
        ));

        let signing_key = SigningKey::generate(&mut OsRng);
        assert_eq!(
            verifying_key_from_base64(
                &URL_SAFE_NO_PAD.encode(signing_key.verifying_key().as_bytes())
            )
            .unwrap(),
            signing_key.verifying_key()
        );
    }
}
