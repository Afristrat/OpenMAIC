[CmdletBinding()]
param(
    [string]$WebApplicationUuid = 'bcx5pxyuc9z3lt4jtyjipcqu',
    [string]$RuntimeApplicationUuid = 'a14gf0n3u719hnnd2yujrtmr',
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-f]{40}$')]
    [string]$ExpectedCommit
)

$ErrorActionPreference = 'Stop'

$required = @(
    'LITELLM_BASE_URL',
    'LITELLM_MASTER_KEY',
    'QALEM_LITELLM_KEY',
    'COOLIFY_URL',
    'COOLIFY_API_TOKEN',
    'SERVER_HOST'
)
foreach ($name in $required) {
    if (-not [Environment]::GetEnvironmentVariable($name)) {
        throw "Variable requise absente : $name"
    }
}
if ($env:QALEM_ROTATE_LITELLM_CONFIRM -ne 'S6-014-QALEM-ONLY') {
    throw 'Confirmation de rotation Qalem absente'
}

$litellmBase = $env:LITELLM_BASE_URL.TrimEnd('/')
$coolifyBase = $env:COOLIFY_URL.TrimEnd('/')
$oldKey = $env:QALEM_LITELLM_KEY
$adminHeaders = @{ Authorization = "Bearer $env:LITELLM_MASTER_KEY" }
$coolifyHeaders = @{
    Authorization  = "Bearer $env:COOLIFY_API_TOKEN"
    'Content-Type' = 'application/json'
}
$applicationUuids = @($WebApplicationUuid, $RuntimeApplicationUuid)
$newKey = $null
$newAlias = 'qalem-production-rotated-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$vaultUpdated = $false
$coolifyUpdated = $false
$oldRevoked = $false
$vaultLoader = Join-Path $PSScriptRoot 's6-014-vault-loader.ps1'

# Aucun fournisseur ni consommateur n’est modifié tant que la chaîne complète
# écriture DPAPI → processus enfant → relecture n’a pas prouvé son rollback.
& 'C:\Users\amans\.claude\scripts\add-secret.ps1' `
    -Name QALEM_LITELLM_KEY -SelfTest -LoaderPath $vaultLoader | Out-Null

function Invoke-SafeRest {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Get', 'Post', 'Patch')][string]$Method,
        [Parameter(Mandatory = $true)][string]$Uri,
        [Parameter(Mandatory = $true)][hashtable]$Headers,
        [object]$Body,
        [Parameter(Mandatory = $true)][string]$Label
    )

    try {
        $parameters = @{
            Method  = $Method
            Uri     = $Uri
            Headers = $Headers
        }
        if ($null -ne $Body) {
            $parameters.Body = $Body | ConvertTo-Json -Depth 12 -Compress
            $parameters.ContentType = 'application/json'
        }
        return Invoke-RestMethod @parameters
    }
    catch {
        $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        throw "$Label : HTTP $status"
    }
}

function Set-CoolifyKey {
    param([Parameter(Mandatory = $true)][string]$Value)

    foreach ($applicationUuid in $applicationUuids) {
        foreach ($isPreview in @($false, $true)) {
            $body = @{
                key           = 'OPENAI_API_KEY'
                value         = $Value
                is_preview    = $isPreview
                is_literal    = $true
                is_multiline  = $false
                is_shown_once = $true
            }
            Invoke-SafeRest -Method Patch `
                -Uri "$coolifyBase/api/v1/applications/$applicationUuid/envs" `
                -Headers $coolifyHeaders -Body $body `
                -Label "Mise à jour Coolify $applicationUuid preview=$isPreview" | Out-Null
        }
    }
}

