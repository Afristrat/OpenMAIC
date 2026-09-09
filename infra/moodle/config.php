<?php
// Dedicated synthetic-data LMS. No dependency on Qalem's Supabase instance.
unset($CFG);
$CFG = new stdClass();
$CFG->dbtype = 'pgsql';
$CFG->dblibrary = 'native';
$CFG->dbhost = 'db';
$CFG->dbname = 'moodle';
$CFG->dbuser = 'moodle';
$CFG->dbpass = trim(file_get_contents('/run/secrets/db_password'));
$CFG->prefix = 'mdl_';
$CFG->dboptions = ['dbpersist' => false, 'dbport' => 5432];
$CFG->wwwroot = 'https://lms-test.qalem.ma';
$CFG->dataroot = '/var/www/moodledata';
$CFG->admin = 'admin';
$CFG->directorypermissions = 02770;
$CFG->sslproxy = true;
$CFG->cookiesecure = true;
$CFG->disableupdateautodeploy = true;
$CFG->forcelogin = true;
$CFG->registerauth = '';
$CFG->auth = 'manual';
$CFG->guestloginbutton = 0;
$CFG->noreplyaddress = 'noreply@lms-test.qalem.ma';
$CFG->noemailever = true;
$CFG->debug = 0;
$CFG->debugdisplay = false;
require_once(__DIR__ . '/lib/setup.php');
