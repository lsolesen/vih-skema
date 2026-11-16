import {
    SETTINGS,
    state,
    saveCustomBlocks,
    saveConstraints,
    resetConstraintsToDefault
} from './state.js';

import {
    DAY_KEYS,
    DAY_LABELS,
    DAY_SHORT,
    isEntryTeaching,
    isBlockTitleTeaching,
    getBlockColors,
    evaluateScheduleConstraints
} from './utils.js';

let callbacks = {
    onScheduleChanged: () => {},
    onConstraintsChanged: () => {},
    onBlocksChanged: () => {}
};

let dom = {};

export function openEditModal(entry) {
    if (!dom.editModal || !entry) return;
    state.editingEntryId = entry.id;

    dom.editTitle.value = entry.title;
    dom.editStart.value = entry.start;
    dom.editEnd.value = entry.end;
    dom.editNote.value = entry.note || '';

    const currentEffectiveColors = getBlockColors(entry, SETTINGS, state.customBlocks);
    dom.editColor.value = entry.colorOverride && entry.overrideColor
        ? entry.overrideColor
        : currentEffectiveColors.color;
    dom.editUseOverride.checked = !!entry.colorOverride;

    if (dom.editIsTeaching) {
        dom.editIsTeaching.checked = isEntryTeaching(entry, SETTINGS, state.customBlocks);
    }

    dom.editModal.showModal();
}

export function openCustomBlockModal() {
    if (!dom.customModal) return;
    if (dom.customIsTeaching) dom.customIsTeaching.checked = true;
    dom.customModal.showModal();
}

function switchConstraintsSubtab(targetId) {
    if (!dom.constraintsModal) return;
    dom.constraintsModal.querySelectorAll('.modal-subtab').forEach(b => {
        b.classList.toggle('active', b.dataset.ctab === targetId);
    });
    dom.constraintsModal.querySelectorAll('.modal-subpane').forEach(p => {
        p.style.display = p.id === targetId ? 'block' : 'none';
    });
}

export function openConstraintsModal(initialSubtab = 'ctab-check') {
    if (!dom.constraintsModal) return;
    if (dom.ctabProtoName) dom.ctabProtoName.textContent = state.currentTitle;
    renderConstraintsModalContent();
    switchConstraintsSubtab(initialSubtab);
    dom.constraintsModal.showModal();
}