function Start-Deployments {
    $deployments = @()
    foreach ($applicationUuid in $applicationUuids) {
        $pin = @{ git_commit_sha = $ExpectedCommit }
        Invoke-SafeRest -Method Patch `
            -Uri "$coolifyBase/api/v1/applications/$applicationUuid" `
            -Headers $coolifyHeaders -Body $pin `
            -Label "Épinglage Coolify $applicationUuid" | Out-Null
        $response = Invoke-SafeRest -Method Post -Uri "$coolifyBase/api/v1/deploy" `
            -Headers $coolifyHeaders -Body @{ uuid = $applicationUuid } `
            -Label "Déploiement Coolify $applicationUuid"
        $deploymentUuid = $response.deployments[0].deployment_uuid
        if (-not $deploymentUuid) { throw "Identifiant de déploiement absent pour $applicationUuid" }
        $deployments += $deploymentUuid
    }
    return $deployments
}

function Wait-Deployments {
    param([Parameter(Mandatory = $true)][string[]]$DeploymentUuids)

    $deadline = (Get-Date).AddMinutes(20)
    $pending = [Collections.Generic.HashSet[string]]::new([string[]]$DeploymentUuids)
    while ($pending.Count -gt 0) {
        if ((Get-Date) -gt $deadline) { throw 'Délai Coolify dépassé' }
        foreach ($deploymentUuid in @($pending)) {
            $deployment = Invoke-SafeRest -Method Get `
                -Uri "$coolifyBase/api/v1/deployments/$deploymentUuid" `
                -Headers $coolifyHeaders -Label "Lecture du déploiement $deploymentUuid"
            if ($deployment.status -eq 'finished') {
                [void]$pending.Remove($deploymentUuid)
            }
            elseif ($deployment.status -in @('failed', 'cancelled')) {
                throw "Déploiement $deploymentUuid terminé avec le statut $($deployment.status)"
            }
        }
        if ($pending.Count -gt 0) { Start-Sleep -Seconds 15 }
    }
}

function Test-LiveContainers {
    param([Parameter(Mandatory = $true)][string]$ExpectedKey)

    $remote = @'
set -eu
read -r encoded
encoded=$(printf %s "$encoded" | tr -d "\r")
expected=$(printf %s "$encoded" | base64 -d)
web=$(docker ps --filter name=bcx5pxyuc9z3lt4jtyjipcqu --format "{{.ID}}" | head -n 1)
worker=$(docker ps --filter name=qalem-workers-a14gf0n3u719hnnd2yujrtmr --format "{{.ID}}" | head -n 1)
capture=$(docker ps --filter name=capture-worker-a14gf0n3u719hnnd2yujrtmr --format "{{.ID}}" | head -n 1)
test -n "$web" && test -n "$worker" && test -n "$capture"
for container in "$web" "$worker" "$capture"; do
  actual=$(docker exec "$container" printenv OPENAI_API_KEY)
  test "$actual" = "$expected"
  state=$(docker inspect "$container" --format "{{.State.Running}}|{{.State.Health.Status}}|{{.State.OOMKilled}}|{{.RestartCount}}")
  test "$state" = "true|healthy|false|0"
done
curl -fsS https://qalem.ma/api/health >/dev/null
printf "live_key_match=true\ncontainers_healthy=true\nhealth_http=200\n"
'@
    $remoteEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remote))
    $sshCommand = "echo $remoteEncoded | base64 -d | bash"
    $keyEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($ExpectedKey))
    $output = $keyEncoded | & ssh -i "$HOME/.ssh/serveurai_mnemo" -o BatchMode=yes `
        "serveuria@$env:SERVER_HOST" $sshCommand
    if ($LASTEXITCODE -ne 0) { throw 'Contrôle des conteneurs Qalem échoué' }
    return @($output)
}

function Test-LiteLlmKey {
    param([Parameter(Mandatory = $true)][string]$Key)

    $headers = @{ Authorization = "Bearer $Key" }
    $info = Invoke-SafeRest -Method Get -Uri "$litellmBase/key/info" -Headers $headers `
        -Label 'Vérification de la clé LiteLLM'
    if (-not $info.info.key_alias) { throw 'Métadonnées LiteLLM incomplètes' }
    $completion = Invoke-SafeRest -Method Post -Uri "$litellmBase/v1/chat/completions" `
        -Headers $headers -Body @{
            model      = 'general'
            messages   = @(@{ role = 'user'; content = 'Réponds uniquement OK.' })
            max_tokens = 3
        } -Label 'Appel réel LiteLLM'
    if (@($completion.choices).Count -ne 1) { throw 'Réponse LiteLLM incomplète' }
    return $info.info
}

try {
    $oldInfo = Test-LiteLlmKey -Key $oldKey
    $generateBody = @{
        key_alias = $newAlias
        models    = @($oldInfo.models)
    }
    if ($oldInfo.team_id) { $generateBody.team_id = $oldInfo.team_id }
    if ($oldInfo.user_id) { $generateBody.user_id = $oldInfo.user_id }
    if ($null -ne $oldInfo.max_budget) { $generateBody.max_budget = $oldInfo.max_budget }
    if ($oldInfo.budget_duration) { $generateBody.budget_duration = $oldInfo.budget_duration }

    $created = Invoke-SafeRest -Method Post -Uri "$litellmBase/key/generate" `
        -Headers $adminHeaders -Body $generateBody -Label 'Création de la clé LiteLLM Qalem'
    $newKey = $created.key
    if (-not $newKey) { throw 'La nouvelle clé LiteLLM est absente de la réponse' }
    $newInfo = Test-LiteLlmKey -Key $newKey
    if ($newInfo.key_alias -ne $newAlias) { throw 'Alias inattendu pour la nouvelle clé LiteLLM' }

    Set-CoolifyKey -Value $newKey
    $coolifyUpdated = $true
    $deploymentUuids = @(Start-Deployments)
    Wait-Deployments -DeploymentUuids $deploymentUuids
    $liveChecks = @(Test-LiveContainers -ExpectedKey $newKey)
    $newInfo = Test-LiteLlmKey -Key $newKey

    & 'C:\Users\amans\.claude\scripts\add-secret.ps1' `
        -Name QALEM_LITELLM_KEY -Value $newKey -LoaderPath $vaultLoader | Out-Null
    $vaultUpdated = $true

    $deleted = Invoke-SafeRest -Method Post -Uri "$litellmBase/key/delete" `
        -Headers $adminHeaders -Body @{ keys = @($oldKey) } -Label "Révocation de l’ancienne clé LiteLLM"
    if (@($deleted.deleted_keys).Count -ne 1) { throw 'Révocation LiteLLM non confirmée' }
    $oldRevoked = $true

    $oldStatus = 0
    try {
        Invoke-RestMethod -Method Get -Uri "$litellmBase/key/info" `
            -Headers @{ Authorization = "Bearer $oldKey" } | Out-Null
        $oldStatus = 200
    }
    catch {
        $oldStatus = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    }
    if (@(401, 403, 404) -notcontains $oldStatus) {
        throw "L’ancienne clé LiteLLM répond encore"
    }

    [pscustomobject]@{
        oldAlias          = $oldInfo.key_alias
        newAlias          = $newAlias
        modelsPreserved   = @($newInfo.models).Count
        deployments       = $deploymentUuids
        liveChecks        = $liveChecks
        newKeyVerified    = $true
        oldKeyRevoked     = $true
        vaultUpdated      = $true
        expectedCommit    = $ExpectedCommit
    } | ConvertTo-Json -Depth 6 -Compress
}
catch {
    $failure = $_.Exception.Message
    if (-not $oldRevoked) {
        if ($coolifyUpdated) {
            try {
                Set-CoolifyKey -Value $oldKey
                $rollbackDeployments = @(Start-Deployments)
                Wait-Deployments -DeploymentUuids $rollbackDeployments
                Test-LiveContainers -ExpectedKey $oldKey | Out-Null
            }
            catch { }
        }
        if ($vaultUpdated) {
            try {
                & 'C:\Users\amans\.claude\scripts\add-secret.ps1' `
                    -Name QALEM_LITELLM_KEY -Value $oldKey -LoaderPath $vaultLoader | Out-Null
            }
            catch { }
        }
        if ($newKey) {
            try {
                Invoke-SafeRest -Method Post -Uri "$litellmBase/key/delete" `
                    -Headers $adminHeaders -Body @{ keys = @($newKey) } `
                    -Label 'Suppression de la clé LiteLLM de repli' | Out-Null
            }
            catch { }
        }
    }
    throw "Rotation LiteLLM Qalem interrompue : $failure"
}
