<?php
// Real, isolated LTI test data. No grades are written by this bootstrap.
if (PHP_SAPI !== 'cli') { exit(1); }
define('CLI_SCRIPT', true);
require '/var/www/html/config.php';
require_once $CFG->dirroot . '/course/lib.php';
require_once $CFG->dirroot . '/course/modlib.php';
require_once $CFG->dirroot . '/user/lib.php';
require_once $CFG->dirroot . '/mod/lti/locallib.php';
\core\session\manager::set_user(get_admin());

$course = $DB->get_record('course', ['shortname' => 'QALEM-LTI-S034']);
if (!$course) {
    $course = create_course((object)[
        'fullname' => 'Qalem — Recette LTI', 'shortname' => 'QALEM-LTI-S034',
        'category' => $DB->get_field('course_categories', 'id', [], MUST_EXIST),
        'format' => 'topics', 'visible' => 1, 'enablecompletion' => 0,
    ]);
}
$type = $DB->get_record('lti_types', ['name' => 'Qalem S034']);
if (!$type) {
    $id = lti_add_type((object)['state' => LTI_TOOL_STATE_CONFIGURED], (object)[
        'lti_typename' => 'Qalem S034',
        'lti_toolurl' => 'https://qalem.ma/api/lti/launch',
        'lti_ltiversion' => LTI_VERSION_1P3,
        'lti_keytype' => LTI_JWK_KEYSET,
        'lti_publickeyset' => 'https://qalem.ma/api/lti/jwks',
        'lti_initiatelogin' => 'https://qalem.ma/api/lti/login',
        'lti_redirectionuris' => 'https://qalem.ma/api/lti/launch',
        'lti_coursevisible' => LTI_COURSEVISIBLE_PRECONFIGURED,
        'lti_acceptgrades' => LTI_SETTING_ALWAYS,
        'lti_sendname' => LTI_SETTING_NEVER,
        'lti_sendemailaddr' => LTI_SETTING_NEVER,
        'lti_forcessl' => 1,
        'lti_contentitem' => 0,
        'ltiservice_gradesynchronization' => 2,
    ]);
    $type = $DB->get_record('lti_types', ['id' => $id], '*', MUST_EXIST);
}
if ($type->baseurl !== 'https://qalem.ma/api/lti/launch' || $type->ltiversion !== LTI_VERSION_1P3) {
    throw new RuntimeException('Existing fixture tool differs; refusing replacement');
}
$activity = $DB->get_record('lti', ['course' => $course->id, 'name' => 'Quiz Qalem S034']);
if (!$activity) {
    $module = add_moduleinfo((object)[
        'modulename' => 'lti', 'module' => $DB->get_field('modules', 'id', ['name'=>'lti'], MUST_EXIST),
        'name' => 'Quiz Qalem S034', 'section' => 0, 'visible' => 1,
        'typeid' => $type->id, 'toolurl' => 'https://qalem.ma/api/lti/launch',
        'intro' => '', 'introformat' => FORMAT_HTML, 'grade' => 100,
        'instructorchoiceacceptgrades' => LTI_SETTING_ALWAYS,
        'instructorchoicesendname' => LTI_SETTING_NEVER,
        'instructorchoicesendemailaddr' => LTI_SETTING_NEVER,
        'launchcontainer' => LTI_LAUNCH_CONTAINER_REPLACE_MOODLE_WINDOW,
    ], $course);
    $activity = $DB->get_record('lti', ['id' => $module->instance], '*', MUST_EXIST);
}
$cm = get_coursemodule_from_instance('lti', $activity->id, $course->id, false, MUST_EXIST);
$manual = enrol_get_plugin('manual');
$instances = enrol_get_instances($course->id, true);
$instance = current(array_filter($instances, fn($item) => $item->enrol === 'manual'));
if (!$instance) {
    $instanceid = $manual->add_instance($course);
    $instance = $DB->get_record('enrol', ['id'=>$instanceid], '*', MUST_EXIST);
}
$role = $DB->get_field('role', 'id', ['shortname'=>'student'], MUST_EXIST);
$secretDir = $CFG->dataroot . '/.qalem-lti-secrets';
if (!is_dir($secretDir) && !mkdir($secretDir, 0700)) {
    throw new RuntimeException('Cannot create fixture credential directory');
}
$learners = [];
foreach (['a', 'b'] as $suffix) {
    $username = 'qalem-lti-learner-' . $suffix;
    $user = $DB->get_record('user', ['username'=>$username, 'mnethostid'=>$CFG->mnet_localhost_id]);
    $secretFile = $secretDir . '/learner_' . $suffix;
    if (!$user) {
        if (!file_exists($secretFile)) {
            $credential = 'Qa1!' . bin2hex(random_bytes(32));
            if (file_put_contents($secretFile, $credential, LOCK_EX) !== strlen($credential)) {
                throw new RuntimeException('Cannot persist fixture credential');
            }
            chmod($secretFile, 0600);
        }
        $id = user_create_user((object)[
            'username'=>$username, 'auth'=>'manual', 'confirmed'=>1,
            'password'=>trim(file_get_contents($secretFile)),
            'firstname'=>'Recette', 'lastname'=>strtoupper($suffix),
            'email'=>$username.'@example.invalid', 'mnethostid'=>$CFG->mnet_localhost_id,
        ]);
        $user = $DB->get_record('user', ['id'=>$id], '*', MUST_EXIST);
    }
    if (!file_exists($secretFile)) { throw new RuntimeException('Fixture credential missing; no reset'); }
    $manual->enrol_user($instance, $user->id, $role);
    $learners[$suffix] = (string)$user->id;
}
echo json_encode([
    'proof'=>'S034_MOODLE_FIXTURE_READY', 'courseId'=>$course->id,
    'clientId'=>$type->clientid, 'deploymentId'=>(string)$type->id,
    'resourceLinkId'=>(string)$activity->id, 'courseModuleId'=>$cm->id,
    'learners'=>$learners,
], JSON_UNESCAPED_SLASHES) . PHP_EOL;
