<?php
// Bootstrap once, before the database exists. Never replace an existing secret.
if (PHP_SAPI !== 'cli') {
    exit(1);
}
foreach (['db_password', 'admin_password'] as $name) {
    $path = '/secrets/' . $name;
    if (file_exists($path)) {
        throw new RuntimeException('Bootstrap secrets already exist; refusing replacement');
    }
}
foreach (['db_password', 'admin_password'] as $name) {
    $handle = fopen('/secrets/' . $name, 'x');
    if ($handle === false) {
        throw new RuntimeException('Cannot create bootstrap secret');
    }
    $secret = 'Qa1!' . bin2hex(random_bytes(32));
    if (fwrite($handle, $secret) !== strlen($secret)) {
        throw new RuntimeException('Incomplete bootstrap secret');
    }
    fclose($handle);
    chmod('/secrets/' . $name, 0444);
}
echo "Two bootstrap secrets created; values withheld.\n";