function renderConstraintsModalContent() {
    const evalRes = evaluateScheduleConstraints(
        state.currentSchedule,
        state.activeConstraints,
        SETTINGS,
        state.customBlocks
    );

    // 1. Live tjek af aktuelt skema
    if (dom.constraintsCheckResults) {
        let html = '';
        if (evalRes.errors.length === 0 && evalRes.warnings.length === 0) {
            html = `
                <div style="padding: 1rem; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #166534; font-weight: 700; font-size: 0.85rem;">
                    ✅ "${state.currentTitle}" overholder alle spisetider, lokalebegrænsninger og ugentlige fagkrav!
                </div>
            `;
        } else {
            if (evalRes.errors.length > 0) {
                html += `
                    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 0.75rem;">
                        <div style="font-weight: 800; font-size: 0.82rem; color: #991b1b; margin-bottom: 6px;">🚫 Konflikter med spisetider / idrætslokaler (${evalRes.errors.length})</div>
                        <ul style="margin-left: 1.1rem; font-size: 0.8rem; color: #7f1d1d; display: flex; flex-direction: column; gap: 4px;">
                            ${evalRes.errors.map(m => `<li>${m}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }
            if (evalRes.warnings.length > 0) {
                html += `
                    <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 0.75rem;">
                        <div style="font-weight: 800; font-size: 0.82rem; color: #92400e; margin-bottom: 6px;">⚠️ Afvigelser fra samlede ugekrav / bemærkninger (${evalRes.warnings.length})</div>
                        <ul style="margin-left: 1.1rem; font-size: 0.8rem; color: #78350f; display: flex; flex-direction: column; gap: 4px;">
                            ${evalRes.warnings.map(m => `<li>${m}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }
        }
        dom.constraintsCheckResults.innerHTML = html;
    }

    // 2. Lokaler & spisetider
    if (dom.constraintsRulesEditor) {
        const facHtml = (state.activeConstraints.facilityRestrictions || []).map((fac, idx) => {
            const daysHtml = DAY_KEYS.map(d => `
                <label class="day-chip-label">
                    <input type="checkbox" class="fac-day-cb" data-idx="${idx}" value="${d}" ${(fac.days || []).includes(d) ? 'checked' : ''}> ${DAY_SHORT[d]}
                </label>
            `).join('');

            return `
                <div class="constraint-item-card">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                        <input type="text" class="fac-label-inp" data-idx="${idx}" value="${fac.label}" style="font-weight: 700; font-size: 0.82rem; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 5px; flex: 1;">
                        <button type="button" class="btn-del-fac" data-idx="${idx}" title="Slet regel" style="background:none; border:none; color:#dc2626; font-size:1.1rem; cursor:pointer;">&times;</button>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 0.78rem;">
                        <span>Spærret:</span>
                        <input type="time" class="fac-start-inp" data-idx="${idx}" value="${fac.blockedStart}" style="padding: 2px 5px; border: 1px solid #cbd5e1; border-radius: 4px;">
                        <span>–</span>
                        <input type="time" class="fac-end-inp" data-idx="${idx}" value="${fac.blockedEnd}" style="padding: 2px 5px; border: 1px solid #cbd5e1; border-radius: 4px;">
                        <span>Fag:</span>
                        <input type="text" class="fac-applies-inp" data-idx="${idx}" value="${(fac.appliesTo || []).join(', ')}" placeholder="Idræt 1, Idræt 2..." style="padding: 3px 6px; border: 1px solid #cbd5e1; border-radius: 4px; flex: 1; min-width: 140px;">
                    </div>
                    <div class="constraint-days-row">${daysHtml}</div>
                </div>
            `;
        }).join('');

        const winHtml = (state.activeConstraints.blockedWindows || []).map((win, idx) => {
            const winDays = win.days || DAY_KEYS;
            const timesByDay = win.timesByDay || {};
            const customDayCount = winDays.filter(d => Boolean(timesByDay[d])).length;

            const daysHtml = DAY_KEYS.map(d => `
                <label class="day-chip-label">
                    <input type="checkbox" class="win-day-cb" data-idx="${idx}" value="${d}" ${winDays.includes(d) ? 'checked' : ''}> ${DAY_SHORT[d]}
                </label>
            `).join('');

            const perDayRows = winDays.map(d => {
                const custom = timesByDay[d];
                const dStart = custom ? custom.start : win.start;
                const dEnd = custom ? custom.end : win.end;
                return `
                    <div style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; padding: 2px 0;">
                        <span style="width: 68px; font-weight: 700; color: ${custom ? '#b45309' : '#475569'};">${DAY_LABELS[d]}:</span>
                        <input type="time" class="win-day-start-inp" data-idx="${idx}" data-day="${d}" value="${dStart}" style="padding: 1px 4px; border: 1px solid ${custom ? '#f59e0b' : '#cbd5e1'}; border-radius: 4px; font-size: 0.74rem;">
                        <span>–</span>
                        <input type="time" class="win-day-end-inp" data-idx="${idx}" data-day="${d}" value="${dEnd}" style="padding: 1px 4px; border: 1px solid ${custom ? '#f59e0b' : '#cbd5e1'}; border-radius: 4px; font-size: 0.74rem;">
                        ${custom
                            ? `<button type="button" class="btn-reset-win-day" data-idx="${idx}" data-day="${d}" title="Nulstil til standardtid (${win.start}–${win.end})" style="background:none; border:none; color:#dc2626; cursor:pointer; font-size:0.78rem; font-weight:800;">↺</button>`
                            : `<span style="font-size: 0.68rem; color: #94a3b8;">(standard)</span>`}
                    </div>
                `;
            }).join('');

            return `
                <div class="constraint-item-card">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                        <input type="text" class="win-label-inp" data-idx="${idx}" value="${win.label}" style="font-weight: 700; font-size: 0.8rem; padding: 3px 6px; border: 1px solid #cbd5e1; border-radius: 4px; flex: 1; min-width: 160px;">
                        <div style="display: flex; gap: 6px; align-items: center; font-size: 0.78rem;">
                            <span style="color: var(--text-muted); font-size: 0.72rem;">Standard:</span>
                            <input type="time" class="win-start-inp" data-idx="${idx}" value="${win.start}" style="padding: 2px 5px; border: 1px solid #cbd5e1; border-radius: 4px;">
                            <span>–</span>
                            <input type="time" class="win-end-inp" data-idx="${idx}" value="${win.end}" style="padding: 2px 5px; border: 1px solid #cbd5e1; border-radius: 4px;">
                        </div>
                        <button type="button" class="btn-del-win" data-idx="${idx}" title="Slet spærretid" style="background:none; border:none; color:#dc2626; font-size:1.1rem; cursor:pointer;">&times;</button>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                        <div class="constraint-days-row">${daysHtml}</div>
                    </div>
                    <details ${customDayCount > 0 ? 'open' : ''} style="margin-top: 2px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 8px;">
                        <summary style="font-size: 0.72rem; font-weight: 700; color: #475569; cursor: pointer; user-select: none;">
                            Afvigende tider pr. dag ${customDayCount > 0 ? `(${customDayCount} tilpasset)` : ''}
                        </summary>
                        <div style="margin-top: 5px; display: flex; flex-direction: column; gap: 3px;">
                            ${perDayRows}
                        </div>
                    </details>
                </div>
            `;
        }).join('');

        dom.constraintsRulesEditor.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="font-size: 0.82rem;">🏟️ Efterskolens idrætslokaler (spærretider)</strong>
                <button type="button" id="btn-add-fac-rule" class="btn btn-outline btn-sm">+ Tilføj lokaleregel</button>
            </div>
            ${facHtml}
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top: 6px;">
                <strong style="font-size: 0.82rem;">🍽️ Efterskolens spisetider (som ikke må overlappe vores spisetider)</strong>
                <button type="button" id="btn-add-win-rule" class="btn btn-outline btn-sm">+ Tilføj spærretid</button>
            </div>
            ${winHtml}
        `;

        // Facility events
        dom.constraintsRulesEditor.querySelectorAll('.fac-label-inp').forEach(inp => {
            inp.addEventListener('input', () => {
                state.activeConstraints.facilityRestrictions[inp.dataset.idx].label = inp.value;
                saveConstraints();
                callbacks.onConstraintsChanged();
            });
        });
        dom.constraintsRulesEditor.querySelectorAll('.fac-start-inp').forEach(inp => {
            inp.addEventListener('change', () => {
                state.activeConstraints.facilityRestrictions[inp.dataset.idx].blockedStart = inp.value;
                saveConstraints();
                callbacks.onConstraintsChanged();
            });
        });
        dom.constraintsRulesEditor.querySelectorAll('.fac-end-inp').forEach(inp => {
            inp.addEventListener('change', () => {
                state.activeConstraints.facilityRestrictions[inp.dataset.idx].blockedEnd = inp.value;
                saveConstraints();
                callbacks.onConstraintsChanged();
            });
        });
        dom.constraintsRulesEditor.querySelectorAll('.fac-applies-inp').forEach(inp => {
            inp.addEventListener('input', () => {
                state.activeConstraints.facilityRestrictions[inp.dataset.idx].appliesTo = inp.value
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean);
                saveConstraints();
                callbacks.onConstraintsChanged();
            });
        });
        dom.constraintsRulesEditor.querySelectorAll('.fac-day-cb').forEach(cb => {
            cb.addEventListener('change', () => {
                const idx = parseInt(cb.dataset.idx, 10);
                const checkedDays = Array.from(
                    dom.constraintsRulesEditor.querySelectorAll(`.fac-day-cb[data-idx="${idx}"]:checked`)
                ).map(c => c.value);
                state.activeConstraints.facilityRestrictions[idx].days = checkedDays;
                saveConstraints();
                callbacks.onConstraintsChanged();
            });
        });
        dom.constraintsRulesEditor.querySelectorAll('.btn-del-fac').forEach(btn => {
            btn.addEventListener('click', () => {
                state.activeConstraints.facilityRestrictions.splice(parseInt(btn.dataset.idx, 10), 1);
                saveConstraints();
                renderConstraintsModalContent();
                callbacks.onConstraintsChanged();
            });
        });

        // Blocked windows (Efterskolens spisetider) events
        dom.constraintsRulesEditor.querySelectorAll('.win-label-inp').forEach(inp => {
            inp.addEventListener('input', () => {
                state.activeConstraints.blockedWindows[inp.dataset.idx].label = inp.value;
                saveConstraints();
                callbacks.onConstraintsChanged();
            });
        });
        dom.constraintsRulesEditor.querySelectorAll('.win-start-inp').forEach(inp => {
            inp.addEventListener('change', () => {
                state.activeConstraints.blockedWindows[inp.dataset.idx].start = inp.value;
                saveConstraints();
                renderConstraintsModalContent();
                callbacks.onConstraintsChanged();
            });
        });
        dom.constraintsRulesEditor.querySelectorAll('.win-end-inp').forEach(inp => {
            inp.addEventListener('change', () => {
                state.activeConstraints.blockedWindows[inp.dataset.idx].end = inp.value;
                saveConstraints();
                renderConstraintsModalContent();
                callbacks.onConstraintsChanged();
            });
        });
        dom.constraintsRulesEditor.querySelectorAll('.win-day-cb').forEach(cb => {
            cb.addEventListener('change', () => {
                const idx = parseInt(cb.dataset.idx, 10);
                const checkedDays = Array.from(
                    dom.constraintsRulesEditor.querySelectorAll(`.win-day-cb[data-idx="${idx}"]:checked`)
                ).map(c => c.value);
                state.activeConstraints.blockedWindows[idx].days = checkedDays;
                saveConstraints();
                renderConstraintsModalContent();
                callbacks.onConstraintsChanged();
            });
        });

        const handlePerDayWindowChange = (idx, day) => {
            const win = state.activeConstraints.blockedWindows[idx];
            if (!win) return;
            const sInp = dom.constraintsRulesEditor.querySelector(`.win-day-start-inp[data-idx="${idx}"][data-day="${day}"]`);
            const eInp = dom.constraintsRulesEditor.querySelector(`.win-day-end-inp[data-idx="${idx}"][data-day="${day}"]`);
            if (!sInp || !eInp) return;

            if (!win.timesByDay) win.timesByDay = {};
            if (sInp.value === win.start && eInp.value === win.end) {
                delete win.timesByDay[day];
            } else {
                win.timesByDay[day] = { start: sInp.value, end: eInp.value };
            }
            saveConstraints();
            renderConstraintsModalContent();
            callbacks.onConstraintsChanged();
        };

        dom.constraintsRulesEditor.querySelectorAll('.win-day-start-inp, .win-day-end-inp').forEach(inp => {
            inp.addEventListener('change', () => {
                handlePerDayWindowChange(parseInt(inp.dataset.idx, 10), inp.dataset.day);
            });
        });

        dom.constraintsRulesEditor.querySelectorAll('.btn-reset-win-day').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx, 10);
                const win = state.activeConstraints.blockedWindows[idx];
                if (win && win.timesByDay) {
                    delete win.timesByDay[btn.dataset.day];
                    saveConstraints();
                    renderConstraintsModalContent();
                    callbacks.onConstraintsChanged();
                }
            });
        });

        dom.constraintsRulesEditor.querySelectorAll('.btn-del-win').forEach(btn => {
            btn.addEventListener('click', () => {
                state.activeConstraints.blockedWindows.splice(parseInt(btn.dataset.idx, 10), 1);
                saveConstraints();
                renderConstraintsModalContent();
                callbacks.onConstraintsChanged();
            });
        });

        document.getElementById('btn-add-fac-rule')?.addEventListener('click', () => {
            state.activeConstraints.facilityRestrictions.push({
                id: 'fac_' + Date.now(),
                label: 'Ny lokalebegrænsning',
                appliesTo: ['Idræt 1', 'Idræt 2'],
                days: ['man', 'tir', 'ons', 'tor', 'fre'],
                blockedStart: '15:30',
                blockedEnd: '17:00',
                severity: 'error'
            });
            saveConstraints();
            renderConstraintsModalContent();
            callbacks.onConstraintsChanged();
        });

        document.getElementById('btn-add-win-rule')?.addEventListener('click', () => {
            state.activeConstraints.blockedWindows.push({
                id: 'win_' + Date.now(),
                label: 'Efterskolen spiser',
                days: ['man', 'tir', 'ons', 'tor', 'fre'],
                start: '11:30',
                end: '12:00',
                timesByDay: {},
                severity: 'error'
            });
            saveConstraints();
            renderConstraintsModalContent();
            callbacks.onConstraintsChanged();
        });
    }

    // 3. Samlede ugekrav & ændringsønsker pr. fag
    if (dom.constraintsWishesEditor) {
        const allTeachingBlocks = [...(SETTINGS.defaultBlocks || []), ...state.customBlocks]
            .filter(b => isBlockTitleTeaching(b.title, SETTINGS, state.customBlocks));

        const rows = allTeachingBlocks.map(b => {
            const wish = state.activeConstraints.blockWishes[b.title] || {};
            const weeklyMin = wish.desiredWeeklyMinutes > 0
                ? wish.desiredWeeklyMinutes
                : (wish.desiredDuration > 0 && wish.desiredWeeklyCount > 0
                    ? wish.desiredDuration * wish.desiredWeeklyCount
                    : 0);
            const hoursHint = weeklyMin > 0 ? `= ${(weeklyMin / 60).toFixed(1)}t` : '';

            return `
                <tr>
                    <td>
                        <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${b.color};margin-right:5px;"></span>
                        <strong>${b.title}</strong>
                    </td>
                    <td>
                        <div style="display:flex; align-items:center; gap:5px;">
                            <input type="number" min="0" step="5" class="bw-wmin-inp" data-title="${b.title}" value="${weeklyMin || ''}" placeholder="0" style="width: 72px; padding: 3px 5px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.78rem;">
                            <span class="bw-hours-hint" style="font-size: 0.72rem; color: var(--text-muted); white-space: nowrap;">min ${hoursHint}</span>
                        </div>
                    </td>
                    <td>
                        <input type="text" class="bw-note-inp" data-title="${b.title}" value="${wish.note || ''}" placeholder="Skriv ønske til ændring..." style="width: 100%; padding: 3px 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.78rem;">
                    </td>
                </tr>
            `;
        }).join('');

        dom.constraintsWishesEditor.innerHTML = `
            <p style="font-size: 0.76rem; color: var(--text-muted); margin-bottom: 4px;">
                Angiv det samlede ugentlige minutkrav pr. fag (uanset hvordan modulerne fordeles) samt eventuelle ønsker til ændringer.
            </p>
            <table class="sim-table">
                <thead>
                    <tr>
                        <th>Fag</th>
                        <th style="width: 165px;">Samlet ugekrav</th>
                        <th>Bemærkning / ændringsønske</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;

        const ensureWishObj = (title) => {
            if (!state.activeConstraints.blockWishes[title]) {
                state.activeConstraints.blockWishes[title] = { desiredWeeklyMinutes: 0, note: '' };
            }
            return state.activeConstraints.blockWishes[title];
        };

        dom.constraintsWishesEditor.querySelectorAll('.bw-wmin-inp').forEach(inp => {
            inp.addEventListener('input', () => {
                const val = parseInt(inp.value, 10) || 0;
                const obj = ensureWishObj(inp.dataset.title);
                obj.desiredWeeklyMinutes = val;
                delete obj.desiredDuration;
                delete obj.desiredWeeklyCount;

                const hintEl = inp.parentElement.querySelector('.bw-hours-hint');
                if (hintEl) hintEl.textContent = val > 0 ? `min = ${(val / 60).toFixed(1)}t` : 'min';

                saveConstraints();
                callbacks.onConstraintsChanged();
            });
        });

        dom.constraintsWishesEditor.querySelectorAll('.bw-note-inp').forEach(inp => {
            inp.addEventListener('input', () => {
                ensureWishObj(inp.dataset.title).note = inp.value;
                saveConstraints();
            });
        });
    }
}

