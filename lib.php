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
 * Library functions for local_writerview.
 *
 * @package    local_writerview
 * @copyright  2026 Cursive Technology
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

/**
 * Extend the assignment module settings navigation with a Writer View toggle.
 *
 * @param settings_navigation $settingsnav The settings navigation object.
 * @param context $context The context of the module.
 */
function local_writerview_extend_settings_navigation(
    settings_navigation $settingsnav,
    context $context
) {
    if ($context->contextlevel !== CONTEXT_MODULE) {
        return;
    }

    $cm = get_coursemodule_from_id('assign', $context->instanceid, 0, false, IGNORE_MISSING);
    if (!$cm) {
        return;
    }

    if (!has_capability('local/writerview:manage', $context)) {
        return;
    }

    $modulesettings = $settingsnav->find('modulesettings', navigation_node::TYPE_SETTING);
    if (!$modulesettings) {
        return;
    }

    $enabled = local_writerview_is_enabled($cm->id);

    $url = new moodle_url('/local/writerview/toggle.php', [
        'cmid' => $cm->id,
        'sesskey' => sesskey(),
    ]);

    $stringkey = $enabled ? 'disablewriterview' : 'enablewriterview';
    $label = get_string($stringkey, 'local_writerview');

    $node = navigation_node::create(
        $label,
        $url,
        navigation_node::TYPE_SETTING,
        null,
        'local_writerview_toggle',
        new pix_icon('i/settings', '')
    );

    $modulesettings->add_node($node);
}

/**
 * Check whether Writer View is enabled for a given course module.
 *
 * If a row exists in local_writerview_config, use its value.
 * Otherwise fall back to the site-wide default.
 *
 * @param int $cmid Course module ID.
 * @return bool True if enabled.
 */
function local_writerview_is_enabled(int $cmid): bool {
    global $DB;

    $record = $DB->get_record('local_writerview_config', ['cmid' => $cmid]);
    if ($record) {
        return (bool) $record->enabled;
    }

    return (bool) get_config('local_writerview', 'default_enabled');
}
