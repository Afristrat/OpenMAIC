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
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const FORMAT_VERSION: u8 = 1;
const NONCE_LENGTH: usize = 12;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct LicenseClaims {
    pub format_version: u8,
    pub package_id: String,
    pub content_sha256: String,
    pub user_id: String,
    pub tenant_id: String,
    pub device_id: String,
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
        .encrypt(Nonce::from_slice(&nonce), aes_gcm::aead::Payload {
            msg: content,
            aad: &encoded_license(&license)?,
        })
        .map_err(|_| PackageError::EncryptionFailed)?;

    Ok(EncryptedPackage {
        license,
        nonce: URL_SAFE_NO_PAD.encode(nonce),
        ciphertext: URL_SAFE_NO_PAD.encode(ciphertext),
    })
}

pub fn open_package(
    verifying_key: &VerifyingKey,
    content_key: &[u8; 32],
    package: &EncryptedPackage,
    context: AccessContext<'_>,
) -> Result<Vec<u8>, PackageError> {
    let claims = &package.license.claims;
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
        .decode(&package.license.signature)
        .map_err(|_| PackageError::InvalidEncoding)?;
    let signature = Signature::from_slice(&signature).map_err(|_| PackageError::InvalidSignature)?;
    verifying_key
        .verify(&encoded_claims(claims)?, &signature)
        .map_err(|_| PackageError::InvalidSignature)?;

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

#[cfg(test)]
mod tests {
    use super::*;

    fn claims(content: &[u8]) -> LicenseClaims {
        LicenseClaims {
            format_version: FORMAT_VERSION,
            package_id: "package-1".to_owned(),
            content_sha256: sha256_hex(content),
            user_id: "user-1".to_owned(),
            tenant_id: "tenant-1".to_owned(),
            device_id: "device-1".to_owned(),
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
            open_package(&signing_key.verifying_key(), &content_key, &package, context()).unwrap(),
            content
        );
    }

    #[test]
    fn refuses_tampering_expiry_revocation_and_wrong_context() {
        let signing_key = SigningKey::generate(&mut OsRng);
        let content_key = [8_u8; 32];
        let content = b"contenu local Qalem";

        let mut tampered = seal_package(&signing_key, &content_key, claims(content), content).unwrap();
        tampered.license.claims.tenant_id = "tenant-2".to_owned();
        assert_eq!(
            open_package(&signing_key.verifying_key(), &content_key, &tampered, context()),
            Err(PackageError::ContextMismatch)
        );

        let mut expired_claims = claims(content);
        expired_claims.expires_at = context().now;
        let expired = seal_package(&signing_key, &content_key, expired_claims, content).unwrap();
        assert_eq!(
            open_package(&signing_key.verifying_key(), &content_key, &expired, context()),
            Err(PackageError::Expired)
        );

        let mut revoked_claims = claims(content);
        revoked_claims.revoked = true;
        let revoked = seal_package(&signing_key, &content_key, revoked_claims, content).unwrap();
        assert_eq!(
            open_package(&signing_key.verifying_key(), &content_key, &revoked, context()),
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
        let mut package = seal_package(&signing_key, &content_key, claims(content), content).unwrap();
        package.ciphertext.push('A');

        assert_eq!(
            open_package(&signing_key.verifying_key(), &content_key, &package, context()),
            Err(PackageError::DecryptionFailed)
        );
    }
}
