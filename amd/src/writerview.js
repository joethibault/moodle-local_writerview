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
 * Writer View DOM manipulation module.
 *
 * @module     local_writerview/writerview
 * @copyright  2026 Cursive Technology
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define([], function() {
    'use strict';

    /** @type {Object} Module configuration passed from PHP. */
    let config = null;

    /** @type {number|null} Word count update interval ID. */
    let wordCountInterval = null;

    /**
     * Initialize Writer View.
     *
     * @param {Object} cfg Configuration from PHP hook_callbacks.
     */
    function init(cfg) {
        config = cfg;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setup);
        } else {
            setup();
        }
    }

    /**
     * Main setup routine.
     */
    function setup() {
        document.body.classList.add('writerview-active');
        waitForEditor(function(editorContainer) {
            rearrangeDOM(editorContainer);
            startWordCount();
        });
    }

    /**
     * Poll for TinyMCE editor to be present in the DOM.
     *
     * @param {Function} callback Called with the editor container element.
     */
    function waitForEditor(callback) {
        let attempts = 0;
        const maxAttempts = 100;
        const interval = setInterval(function() {
            attempts++;
            const editor = document.querySelector('.tox-tinymce');
            if (editor) {
                clearInterval(interval);
                callback(editor);
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
                window.console.warn('[WriterView] TinyMCE editor not found after 10s. Aborting.');
            }
        }, 100);
    }

    /**
     * Rearrange the DOM to create the Writer View layout.
     *
     * @param {HTMLElement} editorContainer The .tox-tinymce element.
     */
    function rearrangeDOM(editorContainer) {
        const form = document.querySelector(
            '#page-content div[role="main"] .mform'
        );
        if (!form) {
            window.console.warn('[WriterView] .mform not found. Aborting.');
            return;
        }

        // Create the editor region wrapper.
        const editorRegion = document.createElement('div');
        editorRegion.className = 'writerview-editor-region';

        // Move all existing form children into the editor region.
        const children = Array.from(form.children);
        children.forEach(function(child) {
            editorRegion.appendChild(child);
        });

        // Build the sidebar.
        const sidebar = buildSidebar();

        // Append both regions to the form.
        form.appendChild(editorRegion);
        form.appendChild(sidebar);

        // Hide the original assignment description on the page.
        hideOriginalDescription();
    }

    /**
     * Build the sidebar DOM structure.
     *
     * @returns {HTMLElement} The sidebar element.
     */
    function buildSidebar() {
        const sidebar = document.createElement('div');
        sidebar.className = 'writerview-sidebar';
        sidebar.setAttribute('role', 'complementary');
        sidebar.setAttribute('aria-label', config.strings.togglesidebar);

        // Toggle button.
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'writerview-sidebar-toggle';
        toggleBtn.type = 'button';
        toggleBtn.setAttribute('aria-label', config.strings.togglesidebar);
        toggleBtn.setAttribute('aria-expanded', 'true');
        toggleBtn.textContent = '\u00BB';
        toggleBtn.addEventListener('click', function() {
            const isCollapsed = sidebar.classList.toggle('collapsed');
            toggleBtn.textContent = isCollapsed ? '\u00AB' : '\u00BB';
            toggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
        });
        sidebar.appendChild(toggleBtn);

        // Scrollable content wrapper.
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'writerview-sidebar-content';

        // Section 1: Student Information.
        contentWrapper.appendChild(
            buildSection(config.strings.studentinfo, config.studentName)
        );

        // Section 2: Assignment Description (HTML content).
        const descSection = buildSection(config.strings.description, '');
        descSection.querySelector('.section-content').innerHTML = config.description;
        contentWrapper.appendChild(descSection);

        // Section 3: Submission Status.
        contentWrapper.appendChild(
            buildSection(config.strings.status, formatStatus(config.submissionStatus))
        );

        // Section 4: Word Count.
        const wcSection = buildSection(config.strings.wordcount, '');
        const wcValue = document.createElement('span');
        wcValue.className = 'writerview-wordcount-value';
        wcValue.id = 'writerview-wordcount';
        wcValue.textContent = '0';
        wcSection.querySelector('.section-content').appendChild(wcValue);
        contentWrapper.appendChild(wcSection);

        sidebar.appendChild(contentWrapper);
        return sidebar;
    }

    /**
     * Build a single sidebar section.
     *
     * @param {string} title Section heading.
     * @param {string} content Text content.
     * @returns {HTMLElement} The section element.
     */
    function buildSection(title, content) {
        const section = document.createElement('div');
        section.className = 'writerview-sidebar-section';

        const heading = document.createElement('h4');
        heading.textContent = title;
        section.appendChild(heading);

        const body = document.createElement('div');
        body.className = 'section-content';
        if (content) {
            body.textContent = content;
        }
        section.appendChild(body);

        return section;
    }

    /**
     * Format the submission status string for display.
     *
     * @param {string} status Raw status from the database.
     * @returns {string} Human-readable status.
     */
    function formatStatus(status) {
        const statusMap = {
            'new': 'Not yet submitted',
            'draft': 'Draft (not submitted)',
            'submitted': 'Submitted for grading',
            'reopened': 'Reopened',
        };
        return statusMap[status] || status;
    }

    /**
     * Hide the original assignment description above the form.
     */
    function hideOriginalDescription() {
        const selectors = [
            '.activity-description',
            '#intro',
        ];
        selectors.forEach(function(sel) {
            const el = document.querySelector(sel);
            if (el) {
                el.classList.add('writerview-hidden-original');
            }
        });
    }

    /**
     * Start the word count updater.
     */
    function startWordCount() {
        /**
         * Read TinyMCE content and update the word count display.
         */
        function updateCount() {
            const iframe = document.querySelector('.tox-tinymce iframe');
            if (!iframe || !iframe.contentDocument) {
                return;
            }
            const body = iframe.contentDocument.body;
            if (!body) {
                return;
            }
            const text = body.innerText || body.textContent || '';
            const count = countWords(text);
            const display = document.getElementById('writerview-wordcount');
            if (display) {
                display.textContent = count;
            }
        }

        updateCount();

        wordCountInterval = setInterval(updateCount, 2000);

        // Attach direct listener for real-time updates.
        tryAttachEditorListener(updateCount);
    }

    /**
     * Attach input listener to the TinyMCE editor body.
     *
     * @param {Function} updateFn The word count update function.
     */
    function tryAttachEditorListener(updateFn) {
        const iframe = document.querySelector('.tox-tinymce iframe');
        if (!iframe || !iframe.contentDocument || !iframe.contentDocument.body) {
            return;
        }
        iframe.contentDocument.body.addEventListener('input', updateFn);
    }

    /**
     * Count words in a text string.
     *
     * @param {string} text The text to count.
     * @returns {number} Word count.
     */
    function countWords(text) {
        const trimmed = text.trim();
        if (trimmed.length === 0) {
            return 0;
        }
        return trimmed.split(/\s+/).length;
    }

    return {
        init: init,
    };
});
