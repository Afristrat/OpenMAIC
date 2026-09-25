use std::io::{self, Read};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use qalem_local_core::{
    decode_device_secret, generate_device_secret, open_artifact_bytes, validate_license_status,
    verifying_key_from_base64, AccessContext, LocalPackageArtifact, PackageError,
    SignedLicenseStatus,
};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProofInput {
    mode: ProofMode,
    artifact: String,
    device_secret: String,
    public_key: String,
    status: SignedLicenseStatus,
    now: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum ProofMode {
    Active,
    Revoked,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ActiveProof {
    opened: bool,
    content_bytes: usize,
    altered_manifest_refused: bool,
    expired_refused: bool,
    wrong_user_refused: bool,
    wrong_tenant_refused: bool,
    wrong_device_refused: bool,
    wrong_device_key_refused: bool,
    stale_status_refused: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RevokedProof {
    revoked_status_refused: bool,
}

fn read_input() -> Result<ProofInput, String> {
    let mut input = String::new();
    io::stdin()
        .read_to_string(&mut input)
        .map_err(|_| "proof input unavailable".to_owned())?;
    serde_json::from_str(input.trim_start_matches('\u{feff}'))
        .map_err(|_| "invalid proof input".to_owned())
}

fn context<'a>(
    artifact: &'a LocalPackageArtifact,
    now: i64,
    user_id: &'a str,
    tenant_id: &'a str,
    device_id: &'a str,
) -> AccessContext<'a> {
    let _ = artifact;
    AccessContext {
        user_id,
        tenant_id,
        device_id,
        now,
    }
}

fn main() -> Result<(), String> {
    let input = read_input()?;
    let artifact_bytes = URL_SAFE_NO_PAD
        .decode(&input.artifact)
        .map_err(|_| "invalid protected artifact".to_owned())?;
    let artifact: LocalPackageArtifact = serde_json::from_slice(&artifact_bytes)
        .map_err(|_| "invalid protected artifact".to_owned())?;
    let claims = &artifact.package.license.claims;
    let verifying_key = verifying_key_from_base64(&input.public_key)
        .map_err(|_| "invalid signing key".to_owned())?;
    let device_secret =
        decode_device_secret(&input.device_secret).map_err(|_| "invalid device key".to_owned())?;

    match input.mode {
        ProofMode::Revoked => {
            let result = validate_license_status(
                &verifying_key,
                &input.status,
                &artifact.package.license,
                &claims.device_id,
                input.now,
            );
            println!(
                "{}",
                serde_json::to_string(&RevokedProof {
                    revoked_status_refused: result == Err(PackageError::Revoked),
                })
                .map_err(|_| "proof output unavailable".to_owned())?
            );
        }
        ProofMode::Active => {
            validate_license_status(
                &verifying_key,
                &input.status,
                &artifact.package.license,
                &claims.device_id,
                input.now,
            )
            .map_err(|_| "active status refused".to_owned())?;
            let valid_context = context(
                &artifact,
                input.now,
                &claims.user_id,
                &claims.tenant_id,
                &claims.device_id,
            );
            let content = open_artifact_bytes(
                &verifying_key,
                &device_secret,
                &artifact_bytes,
                valid_context,
            )
            .map_err(|_| "authorized package refused".to_owned())?;

            let mut altered = artifact.clone();
            let mut ciphertext = URL_SAFE_NO_PAD
                .decode(&altered.package.ciphertext)
                .map_err(|_| "invalid ciphertext".to_owned())?;
            let first = ciphertext
                .first_mut()
                .ok_or_else(|| "empty ciphertext".to_owned())?;
            *first ^= 1;
            altered.package.ciphertext = URL_SAFE_NO_PAD.encode(ciphertext);
            let altered_bytes = serde_json::to_vec(&altered)
                .map_err(|_| "altered package unavailable".to_owned())?;

            let wrong_user = open_artifact_bytes(
                &verifying_key,
                &device_secret,
                &artifact_bytes,
                context(
                    &artifact,
                    input.now,
                    "00000000-0000-4000-8000-000000000001",
                    &claims.tenant_id,
                    &claims.device_id,
                ),
            );
            let wrong_tenant = open_artifact_bytes(
                &verifying_key,
                &device_secret,
                &artifact_bytes,
                context(
                    &artifact,
                    input.now,
                    &claims.user_id,
                    "00000000-0000-4000-8000-000000000002",
                    &claims.device_id,
                ),
            );
            let wrong_device = open_artifact_bytes(
                &verifying_key,
                &device_secret,
                &artifact_bytes,
                context(
                    &artifact,
                    input.now,
                    &claims.user_id,
                    &claims.tenant_id,
                    "00000000-0000-4000-8000-000000000003",
                ),
            );
            let other_secret = generate_device_secret();
            let wrong_key = open_artifact_bytes(
                &verifying_key,
                &other_secret,
                &artifact_bytes,
                context(
                    &artifact,
                    input.now,
                    &claims.user_id,
                    &claims.tenant_id,
                    &claims.device_id,
                ),
            );
            let expired = open_artifact_bytes(
                &verifying_key,
                &device_secret,
                &artifact_bytes,
                context(
                    &artifact,
                    claims.expires_at,
                    &claims.user_id,
                    &claims.tenant_id,
                    &claims.device_id,
                ),
            );
            let stale_status = validate_license_status(
                &verifying_key,
                &input.status,
                &artifact.package.license,
                &claims.device_id,
                input.status.claims.valid_until,
            );
            let altered_result = open_artifact_bytes(
                &verifying_key,
                &device_secret,
                &altered_bytes,
                context(
                    &artifact,
                    input.now,
                    &claims.user_id,
                    &claims.tenant_id,
                    &claims.device_id,
                ),
            );

            println!(
                "{}",
                serde_json::to_string(&ActiveProof {
                    opened: true,
                    content_bytes: content.len(),
                    altered_manifest_refused: altered_result.is_err(),
                    expired_refused: expired == Err(PackageError::Expired),
                    wrong_user_refused: wrong_user == Err(PackageError::ContextMismatch),
                    wrong_tenant_refused: wrong_tenant == Err(PackageError::ContextMismatch),
                    wrong_device_refused: wrong_device == Err(PackageError::ContextMismatch),
                    wrong_device_key_refused: wrong_key == Err(PackageError::DeviceKeyMismatch),
                    stale_status_refused: stale_status == Err(PackageError::Expired),
                })
                .map_err(|_| "proof output unavailable".to_owned())?
            );
        }
    }

    Ok(())
}
