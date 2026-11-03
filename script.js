import { VIH_SKEMA_SETTINGS } from './settings.js';
import { allPrototypes } from './prototypes.js';

document.addEventListener('DOMContentLoaded', () => {
    const SETTINGS = VIH_SKEMA_SETTINGS;
    const STORAGE_KEY_CURRENT = 'vih_active_schedule_data';
    const STORAGE_KEY_CUSTOM_BLOCKS = 'vih_custom_schedule_blocks';
    const STORAGE_KEY_CUSTOM_PROTOS = 'vih_custom_schedule_protos';

    // State
    let currentSchedule = [];
    let currentNotes = "";
    let customBlocks = [];
    let customPrototypes = [];
    let activeProtoId = null;
    let currentTitle = "Skemaforslag";
    let isModified = false;
    let editingEntryId = null;

    // DOM referencer
    const paletteEl = document.getElementById('unified-palette') || document.getElementById('block-palette');
    const statsContainer = document.getElementById('stats-container');
    const timeAxisEl = document.getElementById('time-axis');
    const protoSelect = document.getElementById('prototype-select');
    const titleDisplay = document.getElementById('schedule-title-display');
    const notesTextarea = document.getElementById('schedule-notes');
    const statusBadge = document.getElementById('status-badge');
    const statusBadgeText = document.getElementById('status-badge-text');

    const editModal = document.getElementById('edit-modal');
    const editTitle = document.getElementById('edit-title');
    const editStart = document.getElementById('edit-start');
    const editEnd = document.getElementById('edit-end');
    const editNote = document.getElementById('edit-note');
    const editColor = document.getElementById('edit-color');
    const editUseOverride = document.getElementById('edit-use-override');
    const btnDeleteEntry = document.getElementById('btn-delete-entry');

    const customModal = document.getElementById('custom-block-modal');
    const customTitle = document.getElementById('custom-title');
    const customColor = document.getElementById('custom-color');
    const customDuration = document.getElementById('custom-duration');

    // --- 1. INITIALISERING ---
    function init() {
        loadFromStorage();
        buildTimeAxis();

        SETTINGS.prototypes = allPrototypes;
        updateProtoDropdown();

        const validProto = SETTINGS.prototypes.find(p => p.id === activeProtoId) ||
                           customPrototypes.find(p => p.id === activeProtoId);

        if (validProto) {
            loadPrototype(validProto.id, false);
        } else if (SETTINGS.prototypes.length > 0) {
            loadPrototype(SETTINGS.prototypes[0].id, false);
        } else {
            renderSchedule();
        }

        renderPaletteAndStats();
        setupDragAndDrop();
    }

function buildTimeAxis() {
        if (!timeAxisEl) return;
        timeAxisEl.innerHTML = '';

        // Spacer der matcher overskrifterne (Mandag, Tirsdag osv.)
        const headerSpacer = document.createElement('div');
        headerSpacer.className = 'time-axis-header';
        timeAxisEl.appendChild(headerSpacer);

        const { startHour, endHour, pixelPerHour } = SETTINGS.timeline;

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

        // Sidste markør kl. 22:00 i bunden
        const lastTick = document.createElement('div');
        lastTick.className = 'time-tick-last';
        const lastLabel = document.createElement('span');
        lastLabel.className = 'time-tick-label';
        lastLabel.textContent = `${String(endHour).padStart(2, '0')}:00`;
        lastTick.appendChild(lastLabel);
        timeAxisEl.appendChild(lastTick);
    }

    function setModifiedState(modified) {
        isModified = modified;
        if (!statusBadge || !statusBadgeText) return;

        if (isModified) {
            if (protoSelect) protoSelect.value = "";
            statusBadge.className = 'status-badge status-modified';
            statusBadgeText.textContent = '✏️ Kladde (ugemt ændring)';
        } else {
            statusBadge.className = 'status-badge status-saved';
            statusBadgeText.textContent = '★ Skabelon aktiv';
        }
    }

    // --- 2. FARVELOGIK (Dynamisk opslag) ---
    function getBlockColors(entry) {
        // Hvis brugeren specifikt har bedt om at overskrive farven på denne brik
        if (entry.colorOverride && entry.overrideColor) {
            return { color: entry.overrideColor, textColor: entry.overrideTextColor || '#ffffff' };
        }

        // Ellers slå op i paletten baseret på navnet (title)
        const allBlocks = [...SETTINGS.defaultBlocks, ...customBlocks, ...SETTINGS.mealBlocks];
        const paletteMatch = allBlocks.find(b => b.title === entry.title);
        
        if (paletteMatch) {
            return { color: paletteMatch.color, textColor: paletteMatch.textColor || '#ffffff' };
        }

        // Fallback hvis den slet ikke findes (hvis man fx har omdøbt brikken til noget ukendt)
        return { color: entry.color || '#cbd5e1', textColor: entry.textColor || '#0f172a' };
    }

    // --- 3. PALETTE & TIMETÆLLER ---
    function renderPaletteAndStats() {
        if (!paletteEl) return;
        paletteEl.innerHTML = '';

        const counts = {};
        currentSchedule.forEach(entry => {
            const startMin = timeToMinutes(entry.start);
            const endMin = timeToMinutes(entry.end);
            const dur = Math.max(endMin - startMin, 0);

            if (!counts[entry.title]) counts[entry.title] = { count: 0, totalMin: 0 };
            counts[entry.title].count += 1;
            counts[entry.title].totalMin += dur;
        });

        const allBlocks = [...SETTINGS.defaultBlocks, ...customBlocks];

        allBlocks.forEach(b => {
            const stat = counts[b.title] || { count: 0, totalMin: 0 };
            const hours = Math.floor(stat.totalMin / 60);
            const mins = stat.totalMin % 60;
            const timeStr = stat.totalMin > 0 ? `${hours}t ${mins > 0 ? mins + 'm' : ''}` : '0t';

            const card = document.createElement('div');
            card.className = 'palette-card';
            card.draggable = true;

            card.innerHTML = `
                <div class="palette-card-left" style="display: flex; align-items: center; gap: 8px;">
                    <span class="palette-color-dot" style="width: 12px; height: 12px; border-radius: 50%; background-color: ${b.color}; display: inline-block;"></span>
                    <span class="palette-name" style="font-weight: 700; font-size: 0.85rem;">${b.title}</span>
                </div>
                <div class="palette-card-right" style="display: flex; align-items: baseline; gap: 4px;">
                    <span class="badge-count" style="font-weight: 800; font-size: 0.8rem; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${stat.count}x</span>
                    <span class="badge-time" style="font-size: 0.72rem; color: #64748b;">${timeStr}</span>
                </div>
            `;

            card.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify({
                    title: b.title,
                    color: b.color,
                    textColor: b.textColor || '#ffffff',
                    defaultDuration: b.defaultDuration || 90
                }));
            });

            paletteEl.appendChild(card);
        });

        if (statsContainer) {
            statsContainer.innerHTML = '';
            const sorted = Object.entries(counts).sort((a, b) => b[1].totalMin - a[1].totalMin);
            sorted.forEach(([title, data]) => {
                const row = document.createElement('div');
                row.className = 'stat-row';
                const h = Math.floor(data.totalMin / 60);
                const m = data.totalMin % 60;
                
                // Find farven dynamisk til border
                const mockEntry = { title: title };
                const { color } = getBlockColors(mockEntry);
                row.style.borderLeftColor = color;

                row.innerHTML = `<span>${title}</span><strong>${data.count}x (${h}t ${m > 0 ? m + 'm' : ''})</strong>`;
                statsContainer.appendChild(row);
            });
        }
    }

    // --- 4. DRAG & DROP ---
    function setupDragAndDrop() {
        const dayBodies = document.querySelectorAll('.day-body');
        dayBodies.forEach(col => {
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

                const newEntry = {
                    id: 'entry_' + Date.now(),
                    day: dayKey,
                    title: blockData.title,
                    start: startStr,
                    end: endStr,
                    color: blockData.color,         // Original backup
                    textColor: blockData.textColor, // Original backup
                    note: '',
                    colorOverride: false,
                    overrideColor: ''
                };

                currentSchedule.push(newEntry);
                setModifiedState(true);
                saveState();
                renderSchedule();
            });
        });
    }

    // --- 5. RENDER SKEMA PÅ TIDSLINJEN ---
    function renderSchedule() {
        ['man', 'tir', 'ons', 'tor', 'fre'].forEach(d => {
            const body = document.getElementById(`day-${d}`);
            if (body) body.innerHTML = '';
        });

        const { startHour, pixelPerHour } = SETTINGS.timeline;
        const timelineStartMinutes = startHour * 60;

        currentSchedule.forEach(entry => {
            const dayBody = document.getElementById(`day-${entry.day}`);
            if (!dayBody) return;

            const startMin = timeToMinutes(entry.start);
            const endMin = timeToMinutes(entry.end);
            const duration = Math.max(endMin - startMin, 15);

            const topPx = ((startMin - timelineStartMinutes) / 60) * pixelPerHour;
            const heightPx = (duration / 60) * pixelPerHour;

            // HENT FARVEN DYNAMISK!
            const { color, textColor } = getBlockColors(entry);

            const blockEl = document.createElement('div');
            blockEl.className = 'schedule-block';
            blockEl.dataset.entryId = entry.id;
            blockEl.style.top = `${topPx}px`;
            blockEl.style.height = `${heightPx}px`;
            blockEl.style.backgroundColor = color;
            blockEl.style.color = textColor;

            blockEl.innerHTML = `
                <div class="block-header-line">
                    <span class="block-title">${entry.title}</span>
                    <button type="button" class="block-close-btn" title="Fjern lektion">&times;</button>
                </div>
                <span class="block-time">${entry.start} - ${entry.end}</span>
                ${entry.note ? `<span class="block-note">${entry.note}</span>` : ''}
                <div class="block-resize-handle" title="Træk for at forlænge/forkorte"></div>
            `;

            blockEl.querySelector('.block-close-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                currentSchedule = currentSchedule.filter(item => item.id !== entry.id);
                setModifiedState(true);
                saveState();
                renderSchedule();
            });

            attachDragAndResize(blockEl, entry);
            dayBody.appendChild(blockEl);
        });

        renderPaletteAndStats();
    }

    // --- 6. FLYT & ÆNDR LÆNGDE ---
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
                const newHeight = (currentDuration / 60) * pixelPerHour;
                blockEl.style.height = `${newHeight}px`;
                timeDisplay.textContent = `${entry.start} - ${minutesToTime(latestEndMin)}`;
            }

            function onPointerUp() {
                blockEl.classList.remove('is-resizing');
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);

                if (latestEndMin !== initialEndMin) {
                    entry.end = minutesToTime(latestEndMin);
                    setModifiedState(true);
                    saveState();
                    renderSchedule();
                }
            }

            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
        });

        blockEl.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.block-close-btn') || e.target.closest('.block-resize-handle')) return;

            const startY = e.clientY;
            const initialStartMin = timeToMinutes(entry.start);
            const initialEndMin = timeToMinutes(entry.end);
            const duration = initialEndMin - initialStartMin;

            let hasMoved = false;
            let latestStartMin = initialStartMin;
            let latestEndMin = initialEndMin;

            function onPointerMove(moveEvent) {
                const deltaY = moveEvent.clientY - startY;
                if (Math.abs(deltaY) > 3) {
                    hasMoved = true;
                    blockEl.classList.add('is-dragging');
                }
                if (!hasMoved) return;

                const deltaMinutes = (deltaY / pixelPerHour) * 60;
                const snappedDelta = Math.round(deltaMinutes / 5) * 5;

                latestStartMin = initialStartMin + snappedDelta;
                latestStartMin = Math.max(timelineStartMin, Math.min(timelineEndMin - duration, latestStartMin));
                latestEndMin = latestStartMin + duration;

                const newTopPx = ((latestStartMin - timelineStartMin) / 60) * pixelPerHour;
                blockEl.style.top = `${newTopPx}px`;
                timeDisplay.textContent = `${minutesToTime(latestStartMin)} - ${minutesToTime(latestEndMin)}`;
            }

            function onPointerUp() {
                blockEl.classList.remove('is-dragging');
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);

                if (hasMoved) {
                    entry.start = minutesToTime(latestStartMin);
                    entry.end = minutesToTime(latestEndMin);
                    setModifiedState(true);
                    saveState();
                    renderSchedule();
                } else {
                    openEditModal(entry);
                }
            }

            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
        });
    }

    // --- 7. REDIGER LEKTION MODAL ---
    function openEditModal(entry) {
        if (!editModal) return;
        editingEntryId = entry.id;
        editTitle.value = entry.title;
        editStart.value = entry.start;
        editEnd.value = entry.end;
        editNote.value = entry.note || '';
        
        // Farve-override inputs
        const currentEffectiveColors = getBlockColors(entry);
        editColor.value = entry.colorOverride && entry.overrideColor ? entry.overrideColor : currentEffectiveColors.color;
        editUseOverride.checked = !!entry.colorOverride;

        editModal.showModal();
    }

    const editForm = document.getElementById('edit-form');
    if (editForm) {
        editForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const entry = currentSchedule.find(item => item.id === editingEntryId);
            if (entry) {
                entry.title = editTitle.value.trim();
                entry.start = editStart.value;
                entry.end = editEnd.value;
                entry.note = editNote.value.trim();
                
                // Gem evt. farveoverride
                entry.colorOverride = editUseOverride.checked;
                if (entry.colorOverride) {
                    entry.overrideColor = editColor.value;
                    entry.overrideTextColor = '#ffffff'; // Simpel standard for override text
                } else {
                    entry.overrideColor = '';
                }

                setModifiedState(true);
                saveState();
                renderSchedule();
            }
            editModal.close();
        });
    }

    if (btnDeleteEntry) {
        btnDeleteEntry.addEventListener('click', () => {
            currentSchedule = currentSchedule.filter(item => item.id !== editingEntryId);
            setModifiedState(true);
            saveState();
            renderSchedule();
            editModal.close();
        });
    }

    // --- 8. PROTOTYPE DROPDOWN ---
    function updateProtoDropdown() {
        if (!protoSelect) return;
        protoSelect.innerHTML = '<option value="">-- Vælg foruddefineret skema --</option>';

        if (SETTINGS.prototypes && SETTINGS.prototypes.length > 0) {
            const builtGroup = document.createElement('optgroup');
            builtGroup.label = 'Faste prototyper (fra /prototypes)';
            SETTINGS.prototypes.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                builtGroup.appendChild(opt);
            });
            protoSelect.appendChild(builtGroup);
        }

        if (customPrototypes.length > 0) {
            const userGroup = document.createElement('optgroup');
            userGroup.label = 'Mine egne forslag';
            customPrototypes.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                userGroup.appendChild(opt);
            });
            protoSelect.appendChild(userGroup);
        }

        if (activeProtoId && !isModified) {
            protoSelect.value = activeProtoId;
        } else {
            protoSelect.value = "";
        }

        const btnDeleteProto = document.getElementById('btn-delete-proto');
        if (btnDeleteProto) {
            btnDeleteProto.style.display = (activeProtoId && activeProtoId.startsWith('custom_proto_') && !isModified) ? 'inline-block' : 'none';
        }
    }

    function loadPrototype(id, markModified = false) {
        let proto = SETTINGS.prototypes.find(p => p.id === id) ||
                    customPrototypes.find(p => p.id === id);

        if (proto) {
            activeProtoId = proto.id;
            currentTitle = proto.name;
            currentSchedule = JSON.parse(JSON.stringify(proto.schedule));
            currentNotes = proto.notes || "";
            if (notesTextarea) notesTextarea.value = currentNotes;
            if (titleDisplay) titleDisplay.textContent = currentTitle;

            setModifiedState(markModified);
            updateProtoDropdown();
            saveState();
            renderSchedule();
        }
    }

    if (protoSelect) {
        protoSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                loadPrototype(e.target.value, false);
            }
        });
    }

    const btnSaveProto = document.getElementById('btn-save-proto');
    if (btnSaveProto) {
        btnSaveProto.addEventListener('click', () => {
            const name = prompt('Hvad skal dit skemaforslag hedde?', currentTitle !== 'Skemaforslag' ? currentTitle : 'Mit nye forslag');
            if (!name || !name.trim()) return;

            const newProto = {
                id: 'custom_proto_' + Date.now(),
                name: name.trim(),
                notes: notesTextarea ? notesTextarea.value : '',
                schedule: JSON.parse(JSON.stringify(currentSchedule))
            };

            customPrototypes.push(newProto);
            localStorage.setItem(STORAGE_KEY_CUSTOM_PROTOS, JSON.stringify(customPrototypes));
            activeProtoId = newProto.id;
            currentTitle = newProto.name;
            if (titleDisplay) titleDisplay.textContent = currentTitle;

            setModifiedState(false);
            updateProtoDropdown();
            saveState();
        });
    }

    const btnInsertMeals = document.getElementById('btn-insert-meals');
    if (btnInsertMeals) {
        btnInsertMeals.addEventListener('click', () => {
            const days = ['man', 'tir', 'ons', 'tor', 'fre'];
            days.forEach(day => {
                SETTINGS.mealBlocks.forEach(meal => {
                    const exists = currentSchedule.some(item => item.day === day && item.title === meal.title);
                    if (!exists) {
                        currentSchedule.push({
                            id: 'meal_' + day + '_' + meal.title + '_' + Date.now(),
                            day: day,
                            title: meal.title,
                            start: meal.start,
                            end: meal.end,
                            color: meal.color,
                            textColor: meal.textColor,
                            note: ''
                        });
                    }
                });
            });
            setModifiedState(true);
            saveState();
            renderSchedule();
        });
    }

    const btnClearSchedule = document.getElementById('btn-clear-schedule');
    if (btnClearSchedule) {
        btnClearSchedule.addEventListener('click', () => {
            if (confirm('Vil du rydde alle lektioner i skemaet?')) {
                currentSchedule = [];
                setModifiedState(true);
                saveState();
                renderSchedule();
            }
        });
    }

    if (notesTextarea) {
        notesTextarea.addEventListener('input', () => {
            currentNotes = notesTextarea.value;
            setModifiedState(true);
            saveState();
        });
    }

    document.querySelector('.editable-title-wrapper')?.addEventListener('click', () => {
        const newName = prompt('Omdøb dette skemaforslag:', currentTitle);
        if (!newName || !newName.trim()) return;

        currentTitle = newName.trim();
        if (titleDisplay) titleDisplay.textContent = currentTitle;

        if (activeProtoId && activeProtoId.startsWith('custom_proto_')) {
            const p = customPrototypes.find(item => item.id === activeProtoId);
            if (p) p.name = currentTitle;
            localStorage.setItem(STORAGE_KEY_CUSTOM_PROTOS, JSON.stringify(customPrototypes));
            updateProtoDropdown();
        }

        setModifiedState(true);
        saveState();
    });

    const btnNewBlock = document.getElementById('btn-new-block');
    if (btnNewBlock && customModal) {
        btnNewBlock.addEventListener('click', () => customModal.showModal());
        const btnCancelCustomBlock = document.getElementById('btn-cancel-custom-block');
        if (btnCancelCustomBlock) btnCancelCustomBlock.addEventListener('click', () => customModal.close());

        const customBlockForm = document.getElementById('custom-block-form');
        if (customBlockForm) {
            customBlockForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const title = customTitle.value.trim();
                const color = customColor.value;
                const dur = parseInt(customDuration.value, 10);
                if (!title) return;

                customBlocks.push({
                    id: 'cb_' + Date.now(),
                    title: title,
                    color: color,
                    textColor: '#ffffff',
                    defaultDuration: dur
                });

                localStorage.setItem(STORAGE_KEY_CUSTOM_BLOCKS, JSON.stringify(customBlocks));
                renderPaletteAndStats();
                customTitle.value = '';
                customModal.close();
            });
        }
    }

    const btnExportJson = document.getElementById('btn-export-json');
    if (btnExportJson) {
        btnExportJson.addEventListener('click', () => {
            const prototypeObject = {
                id: 'proto_' + Date.now(),
                name: currentTitle,
                notes: notesTextarea ? notesTextarea.value : "",
                schedule: currentSchedule
            };

            const jsonStr = JSON.stringify(prototypeObject, null, 4);
            const blob = new Blob([jsonStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            
            const safeName = currentTitle.replace(/[^a-z0-9æøå]/gi, '_').toLowerCase();
            a.href = url;
            a.download = `${safeName}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    const btnExportImage = document.getElementById('btn-export-image');
    if (btnExportImage) {
        btnExportImage.addEventListener('click', () => {
            const target = document.getElementById('export-target');
            if (!target || typeof window.html2canvas !== 'function') return;

            window.html2canvas(target, { scale: 2, backgroundColor: '#ffffff' }).then(canvas => {
                const link = document.createElement('a');
                link.download = `${currentTitle.replace(/\s+/g, '_')}_VIH.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
            });
        });
    }

    // --- 9. LOCALSTORAGE HJÆLPERE ---
    function saveState() {
        localStorage.setItem(STORAGE_KEY_CURRENT, JSON.stringify({
            schedule: currentSchedule,
            notes: notesTextarea ? notesTextarea.value : '',
            activeProtoId: activeProtoId,
            currentTitle: currentTitle,
            isModified: isModified
        }));
    }

    function loadFromStorage() {
        try {
            const storedBlocks = localStorage.getItem(STORAGE_KEY_CUSTOM_BLOCKS);
            if (storedBlocks) customBlocks = JSON.parse(storedBlocks);

            const storedProtos = localStorage.getItem(STORAGE_KEY_CUSTOM_PROTOS);
            if (storedProtos) customPrototypes = JSON.parse(storedProtos);

            const storedCurrent = localStorage.getItem(STORAGE_KEY_CURRENT);
            if (storedCurrent) {
                const parsed = JSON.parse(storedCurrent);
                if (parsed.activeProtoId) activeProtoId = parsed.activeProtoId;
                if (parsed.currentTitle) currentTitle = parsed.currentTitle;
                if (typeof parsed.isModified === 'boolean') isModified = parsed.isModified;
            }
        } catch (e) {
            console.warn('Fejl ved indlæsning af local storage:', e);
        }
    }

    function timeToMinutes(str) {
        const [h, m] = str.split(':').map(Number);
        return h * 60 + m;
    }

    function minutesToTime(totalMin) {
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    // Start
    init();
});