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
    var wordCountInterval = null;
    var dueDateInterval = null;

    function init(cfg) {
        config = cfg;
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setup);
        } else {
            setup();
        }
    }

    function setup() {
        document.body.classList.add('writerview-active');
        waitForEditor(function() {
            rearrangeDOM();
            startWordCount();
            if (config.dueDate > 0) {
                startDueDateTimer();
            }
        });
    }

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

        hideOriginalDescription();
    }

    // ===================== SIDEBAR =====================

    function buildSidebar() {
        var sidebar = document.createElement('div');
        sidebar.className = 'writerview-sidebar';
        sidebar.setAttribute('role', 'complementary');
        sidebar.setAttribute('aria-label', config.strings.arialabel);

        var toggleBtn = document.createElement('button');
        toggleBtn.className = 'wv-toggle-btn';
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

        // Static sections (always visible).
        var statusCard = buildCard(config.strings.status);
        statusCard.appendChild(buildStatusContent());
        bodyEl.appendChild(statusCard);

        var descCard = buildCard(config.strings.description);
        var descBody = el('div', 'wv-card-body');
        descBody.innerHTML = config.description;
        descCard.appendChild(descBody);
        bodyEl.appendChild(descCard);

        // Rubric — opens as slide-over panel, not inline.
        if (config.rubricHtml) {
            bodyEl.appendChild(buildRubricTrigger());
            buildRubricPanel();
        }

        sidebar.appendChild(bodyEl);
        return {sidebar: sidebar};
    }

    // ===================== CARDS =====================

    function buildWordCountCard() {
        var card = el('div', 'wv-card wv-wordcount-card');
        var label = el('div', 'wv-card-label');
        label.textContent = config.strings.wordcount;
        var value = el('div', 'wv-wordcount-value');
        value.id = 'writerview-wordcount';
        value.textContent = '0';
        card.appendChild(label);
        card.appendChild(value);
        return card;
    }

    function buildDueDateCard() {
        var card = el('div', 'wv-card wv-duedate-card');
        var label = el('div', 'wv-card-label');
        label.textContent = config.strings.duedate;

        var dateStr = el('div', 'wv-duedate-date');
        var d = new Date(config.dueDate * 1000);
        dateStr.textContent = d.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });

        var timer = el('div', 'wv-duedate-timer');
        timer.id = 'writerview-timer';
        timer.textContent = formatTimeRemaining(config.dueDate);

        card.appendChild(label);
        card.appendChild(dateStr);
        card.appendChild(timer);
        return card;
    }

    function buildCard(title) {
        var card = el('div', 'wv-card');
        var label = el('div', 'wv-card-label');
        label.textContent = title;
        card.appendChild(label);
        return card;
    }

    function buildCollapsibleCard(title, contentEl, startOpen) {
        var card = el('div', 'wv-card wv-collapsible');
        var header = el('div', 'wv-collapsible-header');

        var label = el('div', 'wv-card-label');
        label.textContent = title;
        label.style.marginBottom = '0';

        var toggle = el('button', 'wv-section-toggle');
        toggle.type = 'button';
        toggle.textContent = startOpen ? config.strings.hide : config.strings.show;

        var body = el('div', 'wv-collapsible-body');
        body.appendChild(contentEl);
        body.style.display = startOpen ? 'block' : 'none';

        toggle.addEventListener('click', function() {
            var visible = body.style.display !== 'none';
            body.style.display = visible ? 'none' : 'block';
            toggle.textContent = visible ? config.strings.show : config.strings.hide;
        });

        header.appendChild(label);
        header.appendChild(toggle);
        card.appendChild(header);
        card.appendChild(body);
        return card;
    }

    function buildStatusContent() {
        var badge = el('span', 'wv-status-badge wv-status-' + config.submissionStatus);
        badge.textContent = formatStatus(config.submissionStatus);
        return badge;
    }

    function buildTextContent(text) {
        var div = el('div', 'wv-card-body');
        div.textContent = text;
        return div;
    }

    function buildHtmlContent(html) {
        var div = el('div', 'wv-card-body');
        div.innerHTML = html;
        return div;
    }

    // ===================== RUBRIC SLIDE-OVER =====================

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

    // ===================== DUE DATE TIMER =====================

    function startDueDateTimer() {
        dueDateInterval = setInterval(function() {
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

    function formatStatus(status) {
        var statusMap = {
            'new': config.strings.statusnew,
            'draft': config.strings.statusdraft,
            'submitted': config.strings.statussubmitted,
            'reopened': config.strings.statusreopened
        };
        return statusMap[status] || status;
    }

    function el(tag, className) {
        var node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        return node;
    }

    function chevronLeft() {
        return '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">' +
            '<path d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708' +
            'l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/></svg>';
    }

    function chevronRight() {
        return '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">' +
            '<path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1' +
            '-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/></svg>';
    }

    function hideOriginalDescription() {
        ['.activity-description', '#intro'].forEach(function(sel) {
            var node = document.querySelector(sel);
            if (node) {
                node.classList.add('writerview-hidden-original');
            }
        });
    }

    // ===================== WORD COUNT =====================

    function startWordCount() {
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
        wordCountInterval = setInterval(updateCount, 2000);
        tryAttachEditorListener(updateCount);
    }

    function tryAttachEditorListener(updateFn) {
        var iframe = document.querySelector('.tox-tinymce iframe');
        if (!iframe || !iframe.contentDocument || !iframe.contentDocument.body) {
            return;
        }
        iframe.contentDocument.body.addEventListener('input', updateFn);
    }

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
