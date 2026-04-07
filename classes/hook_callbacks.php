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

defined('MOODLE_INTERNAL') || die();

require_once(__DIR__ . '/../lib.php');

/**
 * Hook callbacks for conditional JS/CSS injection.
 */
class hook_callbacks {

    /**
     * Conditionally inject Writer View JS and configuration.
     *
     * @param \core\hook\output\before_standard_head_html_generation $hook
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

        // Gate 3: Check if Writer View is enabled for this assignment.
        if (!local_writerview_is_enabled($cmid)) {
            return;
        }

        // Gather data for the JS module.
        $cm = get_coursemodule_from_id('assign', $cmid, 0, false, MUST_EXIST);

        $userfullname = fullname($USER);

        $assign = $DB->get_record('assign', ['id' => $cm->instance], 'id, name, intro, introformat', MUST_EXIST);
        $description = format_text(
            $assign->intro,
            $assign->introformat,
            ['context' => $context, 'noclean' => false]
        );

        $submission = $DB->get_record('assign_submission', [
            'assignment' => $assign->id,
            'userid' => $USER->id,
            'latest' => 1,
        ]);
        $statustext = $submission ? $submission->status : 'new';

        $jsconfig = [
            'cmid' => $cmid,
            'studentName' => $userfullname,
            'description' => $description,
            'assignmentName' => format_string($assign->name, true, ['context' => $context]),
            'submissionStatus' => $statustext,
            'strings' => [
                'studentinfo' => get_string('sidebar_studentinfo', 'local_writerview'),
                'description' => get_string('sidebar_description', 'local_writerview'),
                'status' => get_string('sidebar_status', 'local_writerview'),
                'wordcount' => get_string('sidebar_wordcount', 'local_writerview'),
                'togglesidebar' => get_string('sidebar_toggle', 'local_writerview'),
            ],
        ];

        $PAGE->requires->js_call_amd(
            'local_writerview/writerview',
            'init',
            [$jsconfig]
        );
    }
}
