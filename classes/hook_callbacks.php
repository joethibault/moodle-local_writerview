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
 * Hook callbacks for local_writerview.
 *
 * @package    local_writerview
 * @copyright  2026 Cursive Technology
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_writerview;

/**
 * Hook callbacks for conditional JS/CSS injection on the assignment submission page.
 *
 * @package    local_writerview
 * @copyright  2026 Cursive Technology
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class hook_callbacks {

    /**
     * Conditionally inject Writer View JS and configuration.
     *
     * This callback fires on every page via the before_standard_head_html_generation
     * hook. It returns as early as possible on non-target pages.
     *
     * @param \core\hook\output\before_standard_head_html_generation $hook The hook instance.
     * @return void
     */
    public static function inject_writerview(
        \core\hook\output\before_standard_head_html_generation $hook
    ): void {
        global $PAGE, $DB, $USER;

        // Gate 1: Only act on the assignment submission editing page.
        if ($PAGE->pagetype !== 'mod-assign-editsubmission') {
            return;
        }

        // Gate 2: Verify module context.
        $context = $PAGE->context;
        if ($context->contextlevel !== CONTEXT_MODULE) {
            return;
        }

        $cmid = $context->instanceid;

        // Gate 3: Check if Writer View is enabled for this assignment (cached).
        if (!self::is_enabled($cmid)) {
            return;
        }

        // Gather data with a single combined query.
        $cm = get_coursemodule_from_id('assign', $cmid, 0, false, MUST_EXIST);

        $sql = "SELECT a.id, a.name, a.intro, a.introformat,
                       a.activity, a.activityformat, a.duedate,
                       s.status AS submissionstatus
                  FROM {assign} a
             LEFT JOIN {assign_submission} s ON s.assignment = a.id
                       AND s.userid = :userid AND s.latest = 1
                 WHERE a.id = :assignid";

        $record = $DB->get_record_sql($sql, [
            'userid' => $USER->id,
            'assignid' => $cm->instance,
        ], MUST_EXIST);

        $description = format_text(
            $record->intro,
            $record->introformat,
            ['context' => $context, 'noclean' => false]
        );

        $statustext = $record->submissionstatus ?: 'new';

        // Activity instructions (separate from description, shown only on submission page).
        $instructions = '';
        if (!empty($record->activity)) {
            $instructions = format_text(
                $record->activity,
                $record->activityformat,
                ['context' => $context, 'noclean' => false]
            );
        }

        // Fetch rubric preview if advanced grading is active.
        $rubrichtml = '';
        $gradingmanager = get_grading_manager($context, 'mod_assign', 'submissions');
        if ($gradingmanager) {
            $controller = $gradingmanager->get_active_controller();
            if ($controller) {
                $rubrichtml = $controller->render_preview($PAGE);
            }
        }

        // All user-facing strings passed via get_string().
        $jsconfig = [
            'cmid' => $cmid,
            'studentName' => fullname($USER),
            'description' => $description,
            'instructions' => $instructions,
            'assignmentName' => format_string($record->name, true, ['context' => $context]),
            'submissionStatus' => $statustext,
            'dueDate' => (int) $record->duedate,
            'rubricHtml' => $rubrichtml,
            'strings' => [
                'studentinfo' => get_string('sidebar_studentinfo', 'local_writerview'),
                'description' => get_string('sidebar_description', 'local_writerview'),
                'instructions' => get_string('sidebar_instructions', 'local_writerview'),
                'status' => get_string('sidebar_status', 'local_writerview'),
                'wordcount' => get_string('sidebar_wordcount', 'local_writerview'),
                'rubric' => get_string('sidebar_rubric', 'local_writerview'),
                'duedate' => get_string('sidebar_duedate', 'local_writerview'),
                'overdue' => get_string('sidebar_overdue', 'local_writerview'),
                'timelimit' => get_string('sidebar_timelimit', 'local_writerview'),
                'togglesidebar' => get_string('sidebar_toggle', 'local_writerview'),
                'hidedetails' => get_string('sidebar_hidedetails', 'local_writerview'),
                'showdetails' => get_string('sidebar_showdetails', 'local_writerview'),
                'arialabel' => get_string('sidebar_arialabel', 'local_writerview'),
                'show' => get_string('sidebar_show', 'local_writerview'),
                'hide' => get_string('sidebar_hide', 'local_writerview'),
                'statusnew' => get_string('status_new', 'local_writerview'),
                'statusdraft' => get_string('status_draft', 'local_writerview'),
                'statussubmitted' => get_string('status_submitted', 'local_writerview'),
                'statusreopened' => get_string('status_reopened', 'local_writerview'),
            ],
        ];

        $PAGE->requires->js_call_amd(
            'local_writerview/writerview',
            'init',
            [$jsconfig]
        );
    }

    /**
     * Check whether Writer View is enabled for a given course module.
     *
     * Uses MUC application cache to avoid repeated DB queries.
     * Falls back to the site-wide default if no per-assignment config exists.
     *
     * @param int $cmid Course module ID.
     * @return bool True if Writer View is enabled.
     */
    public static function is_enabled(int $cmid): bool {
        $cache = \cache::make('local_writerview', 'config');
        $cached = $cache->get($cmid);

        if ($cached !== false) {
            return (bool) $cached;
        }

        global $DB;
        $record = $DB->get_record('local_writerview_config', ['cmid' => $cmid]);

        if ($record) {
            $enabled = (bool) $record->enabled;
        } else {
            $enabled = (bool) get_config('local_writerview', 'default_enabled');
        }

        $cache->set($cmid, (int) $enabled);
        return $enabled;
    }
}
