$ErrorActionPreference = 'Stop'
if (-not $env:CLOUDFLARE_API_TOKEN) { throw 'Cloudflare credential missing' }
$headers = @{ Authorization = "Bearer $env:CLOUDFLARE_API_TOKEN" }
$api = 'https://api.cloudflare.com/client/v4'
$hostname = 'lms-test.qalem.ma'
$target = 'http://localhost:8096'
$tunnelId = '7156c3f9-07a4-472d-963a-efaf59769d40'
$configUrl = "$api/accounts/aef512e10033d31f08605fc78a4f745a/cfd_tunnel/$tunnelId/configurations"
$dnsUrl = "$api/zones/feeb8cd88013bd8cc7f4cb349b1cb8cb/dns_records"
$dnsTarget = "$tunnelId.cfargotunnel.com"

$dns = Invoke-RestMethod "$dnsUrl`?name=$hostname" -Headers $headers
if (-not $dns.success) { throw 'DNS lookup failed' }
foreach ($record in $dns.result) {
    if ($record.type -ne 'CNAME' -or $record.content -ne $dnsTarget -or -not $record.proxied) {
        throw 'Existing DNS differs; refusing replacement'
    }
}
$before = Invoke-RestMethod $configUrl -Headers $headers
if (-not $before.success) { throw 'Tunnel read failed' }
$config = $before.result.config
$existing = @($config.ingress | Where-Object { $_.hostname -eq $hostname })
if ($existing.Count -gt 1 -or ($existing.Count -eq 1 -and $existing[0].service -ne $target)) {
    throw 'Existing ingress differs; refusing replacement'
}
$otherBefore = ConvertTo-Json -InputObject @($config.ingress | Where-Object { $_.hostname -ne $hostname }) -Depth 30 -Compress
if ($existing.Count -eq 0) {
    $latest = Invoke-RestMethod $configUrl -Headers $headers
    if (-not $latest.success -or $latest.result.version -ne $before.result.version) {
        throw 'Concurrent tunnel change; retry from current state'
    }
    $config.ingress = @(@{ hostname = $hostname; service = $target }) + @($config.ingress)
    $body = @{ config = $config } | ConvertTo-Json -Depth 30 -Compress
    $saved = Invoke-RestMethod $configUrl -Method Put -Headers $headers -ContentType 'application/json' -Body $body
    if (-not $saved.success) { throw 'Tunnel update failed' }
}
$after = Invoke-RestMethod $configUrl -Headers $headers
$otherAfter = ConvertTo-Json -InputObject @($after.result.config.ingress | Where-Object { $_.hostname -ne $hostname }) -Depth 30 -Compress
if (-not $after.success -or $otherBefore -cne $otherAfter) {
    throw 'Unrelated ingress changed; inspection required before DNS publication'
}
$actual = @($after.result.config.ingress | Where-Object { $_.hostname -eq $hostname })
if ($actual.Count -ne 1 -or $actual[0].service -ne $target) { throw 'Ingress verification failed' }
if (@($dns.result).Count -eq 0) {
    $body = @{ type = 'CNAME'; name = $hostname; content = $dnsTarget; proxied = $true; ttl = 1 } | ConvertTo-Json -Compress
    $created = Invoke-RestMethod $dnsUrl -Method Post -Headers $headers -ContentType 'application/json' -Body $body
    if (-not $created.success) { throw 'DNS creation failed; ingress retained for retry' }
}
$verified = Invoke-RestMethod "$dnsUrl`?name=$hostname" -Headers $headers
if (-not $verified.success -or @($verified.result).Count -ne 1 -or $verified.result[0].content -ne $dnsTarget) {
    throw 'DNS verification failed'
}
Write-Output 'Moodle ingress and DNS verified; unrelated ingress preserved.'
