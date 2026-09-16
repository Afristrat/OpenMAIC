<?php
// Recette isolée d'import et de suivi SCORM 1.2 dans le Moodle Qalem existant.
// Les données sont exclusivement préfixées par le marqueur passé par l'orchestrateur.
if (PHP_SAPI !== 'cli') { exit(1); }
define('CLI_SCRIPT', true);
require '/var/www/html/config.php';
require_once $CFG->dirroot . '/course/lib.php';
require_once $CFG->dirroot . '/course/modlib.php';
require_once $CFG->dirroot . '/user/lib.php';
require_once $CFG->dirroot . '/mod/scorm/locallib.php';

[$script, $action, $marker] = array_pad($argv, 3, '');
if (!in_array($action, ['prepare', 'verify', 'cleanup'], true) || !preg_match('/^s1007-[a-f0-9-]+$/', $marker)) {
    throw new InvalidArgumentException('Arguments de recette invalides');
}

$courseShortname = 'QALEM-' . strtoupper($marker);
$username = 'qalem-' . $marker;
$course = $DB->get_record('course', ['shortname' => $courseShortname]);
$user = $DB->get_record('user', ['username' => $username, 'mnethostid' => $CFG->mnet_localhost_id]);

if ($action === 'prepare') {
    $archive = getenv('QALEM_S1007_ARCHIVE');
    $password = getenv('QALEM_S1007_PASSWORD');
    if (!$archive || !is_readable($archive) || !$password || strlen($password) < 32 || $course || $user) {
        throw new RuntimeException('Préconditions de recette non satisfaites');
    }
    try {
    \core\session\manager::set_user(get_admin());
    $course = create_course((object)[
        'fullname' => 'Qalem — SCORM ' . $marker,
        'shortname' => $courseShortname,
        'category' => $DB->get_field('course_categories', 'id', [], MUST_EXIST),
        'format' => 'topics',
        'visible' => 1,
        'enablecompletion' => 0,
    ]);
    $userId = user_create_user((object)[
        'username' => $username, 'auth' => 'manual', 'confirmed' => 1,
        'password' => $password, 'firstname' => 'Recette', 'lastname' => 'SCORM',
        'email' => $username . '@example.invalid', 'mnethostid' => $CFG->mnet_localhost_id,
    ]);
    $user = $DB->get_record('user', ['id' => $userId], '*', MUST_EXIST);
    $manual = enrol_get_plugin('manual');
    $instances = array_filter(enrol_get_instances($course->id, true), fn($item) => $item->enrol === 'manual');
    $instance = reset($instances);
    if (!$instance) { $instance = $DB->get_record('enrol', ['id' => $manual->add_instance($course)], '*', MUST_EXIST); }
    $manual->enrol_user($instance, $user->id, $DB->get_field('role', 'id', ['shortname' => 'student'], MUST_EXIST));

    $draftId = file_get_unused_draft_itemid();
    $fs = get_file_storage();
    $fs->create_file_from_pathname([
        'contextid' => context_user::instance(get_admin()->id)->id,
        'component' => 'user', 'filearea' => 'draft', 'itemid' => $draftId,
        'filepath' => '/', 'filename' => 'qalem.scorm12.zip',
    ], $archive);
    $module = add_moduleinfo((object)[
        'modulename' => 'scorm',
        'module' => $DB->get_field('modules', 'id', ['name' => 'scorm'], MUST_EXIST),
        'course' => $course->id, 'section' => 0, 'visible' => 1,
        'name' => 'Qalem SCORM ' . $marker, 'intro' => '', 'introformat' => FORMAT_HTML,
        'scormtype' => SCORM_TYPE_LOCAL, 'packagefile' => $draftId,
        'grademethod' => GRADESCOES, 'maxgrade' => 100, 'whatgrade' => 1,
        'displaycoursestructure' => 0, 'hidetoc' => 0, 'skipview' => 0,
        'updatefreq' => 0, 'width' => 100, 'height' => 500,
    ], $course);
    $scorm = $DB->get_record('scorm', ['id' => $module->instance], '*', MUST_EXIST);
    $courseModule = get_coursemodule_from_instance('scorm', $scorm->id, $course->id, false, MUST_EXIST);
    rebuild_course_cache($course->id, true);
    $scoCount = $DB->count_records('scorm_scoes', ['scorm' => $scorm->id]);
    if ($scoCount < 1) { throw new RuntimeException('Le parseur Moodle n’a trouvé aucun SCO'); }
    echo json_encode(['proof' => 'S1007_MOODLE_PREPARED', 'courseId' => $course->id, 'scormId' => $scorm->id, 'cmId' => $courseModule->id, 'scoCount' => $scoCount]) . PHP_EOL;
    exit(0);
    } catch (Throwable $error) {
        if ($course) { delete_course($course, false); }
        if ($user) { delete_user($user); }
        throw $error;
    }
}

if ($action === 'verify') {
    if (!$course || !$user) { throw new RuntimeException('Fixture de recette absente'); }
    $scorm = $DB->get_record('scorm', ['course' => $course->id], '*', MUST_EXIST);
    $scoId = $DB->get_field_sql('SELECT id FROM {scorm_scoes} WHERE scorm = ? ORDER BY id ASC', [$scorm->id], MUST_EXIST);
    $tracks = scorm_get_tracks($scoId, $user->id, 1);
    if (($tracks->status ?? null) !== 'completed' || (string)($tracks->score_raw ?? '') !== '100') {
        throw new RuntimeException('Suivi SCORM Moodle incomplet');
    }
    echo json_encode(['proof' => 'S1007_MOODLE_TRACKS_OK', 'status' => $tracks->status, 'scoreRaw' => $tracks->score_raw]) . PHP_EOL;
    exit(0);
}

if ($course) { delete_course($course, false); }
if ($user) { delete_user($user); }
$remaining = $DB->count_records_select('course', 'shortname = ?', [$courseShortname]) + $DB->count_records_select('user', 'username = ? AND deleted = 0', [$username]);
if ($remaining !== 0) { throw new RuntimeException('Nettoyage Moodle incomplet'); }
echo json_encode(['proof' => 'S1007_MOODLE_CLEANUP_OK']) . PHP_EOL;
