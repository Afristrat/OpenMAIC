$ErrorActionPreference = 'Stop'

# Chargeur de validation isolé pour le format DPAPI réellement utilisé par le
# coffre. Il évite l’autoload PowerShell.Security, indisponible dans le
# processus enfant purgé de l’environnement du broker, tout en relisant le blob
# écrit avec la même primitive DPAPI CurrentUser.
Add-Type -AssemblyName System.Security
$vaultPath = 'C:\Users\amans\.claude\secrets\secrets.env.dpapi'
$hex = ([Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($vaultPath))).TrimStart(
    [char]0xFEFF
).Trim()
if ($hex -notmatch '^[0-9a-fA-F]+$' -or ($hex.Length % 2) -ne 0) {
    throw 'Format DPAPI hexadécimal inattendu'
}
$protected = [Runtime.Remoting.Metadata.W3cXsd2001.SoapHexBinary]::Parse($hex).Value
$plainBytes = [Security.Cryptography.ProtectedData]::Unprotect(
    $protected,
    $null,
    [Security.Cryptography.DataProtectionScope]::CurrentUser
)
$candidates = @(
    [Text.Encoding]::Unicode.GetString($plainBytes),
    [Text.Encoding]::UTF8.GetString($plainBytes)
)
$plain = $candidates | Where-Object {
    $_ -match '(?m)^[A-Za-z_][A-Za-z0-9_]*='
} | Select-Object -First 1
if (-not $plain) { throw 'Contenu du coffre non reconnu après déchiffrement' }

foreach ($line in ($plain -split "`r?`n")) {
    if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
        [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
    }
}