export function initModals(customCallbacks = {}) {
    callbacks = { ...callbacks, ...customCallbacks };

    dom = {
        editModal: document.getElementById('edit-modal'),
        editForm: document.getElementById('edit-form'),
        editTitle: document.getElementById('edit-title'),
        editStart: document.getElementById('edit-start'),
        editEnd: document.getElementById('edit-end'),
        editNote: document.getElementById('edit-note'),
        editColor: document.getElementById('edit-color'),
        editUseOverride: document.getElementById('edit-use-override'),
        editIsTeaching: document.getElementById('edit-is-teaching'),
        btnDeleteEntry: document.getElementById('btn-delete-entry'),

        customModal: document.getElementById('custom-block-modal'),
        customForm: document.getElementById('custom-block-form'),
        customTitle: document.getElementById('custom-title'),
        customColor: document.getElementById('custom-color'),
        customDuration: document.getElementById('custom-duration'),
        customIsTeaching: document.getElementById('custom-is-teaching'),
        btnNewBlock: document.getElementById('btn-new-block'),

        constraintsModal: document.getElementById('constraints-modal'),
        btnOpenConstraints: document.getElementById('btn-open-constraints'),
        btnCloseConstraints: document.getElementById('btn-close-constraints'),
        btnDoneConstraints: document.getElementById('btn-done-constraints'),
        btnResetConstraints: document.getElementById('btn-reset-constraints'),
        btnCopyConstraintsSettings: document.getElementById('btn-copy-constraints-settings'),
        btnCopyConstraintsPrompt: document.getElementById('btn-copy-constraints-prompt'),
        ctabProtoName: document.getElementById('ctab-proto-name'),
        constraintsCheckResults: document.getElementById('constraints-check-results'),
        constraintsRulesEditor: document.getElementById('constraints-rules-editor'),
        constraintsWishesEditor: document.getElementById('constraints-wishes-editor')
    };

    if (dom.editForm && dom.editModal) {
        dom.editForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const entry = state.currentSchedule.find(item => item.id === state.editingEntryId);
            if (entry) {
                entry.title = dom.editTitle.value.trim();
                entry.start = dom.editStart.value;
                entry.end = dom.editEnd.value;
                entry.note = dom.editNote.value.trim();

                if (dom.editIsTeaching) {
                    entry.isTeaching = dom.editIsTeaching.checked;
                }

                entry.colorOverride = dom.editUseOverride.checked;
                if (entry.colorOverride) {
                    entry.overrideColor = dom.editColor.value;
                    entry.overrideTextColor = '#ffffff';
                } else {
                    entry.overrideColor = '';
                }

                callbacks.onScheduleChanged();
            }
            dom.editModal.close();
        });
    }

    dom.btnDeleteEntry?.addEventListener('click', () => {
        state.currentSchedule = state.currentSchedule.filter(item => item.id !== state.editingEntryId);
        callbacks.onScheduleChanged();
        dom.editModal?.close();
    });

    document.getElementById('btn-cancel-edit')?.addEventListener('click', () => dom.editModal?.close());
    document.getElementById('btn-close-edit')?.addEventListener('click', () => dom.editModal?.close());
    dom.editModal?.addEventListener('click', (e) => { if (e.target === dom.editModal) dom.editModal.close(); });

    dom.btnNewBlock?.addEventListener('click', (e) => {
        e.stopPropagation();
        openCustomBlockModal();
    });
    document.getElementById('btn-cancel-custom-block')?.addEventListener('click', () => dom.customModal?.close());
    dom.customModal?.addEventListener('click', (e) => { if (e.target === dom.customModal) dom.customModal.close(); });

    if (dom.customForm && dom.customModal) {
        dom.customForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const title = dom.customTitle.value.trim();
            if (!title) return;

            state.customBlocks.push({
                id: 'cb_' + Date.now(),
                title,
                color: dom.customColor.value,
                textColor: '#ffffff',
                defaultDuration: parseInt(dom.customDuration.value, 10),
                isTeaching: dom.customIsTeaching ? dom.customIsTeaching.checked : true
            });
            saveCustomBlocks();
            callbacks.onBlocksChanged();
            dom.customTitle.value = '';
            dom.customModal.close();
        });
    }

    if (dom.constraintsModal) {
        dom.constraintsModal.querySelectorAll('.modal-subtab').forEach(btn => {
            btn.addEventListener('click', () => switchConstraintsSubtab(btn.dataset.ctab));
        });
        dom.constraintsModal.addEventListener('click', (e) => {
            if (e.target === dom.constraintsModal) dom.constraintsModal.close();
        });
    }

    dom.btnOpenConstraints?.addEventListener('click', () => openConstraintsModal('ctab-rules'));
    dom.btnCloseConstraints?.addEventListener('click', () => dom.constraintsModal?.close());
    dom.btnDoneConstraints?.addEventListener('click', () => dom.constraintsModal?.close());

    dom.btnResetConstraints?.addEventListener('click', () => {
        if (confirm('Vil du nulstille begrænsninger og fagønsker tilbage til standarderne i settings.js?')) {
            resetConstraintsToDefault();
            renderConstraintsModalContent();
            callbacks.onConstraintsChanged();
        }
    });

    dom.btnCopyConstraintsSettings?.addEventListener('click', async () => {
        const snippet = `    // 4. Begrænsninger & samlede ugekrav pr. fag\n    constraints: ${JSON.stringify(state.activeConstraints, null, 4).replace(/\n/g, '\n    ')}`;
        try {
            await navigator.clipboard.writeText(snippet);
            const orig = dom.btnCopyConstraintsSettings.textContent;
            dom.btnCopyConstraintsSettings.textContent = '✅ Kopieret til settings.js!';
            setTimeout(() => { dom.btnCopyConstraintsSettings.textContent = orig; }, 2200);
        } catch (err) {
            prompt('Kopiér dette ind i settings.js:', snippet);
        }
    });

    dom.btnCopyConstraintsPrompt?.addEventListener('click', async () => {
        const evalRes = evaluateScheduleConstraints(
            state.currentSchedule,
            state.activeConstraints,
            SETTINGS,
            state.customBlocks
        );

        const profileText = [
            `### Ønske- & begrænsningsprofil for "${state.currentTitle}"`,
            ``,
            `**1. Begrænsninger (lokaler & spisetider):**`,
            '```json',
            JSON.stringify({
                blockedWindows: state.activeConstraints.blockedWindows,
                facilityRestrictions: state.activeConstraints.facilityRestrictions
            }, null, 2),
            '```',
            ``,
            `**2. Samlede ugekrav & ændringsønsker:**`,
            '```json',
            JSON.stringify(state.activeConstraints.blockWishes, null, 2),
            '```',
            ``,
            `**3. Aktuelle konflikter/afvigelser (${evalRes.errors.length} konflikter, ${evalRes.warnings.length} afvigelser):**`,
            ...(evalRes.errors.length || evalRes.warnings.length
                ? [...evalRes.errors.map(e => `- [KONFLIKT] ${e}`), ...evalRes.warnings.map(w => `- [UGE-KRAV] ${w}`)]
                : ['- Ingen konflikter eller afvigelser']),
            ``,
            `**4. Nuværende skema (${state.currentTitle}):**`,
            '```json',
            JSON.stringify(state.currentSchedule, null, 2),
            '```'
        ].join('\n');

        try {
            await navigator.clipboard.writeText(profileText);
            const orig = dom.btnCopyConstraintsPrompt.textContent;
            dom.btnCopyConstraintsPrompt.textContent = '✅ Profil kopieret!';
            setTimeout(() => { dom.btnCopyConstraintsPrompt.textContent = orig; }, 2200);
        } catch (err) {
            prompt('Kopiér denne profil til chatten:', profileText);
        }
    });
}