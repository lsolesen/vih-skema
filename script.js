import { VIH_SKEMA_SETTINGS } from './settings.js';
import { fetchPrototypes } from './prototypes.js';

document.addEventListener('DOMContentLoaded', () => {
    const SETTINGS = VIH_SKEMA_SETTINGS;
    SETTINGS.prototypes = []; // Fyldes dynamisk

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
    const paletteEl = document.getElementById('unified-palette');
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
    const btnDeleteEntry = document.getElementById('btn-delete-entry');

    const customModal = document.getElementById('custom-block-modal');
    const customTitle = document.getElementById('custom-title');
    const customColor = document.getElementById('custom-color');
    const customDuration = document.getElementById('custom-duration');

    // --- 1. INITIALISERING (Nu asynkron så vi kan hente filer) ---
    async function init() {
        loadFromStorage();
        buildTimeAxis();
        
        // Hent JSON filer fra prototypes-mappen
        SETTINGS.prototypes = await fetchPrototypes();
        
        updateProtoDropdown();

        if (activeProtoId) {
            loadPrototype(activeProtoId, false);
        } else if (SETTINGS.prototypes.length > 0) {
            loadPrototype(SETTINGS.prototypes[0].id, false);
        }

        renderPaletteAndStats();
        setupDragAndDrop();
    }

    function buildTimeAxis() {
        timeAxisEl.innerHTML = '';
        const { startHour, endHour, pixelPerHour } = SETTINGS.timeline;
        for (let hour = startHour; hour <= endHour; hour++) {
            const tick = document.createElement('div');
            tick.className = 'time-tick';
            tick.style.height = `${pixelPerHour}px`;
            tick.textContent = `${String(hour).padStart(2, '0')}:00`;
            timeAxisEl.appendChild(tick);
        }
    }

    // --- 2. STATUS-STYRING (Aktiv skabelon vs Kladde/Ændret) ---
    function setModifiedState(modified) {
        isModified = modified;

        if (isModified) {
            protoSelect.value = ""; 
            statusBadge.className = 'status-badge status-modified';
            statusBadgeText.textContent = '✏️ Kladde (ugemt ændring)';
        } else {
            statusBadge.className = 'status-badge status-saved';
            statusBadgeText.textContent = '★ Skabelon aktiv';
        }
    }

    // --- 3. SAMMENGROET PALETTE & TIMETÆLLER ---
    function renderPaletteAndStats() {
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
                <div class="palette-card-left">
                    <span class="palette-color-dot" style="background-color: ${b.color};"></span>
                    <span class="palette-name">${b.title}</span>
                </div>
                <div class="palette-card-right">
                    <span class="badge-count">${stat.count}x</span>
                    <span class="badge-time">${timeStr}</span>
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
    }

    // --- 4. DROP AF NYE BRIKKER FRA VENSTRE ---
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

                // 5-minutters snapping
                const roundedMinutes = Math.round(rawTotalMinutes / 5) * 5;
                const startStr = minutesToTime(roundedMinutes);
                const endStr = minutesToTime(roundedMinutes + blockData.defaultDuration);

                const newEntry = {
                    id: 'entry_' + Date.now(),
                    day: dayKey,
                    title: blockData.title,
                    start: startStr,
                    end: endStr,
                    color: blockData.color,
                    textColor: blockData.textColor,
                    note: ''
                };

                currentSchedule.push(newEntry);
                setModifiedState(true);
                saveState();
                renderSchedule();
            });
        });
    }

    // --- 5. RENDER SKEMAET ---
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

            const blockEl = document.createElement('div');
            blockEl.className = 'schedule-block';
            blockEl.dataset.entryId = entry.id;
            blockEl.style.top = `${topPx}px`;
            blockEl.style.height = `${heightPx}px`;
            blockEl.style.backgroundColor = entry.color;
            blockEl.style.color = entry.textColor || '#ffffff';

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

    // --- 6. FLYT OG JUSTER LÆNGDE ---
    function attachDragAndResize(blockEl, entry) {
        const resizeHandle = blockEl.querySelector('.block-resize-handle');
        const timeDisplay = blockEl.querySelector('.block-time');
        const { startHour, endHour, pixelPerHour } = SETTINGS.timeline;
        const timelineStartMin = startHour * 60;
        const timelineEndMin = endHour * 60;

        // Træk i bunden (Juster varighed)
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

        // Træk op/ned (Flyt tidspunkt)
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
        editingEntryId = entry.id;
        editTitle.value = entry.title;
        editStart.value = entry.start;
        editEnd.value = entry.end;
        editNote.value = entry.note || '';
        editModal.showModal();
    }

    document.getElementById('edit-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const entry = currentSchedule.find(item => item.id === editingEntryId);
        if (entry) {
            entry.title = editTitle.value.trim();
            entry.start = editStart.value;
            entry.end = editEnd.value;
            entry.note = editNote.value.trim();
            setModifiedState(true);
            saveState();
            renderSchedule();
        }
        editModal.close();
    });

    btnDeleteEntry.addEventListener('click', () => {
        currentSchedule = currentSchedule.filter(item => item.id !== editingEntryId);
        setModifiedState(true);
        saveState();
        renderSchedule();
        editModal.close();
    });

    // --- 8. OMDØB DIREKTE I OVERSKRIFTEN ---
    document.querySelector('.editable-title-wrapper').addEventListener('click', () => {
        const newName = prompt('Omdøb dette skemaforslag:', currentTitle);
        if (!newName || !newName.trim()) return;

        currentTitle = newName.trim();
        titleDisplay.textContent = currentTitle;

        if (activeProtoId && activeProtoId.startsWith('custom_proto_')) {
            const p = customPrototypes.find(item => item.id === activeProtoId);
            if (p) p.name = currentTitle;
            localStorage.setItem(STORAGE_KEY_CUSTOM_PROTOS, JSON.stringify(customPrototypes));
            updateProtoDropdown();
        }

        saveState();
    });

    // --- 9. INDSÆT FASTE MÅLTIDER ---
    document.getElementById('btn-insert-meals').addEventListener('click', () => {
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

    // --- 10. PROTOTYPER & FORSLAG ---
    function updateProtoDropdown() {
        protoSelect.innerHTML = '<option value="">-- Vælg foruddefineret skema --</option>';

        const builtGroup = document.createElement('optgroup');
        builtGroup.label = 'Faste prototyper (fra prototypes-mappen)';
        SETTINGS.prototypes.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            builtGroup.appendChild(opt);
        });
        protoSelect.appendChild(builtGroup);

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

        document.getElementById('btn-delete-proto').style.display = 
            (activeProtoId && activeProtoId.startsWith('custom_proto_') && !isModified) ? 'inline-block' : 'none';
    }

    function loadPrototype(id, markModified = false) {
        let proto = SETTINGS.prototypes.find(p => p.id === id);
        if (!proto) proto = customPrototypes.find(p => p.id === id);

        if (proto) {
            activeProtoId = proto.id;
            currentTitle = proto.name;
            currentSchedule = JSON.parse(JSON.stringify(proto.schedule));
            currentNotes = proto.notes || "";
            notesTextarea.value = currentNotes;
            titleDisplay.textContent = currentTitle;

            setModifiedState(markModified);
            updateProtoDropdown();
            saveState();
            renderSchedule();
        }
    }

    protoSelect.addEventListener('change', (e) => {
        if (e.target.value) {
            loadPrototype(e.target.value, false);
        }
    });

    document.getElementById('btn-save-proto').addEventListener('click', () => {
        const name = prompt('Hvad skal dit skemaforslag hedde?', currentTitle !== 'Skemaforslag' ? currentTitle : 'Mit nye forslag');
        if (!name || !name.trim()) return;

        const newProto = {
            id: 'custom_proto_' + Date.now(),
            name: name.trim(),
            notes: notesTextarea.value,
            schedule: JSON.parse(JSON.stringify(currentSchedule))
        };

        customPrototypes.push(newProto);
        localStorage.setItem(STORAGE_KEY_CUSTOM_PROTOS, JSON.stringify(customPrototypes));
        activeProtoId = newProto.id;
        currentTitle = newProto.name;
        titleDisplay.textContent = currentTitle;

        setModifiedState(false);
        updateProtoDropdown();
        saveState();
    });

    document.getElementById('btn-delete-proto').addEventListener('click', () => {
        if (!activeProtoId || !activeProtoId.startsWith('custom_proto_')) return;
        if (confirm(`Vil du slette forslaget "${currentTitle}"?`)) {
            customPrototypes = customPrototypes.filter(p => p.id !== activeProtoId);
            localStorage.setItem(STORAGE_KEY_CUSTOM_PROTOS, JSON.stringify(customPrototypes));
            loadPrototype(SETTINGS.prototypes[0].id, false);
        }
    });

    document.getElementById('btn-clear-schedule').addEventListener('click', () => {
        if (confirm('Vil du rydde alle lektioner i skemaet?')) {
            currentSchedule = [];
            setModifiedState(true);
            saveState();
            renderSchedule();
        }
    });

    notesTextarea.addEventListener('input', () => {
        currentNotes = notesTextarea.value;
        setModifiedState(true);
        saveState();
    });

    // --- 11. OPRET BRUGERDEFINERET BRIK ---
    document.getElementById('btn-new-block').addEventListener('click', () => {
        customModal.showModal();
    });

    document.getElementById('btn-cancel-custom-block').addEventListener('click', () => {
        customModal.close();
    });

    document.getElementById('custom-block-form').addEventListener('submit', (e) => {
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

    // --- 12. DOWNLOAD SOM JSON-FIL ---
    document.getElementById('btn-export-json').addEventListener('click', () => {
        const prototypeObject = {
            id: 'proto_' + Date.now(),
            name: currentTitle,
            notes: notesTextarea.value,
            schedule: currentSchedule
        };

        // Gør det til en JSON-streng og formatér pænt
        const jsonStr = JSON.stringify(prototypeObject, null, 4);
        
        // Opret et usynligt download-link
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        // Lav et pænt, web-venligt filnavn
        const safeName = currentTitle.replace(/[^a-z0-9æøå]/gi, '_').toLowerCase();
        
        a.href = url;
        a.download = `${safeName}.json`;
        document.body.appendChild(a);
        a.click();
        
        // Oprydning
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // --- 13. BILLEDEKSPORT (PNG) ---
    document.getElementById('btn-export-image').addEventListener('click', () => {
        const target = document.getElementById('export-target');

        if (typeof window.html2canvas !== 'function') {
            alert('html2canvas er ikke indlæst.');
            return;
        }

        window.html2canvas(target, {
            scale: 2,
            backgroundColor: '#ffffff'
        }).then(canvas => {
            const link = document.createElement('a');
            link.download = `${currentTitle.replace(/\s+/g, '_')}_VIH.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        }).catch(err => {
            console.error('Billedeksport fejlede:', err);
        });
    });

    // --- LOCALSTORAGE HJÆLPERE ---
    function saveState() {
        localStorage.setItem(STORAGE_KEY_CURRENT, JSON.stringify({
            schedule: currentSchedule,
            notes: notesTextarea.value,
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

    init();
});