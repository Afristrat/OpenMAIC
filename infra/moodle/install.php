<?php
// CLI only. Keep the bootstrap password out of argv, process listings and logs.
if (PHP_SAPI !== 'cli') {
    exit(1);
}
$password = trim(file_get_contents('/run/secrets/admin_password'));
if (strlen($password) < 32) {
    throw new RuntimeException('Missing bootstrap credential');
}
$_SERVER['argv'] = [
    'install_database.php',
    '--agree-license',
    '--lang=en',
    '--adminuser=qalem-lti-admin',
    '--adminpass=' . $password,
    '--adminemail=lti-test@qalem.ma',
    '--fullname=Qalem — Recette LTI',
    '--shortname=Qalem LTI Test',
];
$_SERVER['argc'] = count($_SERVER['argv']);
require('/var/www/html/admin/cli/install_database.php');
