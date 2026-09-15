use std::{
    fs,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

use keyring::Entry;
use qalem_local_core::{
    decode_device_secret, device_public_key, encode_device_secret, generate_device_secret,
    open_artifact_bytes, validate_license_status, verifying_key_from_base64, AccessContext,
    LocalPackageArtifact, SignedLicenseStatus,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const KEYRING_SERVICE: &str = "ma.qalem.local";
const MAX_PACKAGE_BYTES: u64 = 5 * 1024 * 1024;
const QALEM_LICENSE_STATUS_BASE: &str = "https://qalem.ma/api/local/licenses";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeviceIdentity {
    device_id: String,
    encryption_public_key: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenPackageRequest {
    path: String,
    public_key: String,
}

#[derive(Serialize)]
struct OpenedPackage {
    content: serde_json::Value,
}

#[derive(Deserialize)]
struct LicenseStatusResponse {
    success: bool,
    status: SignedLicenseStatus,
}

fn local_error(message: &'static str) -> String {
    message.to_owned()
}

fn validate_uuid(value: &str) -> Result<(), String> {
    Uuid::parse_str(value)
        .map(|_| ())
        .map_err(|_| local_error("Invalid Qalem Local identity"))
}

fn device_entry(device_id: &str) -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, device_id)
        .map_err(|_| local_error("Local secure storage unavailable"))
}

fn unix_timestamp() -> Result<i64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| local_error("Local clock unavailable"))
        .map(|duration| duration.as_secs() as i64)
}

fn fresh_license_status(license_id: &str, device_id: &str) -> Result<SignedLicenseStatus, String> {
    let response = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|_| local_error("Local licence status unavailable"))?
        .get(format!(
            "{}/{}/status?deviceId={}",
            QALEM_LICENSE_STATUS_BASE, license_id, device_id
        ))
        .send()
        .map_err(|_| local_error("Local licence status unavailable"))?;
    if !response.status().is_success() {
        return Err(local_error("Local licence status unavailable"));
    }
    let status: LicenseStatusResponse = response
        .json()
        .map_err(|_| local_error("Local licence status unavailable"))?;
    if !status.success {
        return Err(local_error("Local licence status unavailable"));
    }
    Ok(status.status)
}

#[tauri::command]
fn create_device_identity() -> Result<DeviceIdentity, String> {
    let device_id = Uuid::new_v4().to_string();
    let secret = generate_device_secret();
    device_entry(&device_id)?
        .set_password(&encode_device_secret(&secret))
        .map_err(|_| local_error("Local secure storage unavailable"))?;
    Ok(DeviceIdentity {
        device_id,
        encryption_public_key: device_public_key(&secret),
    })
}

#[tauri::command]
fn open_local_package(request: OpenPackageRequest) -> Result<OpenedPackage, String> {
    let path = Path::new(&request.path);
    if path.extension().and_then(|extension| extension.to_str()) != Some("qalempkg") {
        return Err(local_error("Only Qalem Local packages are accepted"));
    }
    let artifact = fs::read(path).map_err(|_| local_error("Local package unavailable"))?;
    if artifact.is_empty() || artifact.len() > MAX_PACKAGE_BYTES as usize {
        return Err(local_error("Invalid local package size"));
    }
    let manifest: LocalPackageArtifact =
        serde_json::from_slice(&artifact).map_err(|_| local_error("Invalid protected package"))?;
    let claims = &manifest.package.license.claims;
    validate_uuid(&claims.user_id)?;
    validate_uuid(&claims.tenant_id)?;
    validate_uuid(&claims.device_id)?;
    validate_uuid(&claims.license_id)?;
    let verifying_key = verifying_key_from_base64(&request.public_key)
        .map_err(|_| local_error("Invalid Qalem signing key"))?;
    let now = unix_timestamp()?;
    let status = fresh_license_status(&claims.license_id, &claims.device_id)?;
    validate_license_status(
        &verifying_key,
        &status,
        &manifest.package.license,
        &claims.device_id,
        now,
    )
    .map_err(|_| local_error("Package access was refused"))?;
    let secret = device_entry(&claims.device_id)?
        .get_password()
        .map_err(|_| local_error("This device is not enrolled locally"))?;
    let content = open_artifact_bytes(
        &verifying_key,
        &decode_device_secret(&secret).map_err(|_| local_error("Invalid local device key"))?,
        &artifact,
        AccessContext {
            user_id: &claims.user_id,
            tenant_id: &claims.tenant_id,
            device_id: &claims.device_id,
            now,
        },
    )
    .map_err(|_| local_error("Package access was refused"))?;
    Ok(OpenedPackage {
        content: serde_json::from_slice(&content)
            .map_err(|_| local_error("Invalid protected content"))?,
    })
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            create_device_identity,
            open_local_package
        ])
        .run(tauri::generate_context!())
        .expect("Qalem Local could not start");
}
