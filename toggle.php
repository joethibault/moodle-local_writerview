<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Toggle Writer View for a specific assignment.
 *
 * @package    local_writerview
 * @copyright  2026 Cursive Technology
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require_once(__DIR__ . '/../../config.php');

$cmid = required_param('cmid', PARAM_INT);

require_sesskey();

$cm = get_coursemodule_from_id('assign', $cmid, 0, false, MUST_EXIST);
$context = context_module::instance($cm->id);

require_login($cm->course, false, $cm);
require_capability('local/writerview:manage', $context);

$current = $DB->get_record('local_writerview_config', ['cmid' => $cmid]);

if ($current) {
    $current->enabled = $current->enabled ? 0 : 1;
    $current->timemodified = time();
    $DB->update_record('local_writerview_config', $current);
} else {
    $sitedefault = (bool) get_config('local_writerview', 'default_enabled');
    $record = new stdClass();
    $record->cmid = $cmid;
    $record->enabled = $sitedefault ? 0 : 1;
    $record->timemodified = time();
    $DB->insert_record('local_writerview_config', $record);
}

$url = new moodle_url('/mod/assign/view.php', ['id' => $cmid]);
redirect($url);
