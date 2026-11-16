import { allPrototypes } from './prototypes.js';
import {
    SETTINGS,
    state,
    saveCurrentState,
    saveCustomPrototypes,
    saveSidebarSectionsState,
    saveShowConstraintsOverlay,
    loadFromStorage
} from './state.js';
import {
    DAY_KEYS,
    timeToMinutes,
    minutesToTime,
    resolveTimeWindowForDay,
    resolveMealForDay,
    isEntryTeaching,
    isBlockTitleTeaching,
    getBlockColors,
    evaluateScheduleConstraints,
    downloadJsonFile
} from './utils.js';
import {
    getActiveCalendar,
    renderSemesterSimulation,
    applySimulatorUrlParams,
    initSimulator
} from './simulator.js';
import {
    initModals,
    openEditModal,
    openConstraintsModal
} from './modals.js';

function startApp() {
    // Sidebar & Accordion DOM
    const sectionPalette = document.getElementById('section-palette');
    const togglePaletteBtn = document.getElementById('toggle-palette-section');
    const paletteBody = document.getElementById('palette-section-body');

    const sectionWishes = document.getElementById('section-wishes');
    const toggleWishesBtn = document.getElementById('toggle-wishes-section');
    const wishesBody = document.getElementById('wishes-section-body');

    // Topbar & Builder DOM
    const paletteEl = document.getElementById('unified-palette') || document.getElementById('block-palette');
    const timeAxisEl = document.getElementById('time-axis');
    const protoSelect = document.getElementById('prototype-select');
    const btnCopyLink = document.getElementById('btn-copy-link');
    const titleDisplay = document.getElementById('schedule-title-display');
    const notesTextarea = document.getElementById('schedule-notes');
    const statusBadge = document.getElementById('status-badge');
    const statusBadgeText = document.getElementById('status-badge-text');
    const builderStatsBar = document.getElementById('builder-stats-bar');

    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    const btnDeleteProto = document.getElementById('btn-delete-proto');
    const btnSaveProto = document.getElementById('btn-save-proto');
    const btnInsertMeals = document.getElementById('btn-insert-meals');
    const btnClearSchedule = document.getElementById('btn-clear-schedule');
    const btnExportJson = document.getElementById('btn-export-json');
    const btnExportImage = document.getElementById('btn-export-image');
    const scheduleCardActions = document.getElementById('schedule-card-actions');
    const btnOpenConstraints = document.getElementById('btn-open-constraints');
    const toggleConstraintsOverlay = document.getElementById('toggle-constraints-overlay');


    // --- SIDEBAR ACCORDION ---
    function setSectionOpen(sectionEl, headerEl, bodyEl, isOpen) {
        if (!sectionEl || !bodyEl) return;
        sectionEl.classList.toggle('is-collapsed', !isOpen);
        bodyEl.style.display = isOpen ? 'block' : 'none';
        if (headerEl) headerEl.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }

    if (togglePaletteBtn && sectionPalette && paletteBody) {
        const handleTogglePalette = (e) => {
            if (e.target.closest('#btn-new-block')) return;
            state.sidebarSectionsState.paletteOpen = !state.sidebarSectionsState.paletteOpen;
            setSectionOpen(sectionPalette, togglePaletteBtn, paletteBody, state.sidebarSectionsState.paletteOpen);
            saveSidebarSectionsState();
        };
        togglePaletteBtn.addEventListener('click', handleTogglePalette);
        togglePaletteBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleTogglePalette(e);
            }
        });
    }

    if (toggleWishesBtn && sectionWishes && wishesBody) {
        const handleToggleWishes = (e) => {
            if (e.target.closest('#btn-reset-wishes') || e.target.closest('#btn-new-wish')) return;
            state.sidebarSectionsState.wishesOpen = !state.sidebarSectionsState.wishesOpen;
            setSectionOpen(sectionWishes, toggleWishesBtn, wishesBody, state.sidebarSectionsState.wishesOpen);
            saveSidebarSectionsState();
        };
        toggleWishesBtn.addEventListener('click', handleToggleWishes);
        toggleWishesBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleToggleWishes(e);
            }
        });
    }

    // --- URL & FANESKIFT ---
    function updateActionButtonsVisibility() {
        const isCustom = Boolean(state.activeProtoId && state.activeProtoId.startsWith('custom_proto_'));
        const isOfficial = Boolean(
            state.activeProtoId &&
            !isCustom &&
            SETTINGS.prototypes &&
            SETTINGS.prototypes.some(p => p.id === state.activeProtoId)
        );
        if (btnDeleteProto) btnDeleteProto.style.display = isCustom ? 'inline-block' : 'none';
        if (btnCopyLink) btnCopyLink.style.display = isOfficial ? 'inline-block' : 'none';
    }

    function findPrototypeByQuery(query) {
        if (!query) return null;
        const q = query.trim().toLowerCase();
        return SETTINGS.prototypes.find(p =>
            (p.id && p.id.toLowerCase() === q) ||
            (p._fileName && p._fileName.toLowerCase() === q) ||
            (p.name && p.name.toLowerCase() === q)
        ) || state.customPrototypes.find(p =>
            (p.id && p.id.toLowerCase() === q) ||
            (p.name && p.name.toLowerCase() === q)
        ) || null;
    }

    function syncUrlState() {
        const url = new URL(window.location.href);
        if (state.activeProtoId && !state.activeProtoId.startsWith('custom_proto_')) {
            url.searchParams.set('skema', state.activeProtoId);
        } else {
            url.searchParams.delete('skema');
            url.searchParams.delete('proto');
        }

        if (state.activeTab === 'tab-semester') {
            url.searchParams.set('tab', 'semester');
            const semSelect = document.getElementById('semester-select');
            if (semSelect && semSelect.value) {
                url.searchParams.set('semester', semSelect.value);
            }
            const cal = getActiveCalendar();
            if (cal && cal.weeks && cal.weeks[state.selectedSimWeekIndex]) {
                url.searchParams.set('uge', cal.weeks[state.selectedSimWeekIndex].week);
            }
        } else {
            url.searchParams.delete('tab');
            url.searchParams.delete('semester');
            url.searchParams.delete('uge');
        }
        window.history.replaceState({}, '', url);
    }

    function switchTab(targetTab) {
        state.activeTab = targetTab;
        tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === targetTab));
        tabPanes.forEach(p => p.style.display = p.id === targetTab ? 'block' : 'none');
        syncUrlState();
        renderSemesterSimulation();
    }

    tabBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

    // --- TIDSLINJE & STATUS ---
    function buildTimeAxis() {
        if (!timeAxisEl) return;
        timeAxisEl.innerHTML = '';

        const headerSpacer = document.createElement('div');
        headerSpacer.className = 'time-axis-header';
        timeAxisEl.appendChild(headerSpacer);

        const { startHour, endHour, pixelPerHour } = SETTINGS.timeline || { startHour: 7, endHour: 22, pixelPerHour: 48 };

        for (let hour = startHour; hour < endHour; hour++) {
            const tick = document.createElement('div');
            tick.className = 'time-tick';
            tick.style.height = `${pixelPerHour}px`;

            const label = document.createElement('span');
            label.className = 'time-tick-label';
            label.textContent = `${String(hour).padStart(2, '0')}:00`;
            tick.appendChild(label);

            timeAxisEl.appendChild(tick);
        }

        const lastTick = document.createElement('div');
        lastTick.className = 'time-tick-last';
        const lastLabel = document.createElement('span');
        lastLabel.className = 'time-tick-label';
        lastLabel.textContent = `${String(endHour).padStart(2, '0')}:00`;
        lastTick.appendChild(lastLabel);
        timeAxisEl.appendChild(lastTick);
    }

    function setModifiedState(modified) {
        state.isModified = modified;
        if (statusBadge && statusBadgeText) {
            if (state.isModified) {
                statusBadge.className = 'status-badge status-modified';
                statusBadgeText.textContent = '✏️ Kladde';
            } else {
                statusBadge.className = 'status-badge status-saved';
                statusBadgeText.textContent = '★ Skabelon';
            }
        }
        updateActionButtonsVisibility();
        renderSemesterSimulation();
    }

    // --- PALETTE & NØGLETAL ---
    function renderPaletteAndStats() {
        const counts = {};
        let totalTeachingMin = 0;
        let totalNonTeachingMin = 0;

        state.currentSchedule.forEach(entry => {
            const dur = Math.max(timeToMinutes(entry.end) - timeToMinutes(entry.start), 0);
            if (!counts[entry.title]) counts[entry.title] = { count: 0, totalMin: 0 };
            counts[entry.title].count += 1;
            counts[entry.title].totalMin += dur;

            if (isEntryTeaching(entry, SETTINGS, state.customBlocks)) {
                totalTeachingMin += dur;
            } else {
                totalNonTeachingMin += dur;
            }
        });

        if (paletteEl) {
            paletteEl.innerHTML = '';
            const allBlocks = [...(SETTINGS.defaultBlocks || []), ...state.customBlocks];

            allBlocks.forEach(b => {
                const stat = counts[b.title] || { count: 0, totalMin: 0 };
                const hours = Math.floor(stat.totalMin / 60);
                const mins = stat.totalMin % 60;
                const timeStr = stat.totalMin > 0 ? `${hours}t ${mins > 0 ? mins + 'm' : ''}` : '0t';

                const card = document.createElement('div');
                card.className = 'palette-card';
                card.draggable = true;
                card.title = isBlockTitleTeaching(b.title, SETTINGS, state.customBlocks)
                    ? 'Tæller med som undervisning'
                    : 'Rammer / ikke-undervisning';

                card.innerHTML = `
                    <div class="palette-card-left" style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                        <span class="palette-color-dot" style="width: 12px; height: 12px; border-radius: 50%; background-color: ${b.color}; display: inline-block;"></span>
                        <span class="palette-name" style="font-weight: 700; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${b.title}</span>
                    </div>
                    <div class="palette-card-right" style="display: flex; align-items: baseline; gap: 4px; flex-shrink: 0;">
                        <span class="badge-count" style="font-weight: 800; font-size: 0.8rem; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${stat.count}x</span>
                        <span class="badge-time" style="font-size: 0.72rem; color: #64748b;">${timeStr}</span>
                    </div>
                `;

                card.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', JSON.stringify({
                        title: b.title,
                        color: b.color,
                        textColor: b.textColor || '#ffffff',
                        defaultDuration: b.defaultDuration || 90,
                        isTeaching: isBlockTitleTeaching(b.title, SETTINGS, state.customBlocks)
                    }));
                });

                paletteEl.appendChild(card);
            });
        }

        if (builderStatsBar) {
            const teachingHours = (totalTeachingMin / 60).toFixed(1);
            const nonTeachingHours = (totalNonTeachingMin / 60).toFixed(1);
            const meetsRequirement = parseFloat(teachingHours) >= 21;
            const evalRes = evaluateScheduleConstraints(
                state.currentSchedule,
                state.activeConstraints,
                SETTINGS,
                state.customBlocks
            );

            let checkPillHtml = '';
            if (evalRes.errors.length > 0) {
                checkPillHtml = `<button type="button" id="pill-open-check" class="metric-pill is-err is-clickable" title="Klik for at se konflikter">🚫 ${evalRes.errors.length} konflikt${evalRes.errors.length > 1 ? 'er' : ''}</button>`;
            } else if (evalRes.warnings.length > 0) {
                checkPillHtml = `<button type="button" id="pill-open-check" class="metric-pill is-warn is-clickable" title="Klik for at se afvigelser fra fagønsker">⚠️ ${evalRes.warnings.length} afvigelse${evalRes.warnings.length > 1 ? 'r' : ''}</button>`;
            } else {
                checkPillHtml = `<button type="button" id="pill-open-check" class="metric-pill is-ok is-clickable" title="Overholder alle regler">✅ 0 konflikter</button>`;
            }

            builderStatsBar.innerHTML = `
                <span class="metric-pill ${meetsRequirement ? 'is-ok' : 'is-err'}">
                    🎓 Undervisning: ${teachingHours}t <small style="font-weight:500; opacity:0.85;">(min. 21t)</small>
                </span>
                <span class="metric-pill">
                    🧹 Rammer & møder: ${nonTeachingHours}t
                </span>
                ${checkPillHtml}
            `;

            document.getElementById('pill-open-check')?.addEventListener('click', () => openConstraintsModal('ctab-check'));
        }
    }

    // --- DRAG & DROP + RENDER UGESKEMA ---
    function setupDragAndDrop() {
        document.querySelectorAll('.day-body').forEach(col => {
            col.addEventListener('dragover', (e) => {
                e.preventDefault();
                col.style.backgroundColor = 'rgba(56, 189, 248, 0.08)';
            });

            col.addEventListener('dragleave', () => { col.style.backgroundColor = ''; });

            col.addEventListener('drop', (e) => {
                e.preventDefault();
                col.style.backgroundColor = '';

                const raw = e.dataTransfer.getData('text/plain');
                if (!raw) return;

                const blockData = JSON.parse(raw);
                const dayKey = col.id.replace('day-', '');

                const rect = col.getBoundingClientRect();
                const offsetY = e.clientY - rect.top;
                const minutesFromTop = (offsetY / SETTINGS.timeline.pixelPerHour) * 60;
                const rawTotalMinutes = SETTINGS.timeline.startHour * 60 + minutesFromTop;

                const roundedMinutes = Math.round(rawTotalMinutes / 5) * 5;
                const startStr = minutesToTime(roundedMinutes);
                const endStr = minutesToTime(roundedMinutes + blockData.defaultDuration);

                state.currentSchedule.push({
                    id: 'entry_' + Date.now(),
                    day: dayKey,
                    title: blockData.title,
                    start: startStr,
                    end: endStr,
                    color: blockData.color,
                    textColor: blockData.textColor,
                    isTeaching: Boolean(blockData.isTeaching),
                    note: '',
                    colorOverride: false,
                    overrideColor: ''
                });

                setModifiedState(true);
                saveCurrentState(notesTextarea?.value || '');
                renderSchedule();
            });
        });
    }

    function renderConstraintOverlays(dayBody, dayKey, timelineStartMinutes, pixelPerHour) {
        if (!state.showConstraintsOverlay) return;
        const timelineEndMinutes = (SETTINGS.timeline?.endHour || 22) * 60;

        const appendZone = (win, cssClass, icon, extraText = '') => {
            const resolved = resolveTimeWindowForDay(win, dayKey);
            if (!resolved) return;

            const sMin = Math.max(timeToMinutes(resolved.start), timelineStartMinutes);
            const eMin = Math.min(timeToMinutes(resolved.end), timelineEndMinutes);
            if (eMin <= sMin) return;

            const zone = document.createElement('div');
            zone.className = `constraint-bg-zone ${cssClass}`;
            zone.style.top = `${((sMin - timelineStartMinutes) / 60) * pixelPerHour}px`;
            zone.style.height = `${((eMin - sMin) / 60) * pixelPerHour}px`;
            zone.innerHTML = `<span class="constraint-bg-label">${icon} ${win.label}${extraText} (${resolved.start}–${resolved.end})</span>`;
            dayBody.appendChild(zone);
        };

        (state.activeConstraints.blockedWindows || []).forEach(win => {
            appendZone(win, 'is-meal-window', '🍽️');
        });

        (state.activeConstraints.facilityRestrictions || []).forEach(fac => {
            const appliesHint = Array.isArray(fac.appliesTo) && fac.appliesTo.length > 0
                ? ` [${fac.appliesTo.join(', ')}]`
                : '';
            appendZone(fac, 'is-facility-window', '🏟️', appliesHint);
        });
    }

    function renderSchedule() {
        const { startHour, pixelPerHour } = SETTINGS.timeline || { startHour: 7, pixelPerHour: 48 };
        const timelineStartMinutes = startHour * 60;

        DAY_KEYS.forEach(d => {
            const body = document.getElementById(`day-${d}`);
            if (body) {
                body.innerHTML = '';
                renderConstraintOverlays(body, d, timelineStartMinutes, pixelPerHour);
            }
        });

        const evalRes = evaluateScheduleConstraints(
            state.currentSchedule,
            state.activeConstraints,
            SETTINGS,
            state.customBlocks
        );

        state.currentSchedule.forEach(entry => {
            const dayBody = document.getElementById(`day-${entry.day}`);
            if (!dayBody) return;

            const startMin = timeToMinutes(entry.start);
            const endMin = timeToMinutes(entry.end);
            const duration = Math.max(endMin - startMin, 15);

            const topPx = ((startMin - timelineStartMinutes) / 60) * pixelPerHour;
            const heightPx = (duration / 60) * pixelPerHour;
            const { color, textColor } = getBlockColors(entry, SETTINGS, state.customBlocks);
            const issue = evalRes.entryIssues[entry.id];

            const blockEl = document.createElement('div');
            blockEl.className = 'schedule-block';
            if (issue) {
                blockEl.classList.add(issue.severity === 'error' ? 'has-constraint-error' : 'has-constraint-warn');
                blockEl.title = issue.messages.join(' · ');
            }
            blockEl.dataset.entryId = entry.id;
            blockEl.style.top = `${topPx}px`;
            blockEl.style.height = `${heightPx}px`;
            blockEl.style.backgroundColor = color;
            blockEl.style.color = textColor;

            const warnIcon = issue ? (issue.severity === 'error' ? '🚫 ' : '⚠️ ') : '';

            blockEl.innerHTML = `
                <div class="block-header-line">
                    <span class="block-title">${warnIcon}${entry.title}</span>
                    <button type="button" class="block-close-btn" title="Fjern lektion">&times;</button>
                </div>
                <span class="block-time">${entry.start} - ${entry.end}</span>
                ${entry.note ? `<span class="block-note">${entry.note}</span>` : ''}
                <div class="block-resize-handle" title="Træk for at forlænge/forkorte"></div>
            `;

            blockEl.querySelector('.block-close-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                state.currentSchedule = state.currentSchedule.filter(item => item.id !== entry.id);
                setModifiedState(true);
                saveCurrentState(notesTextarea?.value || '');
                renderSchedule();
            });

            attachDragAndResize(blockEl, entry);
            dayBody.appendChild(blockEl);
        });

        renderPaletteAndStats();
    }

    function attachDragAndResize(blockEl, entry) {
        const resizeHandle = blockEl.querySelector('.block-resize-handle');
        const timeDisplay = blockEl.querySelector('.block-time');
        const { startHour, endHour, pixelPerHour } = SETTINGS.timeline;
        const timelineStartMin = startHour * 60;
        const timelineEndMin = endHour * 60;

        resizeHandle.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            blockEl.classList.add('is-resizing');

            const startY = e.clientY;
            const initialStartMin = timeToMinutes(entry.start);
            const initialEndMin = timeToMinutes(entry.end);
            let latestEndMin = initialEndMin;

            function onPointerMove(moveEvent) {
                const deltaY = moveEvent.clientY - startY;
                const deltaMinutes = (deltaY / pixelPerHour) * 60;
                const snappedDelta = Math.round(deltaMinutes / 5) * 5;

                latestEndMin = initialEndMin + snappedDelta;
                latestEndMin = Math.max(initialStartMin + 15, Math.min(timelineEndMin, latestEndMin));

                const currentDuration = latestEndMin - initialStartMin;
                blockEl.style.height = `${(currentDuration / 60) * pixelPerHour}px`;
                timeDisplay.textContent = `${entry.start} - ${minutesToTime(latestEndMin)}`;
            }

            function onPointerUp() {
                blockEl.classList.remove('is-resizing');
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);

                if (latestEndMin !== initialEndMin) {
                    entry.end = minutesToTime(latestEndMin);
                    setModifiedState(true);
                    saveCurrentState(notesTextarea?.value || '');
                    renderSchedule();
                }
            }

            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
        });

        blockEl.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.block-close-btn') || e.target.closest('.block-resize-handle')) return;

            const startX = e.clientX;
            const startY = e.clientY;
            const initialStartMin = timeToMinutes(entry.start);
            const initialEndMin = timeToMinutes(entry.end);
            const duration = initialEndMin - initialStartMin;

            let hasMoved = false;
            let latestStartMin = initialStartMin;
            let latestEndMin = initialEndMin;
            let currentTargetDay = entry.day;

            const dayColumns = DAY_KEYS.map(d => {
                const bodyEl = document.getElementById(`day-${d}`);
                return { day: d, body: bodyEl, rect: bodyEl ? bodyEl.getBoundingClientRect() : null };
            }).filter(c => c.body && c.rect);

            function onPointerMove(moveEvent) {
                const deltaX = moveEvent.clientX - startX;
                const deltaY = moveEvent.clientY - startY;

                if (Math.abs(deltaY) > 3 || Math.abs(deltaX) > 3) {
                    hasMoved = true;
                    blockEl.classList.add('is-dragging');
                }
                if (!hasMoved) return;

                const deltaMinutes = (deltaY / pixelPerHour) * 60;
                const snappedDelta = Math.round(deltaMinutes / 5) * 5;

                latestStartMin = initialStartMin + snappedDelta;
                latestStartMin = Math.max(timelineStartMin, Math.min(timelineEndMin - duration, latestStartMin));
                latestEndMin = latestStartMin + duration;

                blockEl.style.top = `${((latestStartMin - timelineStartMin) / 60) * pixelPerHour}px`;
                timeDisplay.textContent = `${minutesToTime(latestStartMin)} - ${minutesToTime(latestEndMin)}`;

                const targetCol = dayColumns.find(c => moveEvent.clientX >= c.rect.left && moveEvent.clientX <= c.rect.right);
                if (targetCol && targetCol.day !== currentTargetDay) {
                    currentTargetDay = targetCol.day;
                    targetCol.body.appendChild(blockEl);
                }

                dayColumns.forEach(c => {
                    c.body.style.backgroundColor = (c.day === currentTargetDay && currentTargetDay !== entry.day)
                        ? 'rgba(56, 189, 248, 0.12)'
                        : '';
                });
            }

            function onPointerUp() {
                blockEl.classList.remove('is-dragging');
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);

                dayColumns.forEach(c => { c.body.style.backgroundColor = ''; });

                if (hasMoved) {
                    entry.start = minutesToTime(latestStartMin);
                    entry.end = minutesToTime(latestEndMin);
                    entry.day = currentTargetDay;
                    setModifiedState(true);
                    saveCurrentState(notesTextarea?.value || '');
                    renderSchedule();
                } else {
                    openEditModal(entry);
                }
            }

            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
        });
    }

    // --- SKABELON-DROPDOWN & SKEMA-HANDLINGER ---
    function updateProtoDropdown() {
        if (!protoSelect) return;
        protoSelect.innerHTML = '<option value="">-- Vælg foruddefineret skema --</option>';

        if (SETTINGS.prototypes && SETTINGS.prototypes.length > 0) {
            const groupsMap = {};
            SETTINGS.prototypes.forEach((p, idx) => {
                const grpName = p.group || 'Faste skabeloner';
                if (!groupsMap[grpName]) {
                    groupsMap[grpName] = { name: grpName, order: p._folderOrder !== undefined ? p._folderOrder : 999, items: [] };
                }
                groupsMap[grpName].items.push({
                    id: p.id || `builtin_${idx}`,
                    name: String(p.name || 'Uden navn'),
                    order: p.order !== undefined ? p.order : idx
                });
            });

            const sortedGroups = Object.values(groupsMap).sort((a, b) => {
                if (a.order !== b.order) return a.order - b.order;
                return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true });
            });

            sortedGroups.forEach(grp => {
                const optgroup = document.createElement('optgroup');
                optgroup.label = `── ${grp.name} ──`;
                grp.items.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
                grp.items.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    opt.textContent = p.name;
                    optgroup.appendChild(opt);
                });
                protoSelect.appendChild(optgroup);
            });
        }

        if (state.customPrototypes && state.customPrototypes.length > 0) {
            const userGroup = document.createElement('optgroup');
            userGroup.label = '── Mine egne forslag ──';
            state.customPrototypes.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name || 'Uden navn';
                userGroup.appendChild(opt);
            });
            protoSelect.appendChild(userGroup);
        }

        protoSelect.value = state.activeProtoId || '';
        updateActionButtonsVisibility();
    }

    function loadPrototype(id, markModified = false) {
        const proto = SETTINGS.prototypes.find(p => p.id === id) || state.customPrototypes.find(p => p.id === id);
        if (!proto) return;

        state.activeProtoId = proto.id;
        state.currentTitle = proto.name;
        state.currentSchedule = JSON.parse(JSON.stringify(proto.schedule || []));
        state.currentNotes = proto.notes || '';
        if (notesTextarea) notesTextarea.value = state.currentNotes;
        if (titleDisplay) titleDisplay.textContent = state.currentTitle;

        syncUrlState();
        setModifiedState(markModified);
        updateProtoDropdown();
        saveCurrentState(notesTextarea?.value || '');
        renderSchedule();
    }

    protoSelect?.addEventListener('change', (e) => {
        if (e.target.value) loadPrototype(e.target.value, false);
    });

    btnCopyLink?.addEventListener('click', async () => {
        if (!state.activeProtoId || state.activeProtoId.startsWith('custom_proto_')) return;
        syncUrlState();
        try {
            await navigator.clipboard.writeText(window.location.href);
            const orig = btnCopyLink.textContent;
            btnCopyLink.textContent = '✅ Kopieret!';
            setTimeout(() => { btnCopyLink.textContent = orig; }, 2000);
        } catch (err) {
            prompt('Kopiér dette link:', window.location.href);
        }
    });

    btnDeleteProto?.addEventListener('click', () => {
        if (!state.activeProtoId || !state.activeProtoId.startsWith('custom_proto_')) return;
        const p = state.customPrototypes.find(item => item.id === state.activeProtoId);
        if (confirm(`Vil du slette forslaget "${p ? p.name : 'dette'}" permanent?`)) {
            state.customPrototypes = state.customPrototypes.filter(item => item.id !== state.activeProtoId);
            saveCustomPrototypes();
            state.activeProtoId = null;

            if (SETTINGS.prototypes && SETTINGS.prototypes.length > 0) {
                loadPrototype(SETTINGS.prototypes[0].id, false);
            } else {
                state.currentSchedule = [];
                state.currentTitle = 'Skemaforslag';
                syncUrlState();
                setModifiedState(false);
                updateProtoDropdown();
                saveCurrentState(notesTextarea?.value || '');
                renderSchedule();
            }
        }
    });

    btnSaveProto?.addEventListener('click', () => {
        const name = prompt('Hvad skal dit skemaforslag hedde?', state.currentTitle !== 'Skemaforslag' ? state.currentTitle : 'Mit nye forslag');
        if (!name || !name.trim()) return;

        const newProto = {
            id: 'custom_proto_' + Date.now(),
            name: name.trim(),
            notes: notesTextarea ? notesTextarea.value : '',
            schedule: JSON.parse(JSON.stringify(state.currentSchedule))
        };
        state.customPrototypes.push(newProto);
        saveCustomPrototypes();

        state.activeProtoId = newProto.id;
        state.currentTitle = newProto.name;
        if (titleDisplay) titleDisplay.textContent = state.currentTitle;

        syncUrlState();
        setModifiedState(false);
        updateProtoDropdown();
        saveCurrentState(notesTextarea?.value || '');
    });

    btnInsertMeals?.addEventListener('click', () => {
        DAY_KEYS.forEach(day => {
            (SETTINGS.mealBlocks || []).forEach(meal => {
                if (!state.currentSchedule.some(item => item.day === day && item.title === meal.title)) {
                    state.currentSchedule.push({
                        id: 'meal_' + day + '_' + meal.title + '_' + Date.now(),
                        day,
                        title: meal.title,
                        start: meal.start,
                        end: meal.end,
                        color: meal.color,
                        textColor: meal.textColor,
                        isTeaching: Boolean(meal.isTeaching),
                        note: ''
                    });
                }
            });
        });
        setModifiedState(true);
        saveCurrentState(notesTextarea?.value || '');
        renderSchedule();
    });

    btnClearSchedule?.addEventListener('click', () => {
        if (confirm('Vil du rydde alle lektioner i skemaet?')) {
            state.currentSchedule = [];
            setModifiedState(true);
            saveCurrentState(notesTextarea?.value || '');
            renderSchedule();
        }
    });

    notesTextarea?.addEventListener('input', () => {
        state.currentNotes = notesTextarea.value;
        setModifiedState(true);
        saveCurrentState(notesTextarea.value);
    });

    document.querySelector('.editable-title-wrapper')?.addEventListener('click', () => {
        const newName = prompt('Omdøb dette skemaforslag:', state.currentTitle);
        if (!newName || !newName.trim()) return;

        state.currentTitle = newName.trim();
        if (titleDisplay) titleDisplay.textContent = state.currentTitle;
        if (state.activeProtoId && state.activeProtoId.startsWith('custom_proto_')) {
            const p = state.customPrototypes.find(item => item.id === state.activeProtoId);
            if (p) p.name = state.currentTitle;
            saveCustomPrototypes();
            updateProtoDropdown();
        }
        setModifiedState(true);
        saveCurrentState(notesTextarea?.value || '');
    });

    btnExportJson?.addEventListener('click', () => {
        downloadJsonFile({
            id: 'proto_' + Date.now(),
            name: state.currentTitle,
            notes: notesTextarea ? notesTextarea.value : '',
            schedule: state.currentSchedule
        }, `${state.currentTitle.replace(/[^a-z0-9æøå]/gi, '_').toLowerCase()}.json`, 4);
    });

    btnExportImage?.addEventListener('click', () => {
        const target = document.getElementById('export-target');
        if (!target || typeof window.html2canvas !== 'function') return;

        if (scheduleCardActions) scheduleCardActions.style.display = 'none';
        if (btnOpenConstraints) btnOpenConstraints.style.display = 'none';

        window.html2canvas(target, { scale: 2, backgroundColor: '#ffffff' }).then(canvas => {
            if (scheduleCardActions) scheduleCardActions.style.display = 'flex';
            if (btnOpenConstraints) btnOpenConstraints.style.display = 'inline-flex';
            const a = document.createElement('a');
            a.download = `${state.currentTitle.replace(/\s+/g, '_')}_VIH.png`;
            a.href = canvas.toDataURL('image/png');
            a.click();
        }).catch(() => {
            if (scheduleCardActions) scheduleCardActions.style.display = 'flex';
            if (btnOpenConstraints) btnOpenConstraints.style.display = 'inline-flex';
        });
    });

    // --- INITIALISERING ---
    function init() {
        loadFromStorage();

        if (toggleConstraintsOverlay) {
            toggleConstraintsOverlay.checked = Boolean(state.showConstraintsOverlay);
            toggleConstraintsOverlay.addEventListener('change', () => {
                state.showConstraintsOverlay = toggleConstraintsOverlay.checked;
                saveShowConstraintsOverlay();
                renderSchedule();
            });
        }

        setSectionOpen(sectionPalette, togglePaletteBtn, paletteBody, state.sidebarSectionsState.paletteOpen);
        setSectionOpen(sectionWishes, toggleWishesBtn, wishesBody, state.sidebarSectionsState.wishesOpen);

        buildTimeAxis();

        initModals({
            onScheduleChanged: () => {
                setModifiedState(true);
                saveCurrentState(notesTextarea?.value || '');
                renderSchedule();
            },
            onConstraintsChanged: () => {
                renderSchedule();
            },
            onBlocksChanged: () => {
                renderPaletteAndStats();
            }
        });

        initSimulator({
            syncUrlState,
            openWishesSection: () => setSectionOpen(sectionWishes, toggleWishesBtn, wishesBody, true)
        });

        SETTINGS.prototypes = allPrototypes;
        updateProtoDropdown();

        const urlParams = new URLSearchParams(window.location.search);
        const linkedQuery = urlParams.get('skema') || urlParams.get('proto');
        const linkedProto = findPrototypeByQuery(linkedQuery);

        const validProto = linkedProto ||
                           SETTINGS.prototypes.find(p => p.id === state.activeProtoId) ||
                           state.customPrototypes.find(p => p.id === state.activeProtoId);

        if (validProto) {
            loadPrototype(validProto.id, false);
        } else if (SETTINGS.prototypes.length > 0) {
            loadPrototype(SETTINGS.prototypes[0].id, false);
        } else {
            updateActionButtonsVisibility();
            renderSchedule();
        }

        applySimulatorUrlParams(urlParams);

        const reqTab = urlParams.get('tab');
        switchTab(reqTab === 'semester' ? 'tab-semester' : 'tab-builder');

        renderPaletteAndStats();
        setupDragAndDrop();
    }

    init();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}