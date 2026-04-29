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

    var config = null;

    /**
     * Entry point. Stores config and schedules setup() once the DOM is ready.
     *
     * @param {object} cfg Configuration payload from PHP via js_call_amd.
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
     * Activate writer view: tag the body, wait for the editor, then rearrange
     * the DOM and start the periodic timers/observers.
     */
    function setup() {
        document.body.classList.add('writerview-active');
        waitForEditor(function() {
            rearrangeDOM();
            installDeclarationField();
            fitEditorToViewport();
            startWordCount();
            if (config.dueDate > 0) {
                startDueDateTimer();
            }
        });
    }

    /**
     * Poll for the TinyMCE editor element and run callback once it appears.
     * Gives up silently after ~10 seconds.
     *
     * @param {Function} callback Invoked once the editor is detected.
     */
    function waitForEditor(callback) {
        var attempts = 0;
        var interval = setInterval(function() {
            attempts++;
            if (document.querySelector('.tox-tinymce')) {
                clearInterval(interval);
                callback();
            } else if (attempts >= 100) {
                clearInterval(interval);
            }
        }, 100);
    }

    /**
     * Tag form children for grid placement, build and append the sidebar,
     * relocate Save/Cancel into the sidebar's toggle bar, hide redundant
     * Moodle-rendered description blocks.
     */
    function rearrangeDOM() {
        var form = document.querySelector('#page-content div[role="main"] .mform');
        if (!form) {
            return;
        }

        Array.from(form.children).forEach(function(child) {
            if (child.nodeType === 1) {
                child.classList.add('writerview-editor-child');
            }
        });

        var sidebarResult = buildSidebar();
        form.appendChild(sidebarResult.sidebar);

        // Move Save/Cancel buttons into the sidebar toggle bar.
        var buttonGroup = form.querySelector('#fgroup_id_buttonar');
        if (buttonGroup && sidebarResult.toggleBar) {
            var buttons = buttonGroup.querySelectorAll('.btn');
            buttons.forEach(function(btn) {
                btn.classList.add('btn-sm');
                sidebarResult.toggleBar.insertBefore(btn, sidebarResult.toggleBar.firstChild);
            });
            buttonGroup.classList.add('writerview-hidden-original');
        }

        hideOriginalDescription();
    }

    // ===================== FIT EDITOR =====================

    /**
     * Resize the TinyMCE editor and the sidebar body to fit the viewport,
     * preserving a non-scrolling page layout. Re-runs on window resize and
     * whenever content above the editor changes height — e.g. Moodle inserts
     * a notice banner like the late-submission warning, which would otherwise
     * push the editor's bottom below the viewport with no way to scroll to it
     * (#page-content has overflow: hidden by design).
     */
    function fitEditorToViewport() {
        var tinyEl = document.querySelector('.tox-tinymce');
        if (!tinyEl) {
            return;
        }

        var sidebar = document.querySelector('.writerview-sidebar');
        var sidebarBody = document.querySelector('.wv-sidebar-body');
        var rafPending = false;

        /**
         * Recompute heights for the editor and sidebar based on viewport.
         * Coalesced via requestAnimationFrame so observer storms collapse
         * into a single measurement after layout settles.
         */
        function resize() {
            if (rafPending) {
                return;
            }
            rafPending = true;
            window.requestAnimationFrame(function() {
                rafPending = false;
                doResize();
            });
        }

        /**
         * Perform the actual size calculation.
         */
        function doResize() {
            var rect = tinyEl.getBoundingClientRect();
            var available = window.innerHeight - rect.top - 8;
            if (available > 200) {
                tinyEl.style.height = available + 'px';
                tinyEl.style.minHeight = available + 'px';
            }

            // Size the sidebar wrapper from its live position so it tracks
            // any banner above it (no hard-coded header offset).
            if (sidebar) {
                var sidebarRect = sidebar.getBoundingClientRect();
                var sidebarAvailable = window.innerHeight - sidebarRect.top - 8;
                if (sidebarAvailable > 100) {
                    sidebar.style.maxHeight = sidebarAvailable + 'px';
                }
            }

            // Match sidebar body bottom to editor bottom.
            if (sidebarBody) {
                var sbRect = sidebarBody.getBoundingClientRect();
                var editorBottom = rect.top + available;
                var bodyAvailable = editorBottom - sbRect.top;
                if (bodyAvailable > 100) {
                    sidebarBody.style.maxHeight = bodyAvailable + 'px';
                }
            }
        }

        resize();
        window.addEventListener('resize', resize);

        // Watch for size changes in regions that sit above the editor: the
        // page header (collapses, breadcrumbs wrap) and #page-content (alert
        // banners appear/disappear/wrap to multiple lines).
        if (typeof ResizeObserver === 'function') {
            var ro = new ResizeObserver(resize);
            var header = document.getElementById('page-header');
            var pageContent = document.getElementById('page-content');
            if (header) {
                ro.observe(header);
            }
            if (pageContent) {
                ro.observe(pageContent);
            }
        }

        // Watch for nodes inserted above the editor (Moodle's
        // \core\notification renders into #user-notifications or directly
        // into #page-content). ResizeObserver alone misses the case where a
        // banner is added but the parent's box doesn't change synchronously.
        if (typeof MutationObserver === 'function') {
            var mo = new MutationObserver(resize);
            var moTarget = document.getElementById('page-content');
            if (moTarget) {
                mo.observe(moTarget, {childList: true, subtree: true});
            }
        }
    }

    // ===================== SIDEBAR =====================

    /**
     * Build the right-side sidebar element with toggle bar and content cards.
     *
     * @return {{sidebar: HTMLElement, toggleBar: HTMLElement}} Sidebar wrapper and toggle bar.
     */
    function buildSidebar() {
        var sidebar = document.createElement('div');
        sidebar.className = 'writerview-sidebar';
        sidebar.setAttribute('role', 'complementary');
        sidebar.setAttribute('aria-label', config.strings.arialabel);

        var toggleBtn = document.createElement('button');
        toggleBtn.className = 'wv-toggle-btn btn btn-secondary btn-sm';
        toggleBtn.type = 'button';
        toggleBtn.textContent = config.strings.hidedetails;
        toggleBtn.setAttribute('aria-expanded', 'true');

        var bodyEl = document.createElement('div');
        bodyEl.className = 'wv-sidebar-body';

        toggleBtn.addEventListener('click', function() {
            var isCollapsed = sidebar.classList.toggle('collapsed');
            toggleBtn.textContent = isCollapsed
                ? config.strings.showdetails
                : config.strings.hidedetails;
            toggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
        });

        var toggleBar = el('div', 'wv-toggle-bar');
        toggleBar.appendChild(toggleBtn);
        sidebar.appendChild(toggleBar);

        // Word count — always visible at top.
        bodyEl.appendChild(buildWordCountCard());

        // Due date + timer (if set).
        if (config.dueDate > 0) {
            bodyEl.appendChild(buildDueDateCard());
        }

        // Time limit card — mirrors Moodle's block drawer timer if present.
        var moodleTimer = document.querySelector('[id^="mod_assign-timer-"]');
        if (moodleTimer) {
            bodyEl.appendChild(buildTimeLimitCard(moodleTimer));
        }

        // Status — compact inline card.
        var statusCard = el('div', 'wv-card wv-status-card');
        var statusLabel = el('div', 'wv-card-label');
        statusLabel.textContent = config.strings.status;
        statusLabel.style.marginBottom = '0';
        statusCard.appendChild(statusLabel);
        statusCard.appendChild(buildStatusContent());
        bodyEl.appendChild(statusCard);

        var descCard = buildCard(config.strings.description);
        var descBody = el('div', 'wv-card-body');
        descBody.innerHTML = config.description;
        descCard.appendChild(descBody);
        bodyEl.appendChild(descCard);

        // Activity instructions (if set by teacher).
        if (config.instructions) {
            var instrCard = buildCard(config.strings.instructions);
            var instrBody = el('div', 'wv-card-body');
            instrBody.innerHTML = config.instructions;
            instrCard.appendChild(instrBody);
            bodyEl.appendChild(instrCard);
        }

        // Rubric — opens as slide-over panel, not inline.
        if (config.rubricHtml) {
            bodyEl.appendChild(buildRubricTrigger());
            buildRubricPanel();
        }

        sidebar.appendChild(bodyEl);
        return {sidebar: sidebar, toggleBar: toggleBar};
    }

    // ===================== CARDS =====================

    /**
     * Build the live word-count card.
     *
     * @return {HTMLElement} Card element.
     */
    function buildWordCountCard() {
        var card = el('div', 'wv-card wv-wordcount-card');
        var label = el('div', 'wv-card-label');
        label.textContent = config.strings.wordcount;
        label.style.marginBottom = '0';
        var value = el('div', 'wv-wordcount-value');
        value.id = 'writerview-wordcount';
        value.textContent = '0';
        card.appendChild(label);
        card.appendChild(value);
        return card;
    }

    /**
     * Build the due-date countdown card.
     *
     * @return {HTMLElement} Card element.
     */
    function buildDueDateCard() {
        var card = el('div', 'wv-card wv-duedate-card');
        var label = el('div', 'wv-card-label');
        label.textContent = config.strings.duedate;
        label.style.marginBottom = '0';

        var timer = el('div', 'wv-duedate-timer');
        timer.id = 'writerview-timer';
        timer.textContent = formatTimeRemaining(config.dueDate);
        timer.title = new Date(config.dueDate * 1000).toLocaleString();

        card.appendChild(label);
        card.appendChild(timer);
        return card;
    }

    /**
     * Build the time-limit card and start polling Moodle's timer block.
     *
     * @param {HTMLElement} moodleTimerEl The original Moodle timer DOM node.
     * @return {HTMLElement} Card element.
     */
    function buildTimeLimitCard(moodleTimerEl) {
        var card = el('div', 'wv-card wv-timelimit-card');
        var label = el('div', 'wv-card-label');
        label.textContent = config.strings.timelimit;
        label.style.marginBottom = '0';

        var display = el('div', 'wv-timelimit-value');
        display.id = 'writerview-timelimit';
        display.textContent = moodleTimerEl.textContent.trim() || '—';

        card.appendChild(label);
        card.appendChild(display);

        // Poll the Moodle timer element every second and mirror its text.
        setInterval(function() {
            var text = moodleTimerEl.textContent.trim();
            if (text && display.textContent !== text) {
                display.textContent = text;
            }
        }, 1000);

        return card;
    }

    /**
     * Build a generic titled card with no body content.
     *
     * @param {string} title Title text for the card label.
     * @return {HTMLElement} Card element.
     */
    function buildCard(title) {
        var card = el('div', 'wv-card');
        var label = el('div', 'wv-card-label');
        label.textContent = title;
        card.appendChild(label);
        return card;
    }

    /**
     * Build the submission-status badge for the status card.
     *
     * @return {HTMLElement} Badge span.
     */
    function buildStatusContent() {
        var badge = el('span', 'wv-status-badge wv-status-' + config.submissionStatus);
        badge.textContent = formatStatus(config.submissionStatus);
        return badge;
    }

    // ===================== RUBRIC SLIDE-OVER =====================

    /**
     * Build the rubric "Show" trigger card placed in the sidebar.
     *
     * @return {HTMLElement} Card element.
     */
    function buildRubricTrigger() {
        var card = el('div', 'wv-card wv-rubric-trigger');
        var header = el('div', 'wv-collapsible-header');

        var label = el('div', 'wv-card-label');
        label.textContent = config.strings.rubric;
        label.style.marginBottom = '0';

        var btn = el('button', 'wv-section-toggle');
        btn.type = 'button';
        btn.textContent = config.strings.show;
        btn.addEventListener('click', function() {
            var panel = document.getElementById('wv-rubric-panel');
            if (panel) {
                panel.classList.add('open');
            }
        });

        header.appendChild(label);
        header.appendChild(btn);
        card.appendChild(header);
        return card;
    }

    /**
     * Build the rubric slide-over panel (backdrop + side panel) and append to body.
     */
    function buildRubricPanel() {
        // Backdrop.
        var backdrop = el('div', 'wv-rubric-backdrop');
        backdrop.id = 'wv-rubric-backdrop';
        backdrop.addEventListener('click', closeRubricPanel);

        // Panel.
        var panel = el('div', 'wv-rubric-panel');
        panel.id = 'wv-rubric-panel';

        var panelHeader = el('div', 'wv-rubric-panel-header');
        var panelTitle = el('h3', '');
        panelTitle.textContent = config.strings.rubric;

        var closeBtn = el('button', 'wv-rubric-close');
        closeBtn.type = 'button';
        closeBtn.innerHTML = '&times;';
        closeBtn.setAttribute('aria-label', config.strings.hide);
        closeBtn.addEventListener('click', closeRubricPanel);

        panelHeader.appendChild(panelTitle);
        panelHeader.appendChild(closeBtn);

        var panelBody = el('div', 'wv-rubric-panel-body');
        panelBody.innerHTML = config.rubricHtml;

        panel.appendChild(panelHeader);
        panel.appendChild(panelBody);

        document.body.appendChild(backdrop);
        document.body.appendChild(panel);
    }

    /**
     * Close the rubric slide-over panel and its backdrop.
     */
    function closeRubricPanel() {
        var panel = document.getElementById('wv-rubric-panel');
        var backdrop = document.getElementById('wv-rubric-backdrop');
        if (panel) {
            panel.classList.remove('open');
        }
        if (backdrop) {
            backdrop.classList.remove('open');
        }
    }

    // ===================== ASSIGNMENT DECLARATION =====================

    /**
     * Build the submission-statement declaration UI: a compact sidebar card
     * (checked state) plus a modal overlay (unchecked state). Persistence is
     * via localStorage so the modal stops re-prompting after the student
     * agrees once on this device.
     */
    function installDeclarationField() {
        var checkbox = document.getElementById('id_submissionstatement');
        var sidebarBody = document.querySelector('.wv-sidebar-body');
        if (!checkbox || !sidebarBody) {
            return;
        }

        var stmtLabel = document.querySelector('label[for="id_submissionstatement"]');
        var stmtHtml = stmtLabel ? stmtLabel.innerHTML : '';

        // Find the nearest form-row wrapper to hide. Moodle's wrapper ID/class varies
        // across versions (fitem_id_submissionstatement, .fitem, .form-group, etc.),
        // so walk up the DOM rather than rely on a single selector.
        var fitem = checkbox.closest('[id^="fitem_id_submission"]')
                 || checkbox.closest('.fitem')
                 || checkbox.closest('.form-group')
                 || checkbox.parentElement;
        if (fitem) {
            fitem.classList.add('writerview-hidden-original');
        }

        var card = el('div', 'wv-card wv-decl-card');

        // Move the real checkbox into the card. Sidebar is inside <form>, so POST is unaffected.
        checkbox.classList.add('wv-decl-checkbox');
        checkbox.setAttribute('aria-label', config.strings.decltitle);
        card.appendChild(checkbox);

        // Title doubles as the "view" trigger — clicking it re-opens the modal.
        var titleBtn = el('button', 'wv-decl-title-btn');
        titleBtn.type = 'button';
        titleBtn.textContent = config.strings.decltitle;
        card.appendChild(titleBtn);

        sidebarBody.insertBefore(card, sidebarBody.firstChild);

        // Modal.
        var backdrop = el('div', 'wv-decl-backdrop');
        backdrop.id = 'wv-decl-backdrop';

        var modal = el('div', 'wv-decl-modal');
        modal.id = 'wv-decl-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'wv-decl-modal-title');

        var header = el('div', 'wv-decl-modal-header');
        var titleH = el('h3', 'wv-decl-modal-title');
        titleH.id = 'wv-decl-modal-title';
        titleH.textContent = config.strings.decltitle;
        header.appendChild(titleH);

        var bodyEl = el('div', 'wv-decl-modal-body');
        bodyEl.innerHTML = stmtHtml;

        var footer = el('div', 'wv-decl-modal-footer');
        var cancelBtn = el('button', 'btn btn-secondary wv-decl-cancel');
        cancelBtn.type = 'button';
        cancelBtn.textContent = config.strings.declcancel;

        var agreeBtn = el('button', 'btn btn-primary wv-decl-agree');
        agreeBtn.type = 'button';
        agreeBtn.textContent = config.strings.declagree;

        footer.appendChild(cancelBtn);
        footer.appendChild(agreeBtn);

        modal.appendChild(header);
        modal.appendChild(bodyEl);
        modal.appendChild(footer);

        document.body.appendChild(backdrop);
        document.body.appendChild(modal);

        var storageKey = 'local_writerview_agreed_' + config.cmid + '_' + config.userId;

        /**
         * Read the persisted "agreed" flag from localStorage.
         *
         * @return {boolean} True if the student has previously agreed on this device.
         */
        function readAgreed() {
            try {
                return localStorage.getItem(storageKey) === '1';
            } catch (e) {
                return false;
            }
        }

        /**
         * Persist (or clear) the "agreed" flag. Silently ignores localStorage failures
         * (private browsing, quota exceeded, etc.).
         *
         * @param {boolean} v True to mark agreed, false to clear.
         */
        function writeAgreed(v) {
            try {
                if (v) {
                    localStorage.setItem(storageKey, '1');
                } else {
                    localStorage.removeItem(storageKey);
                }
            } catch (e) {
                // Private browsing or quota exceeded — non-fatal.
            }
        }

        /**
         * Show the declaration modal and lock background interaction via body class.
         */
        function openModal() {
            modal.classList.add('open');
            backdrop.classList.add('open');
            document.body.classList.add('wv-decl-modal-open');
        }

        /**
         * Hide the declaration modal and unlock background interaction.
         */
        function closeModal() {
            modal.classList.remove('open');
            backdrop.classList.remove('open');
            document.body.classList.remove('wv-decl-modal-open');
        }

        /**
         * Drive UI from the current checkbox state: checked closes the modal and
         * marks agreed; unchecked clears the flag and reopens the modal.
         */
        function reflectState() {
            if (checkbox.checked) {
                card.classList.add('wv-decl-checked');
                card.classList.remove('wv-decl-unchecked');
                writeAgreed(true);
                closeModal();
            } else {
                card.classList.add('wv-decl-unchecked');
                card.classList.remove('wv-decl-checked');
                writeAgreed(false);
                openModal();
            }
        }

        checkbox.addEventListener('change', reflectState);

        agreeBtn.addEventListener('click', function() {
            if (!checkbox.checked) {
                checkbox.checked = true;
                checkbox.dispatchEvent(new Event('change', {bubbles: true}));
            } else {
                closeModal();
            }
        });

        cancelBtn.addEventListener('click', function() {
            // Close without agreeing; checkbox stays in current state.
            closeModal();
        });

        backdrop.addEventListener('click', function() {
            closeModal();
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && modal.classList.contains('open')) {
                closeModal();
            }
        });

        titleBtn.addEventListener('click', function() {
            // Title acts as the "view" trigger — re-open the modal regardless of state.
            openModal();
        });

        // Block form submit if unchecked: pop the modal instead of letting it slip through.
        var form = checkbox.closest('form');
        if (form) {
            form.addEventListener('submit', function(e) {
                if (!checkbox.checked) {
                    e.preventDefault();
                    e.stopPropagation();
                    openModal();
                }
            }, true);
        }

        // Initial state. If localStorage says agreed, sync the checkbox first.
        if (readAgreed() && !checkbox.checked) {
            checkbox.checked = true;
        }

        // Drive UI from the actual checkbox state (covers both branches).
        if (checkbox.checked) {
            card.classList.add('wv-decl-checked');
            writeAgreed(true);
        } else {
            card.classList.add('wv-decl-unchecked');
            openModal();
        }
    }

    // ===================== DUE DATE TIMER =====================

    /**
     * Start a 1-second interval that updates the due-date timer text and adds
     * the overdue class once the deadline has passed.
     */
    function startDueDateTimer() {
        setInterval(function() {
            var display = document.getElementById('writerview-timer');
            if (display) {
                display.textContent = formatTimeRemaining(config.dueDate);
                var now = Math.floor(Date.now() / 1000);
                if (config.dueDate < now) {
                    display.classList.add('wv-overdue');
                }
            }
        }, 1000);
    }

    /**
     * Format seconds remaining to a deadline as a compact human string
     * (e.g. "1d 4h 30m"). Returns the localized "overdue" string when negative.
     *
     * @param {number} dueTimestamp Unix timestamp of the deadline.
     * @return {string} Formatted countdown.
     */
    function formatTimeRemaining(dueTimestamp) {
        var now = Math.floor(Date.now() / 1000);
        var diff = dueTimestamp - now;

        if (diff <= 0) {
            return config.strings.overdue;
        }

        var days = Math.floor(diff / 86400);
        var hours = Math.floor((diff % 86400) / 3600);
        var mins = Math.floor((diff % 3600) / 60);
        var secs = diff % 60;

        if (days > 0) {
            return days + 'd ' + hours + 'h ' + mins + 'm';
        }
        if (hours > 0) {
            return hours + 'h ' + mins + 'm ' + secs + 's';
        }
        return mins + 'm ' + secs + 's';
    }

    // ===================== UTILITIES =====================

    /**
     * Map a submission-status code to its localized label.
     *
     * @param {string} status mod_assign status code (new/draft/submitted/reopened).
     * @return {string} Localized status label, or the raw code if unknown.
     */
    function formatStatus(status) {
        var statusMap = {
            'new': config.strings.statusnew,
            'draft': config.strings.statusdraft,
            'submitted': config.strings.statussubmitted,
            'reopened': config.strings.statusreopened
        };
        return statusMap[status] || status;
    }

    /**
     * Create an element with an optional class name.
     *
     * @param {string} tag HTML tag name.
     * @param {string} [className] Optional class name.
     * @return {HTMLElement} The created element.
     */
    function el(tag, className) {
        var node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        return node;
    }

    /**
     * Hide Moodle-rendered description and due-date blocks above the editor,
     * since the sidebar shows the same information.
     */
    function hideOriginalDescription() {
        ['.activity-description', '#intro'].forEach(function(sel) {
            var node = document.querySelector(sel);
            if (node) {
                node.classList.add('writerview-hidden-original');
            }
        });

        // Hide the due date bar if we show it in the sidebar.
        if (config.dueDate > 0) {
            var dateNodes = document.querySelectorAll(
                '.activity-dates, [data-region="activity-dates"]'
            );
            dateNodes.forEach(function(node) {
                node.classList.add('writerview-hidden-original');
            });

            // Also check for the inline "Due:" text in the activity header.
            var headers = document.querySelectorAll('.activity-header div, .activity-header p');
            headers.forEach(function(node) {
                if (node.textContent && node.textContent.trim().indexOf('Due:') === 0) {
                    node.classList.add('writerview-hidden-original');
                }
            });
        }
    }

    // ===================== WORD COUNT =====================

    /**
     * Start the word-count poll/observer. Updates the sidebar's word-count
     * display every 2 seconds and on every editor input event.
     */
    function startWordCount() {
        /**
         * Read the editor body's text and update the sidebar word-count display.
         */
        function updateCount() {
            var iframe = document.querySelector('.tox-tinymce iframe');
            if (!iframe || !iframe.contentDocument) {
                return;
            }
            var body = iframe.contentDocument.body;
            if (!body) {
                return;
            }
            var text = body.innerText || body.textContent || '';
            var count = countWords(text);
            var display = document.getElementById('writerview-wordcount');
            if (display) {
                display.textContent = count;
            }
        }

        updateCount();
        setInterval(updateCount, 2000);
        tryAttachEditorListener(updateCount);
    }

    /**
     * Best-effort attach an input listener to the TinyMCE iframe body so word
     * counts update immediately on keystroke. No-op if the iframe isn't ready.
     *
     * @param {Function} updateFn Callback to invoke on input.
     */
    function tryAttachEditorListener(updateFn) {
        var iframe = document.querySelector('.tox-tinymce iframe');
        if (!iframe || !iframe.contentDocument || !iframe.contentDocument.body) {
            return;
        }
        iframe.contentDocument.body.addEventListener('input', updateFn);
    }

    /**
     * Count whitespace-separated words in a string.
     *
     * @param {string} text Source text.
     * @return {number} Word count (0 for empty/whitespace-only input).
     */
    function countWords(text) {
        var trimmed = text.trim();
        if (trimmed.length === 0) {
            return 0;
        }
        return trimmed.split(/\s+/).length;
    }

    return {
        init: init
    };
});
