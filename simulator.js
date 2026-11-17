import {
    SETTINGS,
    state,
    saveWishPlacements,
    saveCustomWishes,
    saveWeekOverrides,
    saveSidebarSectionsState,
    resetLocalCalendarEdits
} from './state.js';

import {
    MEAL_TITLES,
    DAY_KEYS,
    DAY_LABELS,
    DAY_SHORT,
    timeToMinutes,
    isEntryTeaching,
    isBlockTitleTeaching,
    getBlockColors,
    downloadJsonFile
} from './utils.js';

// Vite scanner automatisk ./calendars/*.json
const calendarModules = import.meta.glob('./calendars/*.json', { eager: true });
const scannedCalendars = Object.entries(calendarModules)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([path, mod]) => {
        const data = JSON.parse(JSON.stringify(mod.default || mod));
        const fileName = path.split('/').pop().replace(/\.json$/i, '');
        if (!data.id) data.id = fileName;
        if (!data.name) data.name = fileName;
        return data;
    });

let callbacks = {
    syncUrlState: () => {},
    openWishesSection: () => {}
};

// DOM-referencer (sættes ved initSimulator)
let dom = {};
const openPendingWishIds = new Set();

export function getActiveCalendar() {
    if (!dom.semesterSelect || scannedCalendars.length === 0) return null;
    const baseCal = scannedCalendars.find(c => c.id === dom.semesterSelect.value) || scannedCalendars[0];
    if (!baseCal) return null;

    const cal = JSON.parse(JSON.stringify(baseCal));
    if (!cal.wishes) cal.wishes = [];

    cal.weeks.forEach(w => {
        (w.changes || []).forEach((c, idx) => {
            c._source = 'base';
            c._baseIdx = idx;
        });
    });

    // 1. Egne ønsker fra localStorage
    const extraWishes = state.customWishesByCal[cal.id] || [];
    extraWishes.forEach(cw => cal.wishes.push({ ...cw, _customWish: true }));

    // 2. Fjern slettede/redigerede base-ændringer
    const ovData = state.weekOverridesByCal[cal.id] || { added: [], removed: [] };
    (ovData.removed || []).forEach(rem => {
        const wObj = cal.weeks.find(w => w.week === rem.week);
        if (wObj && wObj.changes) {
            wObj.changes = wObj.changes.filter(c => {
                if (c._source !== 'base') return true;
                if (typeof rem.baseIdx === 'number') return c._baseIdx !== rem.baseIdx;
                return !(c.day === rem.day && c.title === rem.title && (c.start || '') === (rem.start || ''));
            });
        }
    });

    // 3. Fastlagte ønsker
    const extraPlacements = state.wishPlacementsByCal[cal.id] || [];
    extraPlacements.forEach(pl => {
        const wObj = cal.weeks.find(w => w.week === pl.week);
        if (wObj) {
            if (!wObj.changes) wObj.changes = [];
            wObj.changes.push({ ...pl.change, _fromBrowser: true, _source: 'wish' });
        }
    });

    // 4. Lokale uge-overrides
    (ovData.added || []).forEach(ov => {
        const wObj = cal.weeks.find(w => w.week === ov.week);
        if (wObj) {
            if (!wObj.changes) wObj.changes = [];
            wObj.changes.push({ ...ov.change, _fromBrowser: true, _source: 'override', _overrideId: ov.id });
        }
    });

    return cal;
}

function hasLocalCalendarEdits(calId) {
    const extraPlacements = state.wishPlacementsByCal[calId] || [];
    const extraWishes = state.customWishesByCal[calId] || [];
    const ov = state.weekOverridesByCal[calId] || { added: [], removed: [] };
    return (
        extraPlacements.length > 0 ||
        extraWishes.length > 0 ||
        (ov.added && ov.added.length > 0) ||
        (ov.removed && ov.removed.length > 0)
    );
}

function populateSemesterDropdown() {
    if (!dom.semesterSelect) return;
    dom.semesterSelect.innerHTML = '';

    if (scannedCalendars.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Ingen filer i /calendars/';
        dom.semesterSelect.appendChild(opt);
        return;
    }

    scannedCalendars.forEach(cal => {
        const opt = document.createElement('option');
        opt.value = cal.id;
        opt.textContent = cal.name;
        dom.semesterSelect.appendChild(opt);
    });
}

function simulateWeek(weekObj, baseSchedule, useBufferRescue) {
    const changes = weekObj.changes || [];
    const dayResults = {};
    const cancelledSubjectBlocks = [];

    DAY_KEYS.forEach(day => {
        const dayChanges = changes.filter(c => c.day === day);
        const dayBase = baseSchedule
            .filter(e => e.day === day)
            .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
        const items = [];

        dayBase.forEach(entry => {
            const eStart = timeToMinutes(entry.start);
            const eEnd = timeToMinutes(entry.end);
            const eDur = Math.max(eEnd - eStart, 0);
            const isMeal = MEAL_TITLES.includes(entry.title);
            const teachingFlag = isEntryTeaching(entry, SETTINGS, state.customBlocks);

            const overlappingChange = !isMeal && dayChanges.find(chg => {
                const overlap = Math.min(eEnd, timeToMinutes(chg.end || '23:59')) - Math.max(eStart, timeToMinutes(chg.start || '00:00'));
                return overlap > 10;
            });

            if (overlappingChange) {
                items.push({
                    ...entry,
                    isMeal,
                    isTeaching: teachingFlag,
                    simStatus: 'cancelled',
                    simReason: overlappingChange.title || 'Aflyst',
                    effectiveMinutes: 0
                });
                if (teachingFlag) {
                    cancelledSubjectBlocks.push({ title: entry.title, duration: eDur, day });
                }
            } else {
                items.push({
                    ...entry,
                    isMeal,
                    isTeaching: teachingFlag,
                    simStatus: 'normal',
                    effectiveMinutes: eDur
                });
            }
        });

        dayChanges.forEach(chg => {
            const cStart = timeToMinutes(chg.start || '08:00');
            const cEnd = timeToMinutes(chg.end || '16:00');
            const lunchOverlap = Math.max(0, Math.min(cEnd, 750) - Math.max(cStart, 720));
            const netMins = chg.effectiveMinutes !== undefined
                ? chg.effectiveMinutes
                : Math.max(0, (cEnd - cStart) - lunchOverlap);
            const isHoliday = chg.type === 'holiday';
            const isNoTeaching = isHoliday || chg.type === 'cancel';

            items.push({
                day,
                title: chg.title,
                start: chg.start || '08:00',
                end: chg.end || '16:00',
                isMeal: false,
                isTeaching: !isNoTeaching,
                rawType: chg.type || 'event',
                simStatus: chg.type === 'immersion'
                    ? 'immersion'
                    : (isHoliday ? 'holiday' : (chg.type === 'cancel' ? 'cancel_notice' : 'event')),
                targetBlock: chg.targetBlock || null,
                effectiveMinutes: isNoTeaching ? 0 : netMins,
                _source: chg._source || 'base',
                _baseIdx: chg._baseIdx,
                _overrideId: chg._overrideId || null,
                wishId: chg.wishId || null
            });
        });

        items.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
        dayResults[day] = { items, changes: dayChanges };
    });

    if (useBufferRescue && cancelledSubjectBlocks.length > 0) {
        DAY_KEYS.forEach(day => {
            dayResults[day].items.forEach(item => {
                if (item.title === 'BUFFER' && item.simStatus === 'normal' && cancelledSubjectBlocks.length > 0) {
                    const rescued = cancelledSubjectBlocks.shift();
                    item.title = `${rescued.title} (via BUFFER)`;
                    item.rescuedTitle = rescued.title;
                    item.isTeaching = true;
                    item.simStatus = 'rescued';
                }
            });
        });
    }

    return dayResults;
}

function suggestPlacementsForWish(wish, simulatedWeeks, blockStats) {
    const candidates = [];
    const hasExplicitPrefWeeks = Array.isArray(wish.preferredWeeks) && wish.preferredWeeks.length > 0;
    const prefWeeks = hasExplicitPrefWeeks
        ? wish.preferredWeeks
        : simulatedWeeks.map(w => w.week);

    simulatedWeeks.forEach(w => {
        const minWeekDist = hasExplicitPrefWeeks
            ? Math.min(...prefWeeks.map(pw => Math.abs(w.week - pw)))
            : 0;
        const isExactPreferredWeek = hasExplicitPrefWeeks && minWeekDist === 0;

        let proximityScore = 0;
        if (hasExplicitPrefWeeks) {
            if (minWeekDist === 0) proximityScore = 150;
            else if (minWeekDist === 1) proximityScore = 95;
            else if (minWeekDist === 2) proximityScore = 60;
            else if (minWeekDist === 3) proximityScore = 30;
            else proximityScore = -12 * minWeekDist;
        }

        DAY_KEYS.forEach(day => {
            const dayObj = w.days[day];
            const hasHoliday = dayObj.changes.some(c => c.type === 'holiday');
            const hasFullDayEvent = dayObj.changes.some(c =>
                (timeToMinutes(c.end || '16:00') - timeToMinutes(c.start || '08:00')) >= 360
            );

            if (hasHoliday || (hasFullDayEvent && !isExactPreferredWeek)) return;

            if (wish.type === 'buffer_or_event') {
                const freeBuffer = dayObj.items.find(i => i.title === 'BUFFER' && i.simStatus === 'normal');
                if (freeBuffer) {
                    const score = 200 + proximityScore;
                    candidates.push({
                        week: w.week,
                        weekLabel: w.label || '',
                        day,
                        start: freeBuffer.start,
                        end: freeBuffer.end,
                        type: 'event',
                        targetBlock: null,
                        viaBuffer: true,
                        lostMinutes: 0,
                        hasOverlap: false,
                        impactText: '0t tab (via BUFFER)',
                        score
                    });
                    return;
                }
            }

            const cStartStr = wish.start || (wish.type === 'buffer_or_event' ? '10:00' : '08:00');
            const cEndStr = wish.end || (wish.type === 'buffer_or_event' ? '11:50' : '16:00');
            const cStart = timeToMinutes(cStartStr);
            const cEnd = timeToMinutes(cEndStr);

            let lostMinutes = 0;
            let deficitPenalty = 0;
            let targetAlreadyOnDay = false;
            const affectedBlocks = new Set();

            dayObj.items.forEach(item => {
                if (item.simStatus !== 'normal' || item.isMeal) return;
                if (Math.min(timeToMinutes(item.end), cEnd) - Math.max(timeToMinutes(item.start), cStart) > 10) {
                    if (wish.type === 'immersion' && item.title === wish.targetBlock) {
                        targetAlreadyOnDay = true;
                    } else if (item.isTeaching) {
                        lostMinutes += item.effectiveMinutes;
                        affectedBlocks.add(item.title);
                        if (blockStats[item.title] && blockStats[item.title].actualMin < blockStats[item.title].plannedMin) {
                            deficitPenalty += 40;
                        }
                    }
                }
            });

            // Tjek om tidsrummet allerede overlapper med et andet arrangement (fx Outro)
            const overlappingEvents = dayObj.changes.filter(c =>
                c.type !== 'holiday' &&
                c.type !== 'cancel' &&
                Math.min(timeToMinutes(c.end || '16:00'), cEnd) - Math.max(timeToMinutes(c.start || '08:00'), cStart) > 10
            );
            const eventOverlapPenalty = overlappingEvents.length * 25;

            let score = 100 - (lostMinutes / 10) - deficitPenalty - eventOverlapPenalty + proximityScore;
            if (targetAlreadyOnDay) score += 25;

            let impactText = '';
            if (overlappingEvents.length > 0) {
                const evNames = overlappingEvents.map(c => c.title).join(', ');
                impactText = lostMinutes === 0
                    ? `Oven i: ${evNames} (0t fagtab)`
                    : `Oven i ${evNames} + aflyser ${(lostMinutes / 60).toFixed(1)}t`;
            } else {
                impactText = lostMinutes === 0
                    ? '0t tab for andre fag'
                    : `Aflyser ${(lostMinutes / 60).toFixed(1)}t (${Array.from(affectedBlocks).join(', ')})`;
            }

            candidates.push({
                week: w.week,
                weekLabel: w.label || '',
                day,
                start: cStartStr,
                end: cEndStr,
                type: wish.type === 'immersion' ? 'immersion' : 'event',
                targetBlock: wish.targetBlock || null,
                viaBuffer: false,
                lostMinutes,
                hasOverlap: overlappingEvents.length > 0,
                impactText,
                score
            });
        });
    });

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, 3);
}

function lockWishIntoCalendar(calId, wish, placement) {
    if (!state.wishPlacementsByCal[calId]) state.wishPlacementsByCal[calId] = [];
    state.wishPlacementsByCal[calId].push({
        wishId: wish.id,
        week: placement.week,
        change: {
            wishId: wish.id,
            day: placement.day,
            start: placement.start,
            end: placement.end,
            type: placement.type,
            ...(placement.targetBlock ? { targetBlock: placement.targetBlock } : {}),
            title: wish.title
        }
    });
    saveWishPlacements();
    renderSemesterSimulation();
}

function unlockWishFromCalendar(calId, wishId) {
    if (!state.wishPlacementsByCal[calId]) return;
    state.wishPlacementsByCal[calId] = state.wishPlacementsByCal[calId].filter(p => p.wishId !== wishId);
    saveWishPlacements();
    renderSemesterSimulation();
}

function deleteCustomWish(calId, wishId) {
    if (state.customWishesByCal[calId]) {
        state.customWishesByCal[calId] = state.customWishesByCal[calId].filter(w => w.id !== wishId);
        saveCustomWishes();
    }
    unlockWishFromCalendar(calId, wishId);
}

function renderWishesSection(cal, simulatedWeeks, blockStats) {
    if (!dom.simWishesContainer) return;

    const hasEdits = hasLocalCalendarEdits(cal.id);
    if (dom.btnResetWishes) dom.btnResetWishes.style.display = hasEdits ? 'inline-block' : 'none';
    if (dom.btnResetCalendarOverrides) dom.btnResetCalendarOverrides.style.display = hasEdits ? 'inline-block' : 'none';

    const wishes = cal.wishes || [];
    if (wishes.length === 0) {
        if (dom.wishesCounterBadge) dom.wishesCounterBadge.textContent = '0/0';
        dom.simWishesContainer.innerHTML = `<p style="font-size:0.74rem; color:#64748b;">Klik på <strong>+</strong> for at oprette ønsker.</p>`;
        return;
    }

    const usedChangeKeys = new Set();
    let scheduledCount = 0;

    const wishItemsHtml = wishes.map(w => {
        let foundMatch = null;
        for (const weekObj of cal.weeks) {
            const changes = weekObj.changes || [];
            for (let cIdx = 0; cIdx < changes.length; cIdx++) {
                const chg = changes[cIdx];
                const uniqueKey = `${weekObj.week}_${cIdx}`;
                if (usedChangeKeys.has(uniqueKey)) continue;

                const idMatch = chg.wishId && chg.wishId === w.id;
                const titleMatch = !chg.wishId && chg.title && chg.title.trim().toLowerCase() === w.title.trim().toLowerCase();

                if (idMatch || titleMatch) {
                    usedChangeKeys.add(uniqueKey);
                    foundMatch = {
                        week: weekObj.week,
                        day: chg.day,
                        start: chg.start,
                        end: chg.end,
                        fromBrowser: Boolean(chg._fromBrowser)
                    };
                    break;
                }
            }
            if (foundMatch) break;
        }

        if (foundMatch) {
            scheduledCount++;
            openPendingWishIds.delete(w.id);
            const dayShort = DAY_SHORT[foundMatch.day] || foundMatch.day;
            return `
                <div class="sb-wish-item is-scheduled">
                    <div class="sb-wish-main-row">
                        <div class="sb-wish-left">
                            <span class="sb-wish-status-icon is-done" title="Skemalagt">✓</span>
                            <span class="sb-wish-title" title="${w.title}">${w.title}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:3px; flex-shrink:0;">
                            <span class="sb-wish-badge">Uge ${foundMatch.week} · ${dayShort}</span>
                            ${foundMatch.fromBrowser
                                ? `<button type="button" class="btn-unlock-wish" data-wish-id="${w.id}" title="Fjern placering" style="background:none; border:none; cursor:pointer; font-size:0.9rem; line-height:1; color:#dc2626; padding:0 2px;">&times;</button>`
                                : ''}
                        </div>
                    </div>
                </div>
            `;
        }

        const suggestions = suggestPlacementsForWish(w, simulatedWeeks, blockStats);
        const bestSug = suggestions[0];
        const hasPrefWeeks = Array.isArray(w.preferredWeeks) && w.preferredWeeks.length > 0;
        const prefFullText = hasPrefWeeks ? `Ønsket: uge ${w.preferredWeeks.join(', ')}` : 'Hele semesteret';
        const prefShortText = hasPrefWeeks
            ? (w.preferredWeeks.length <= 2 ? `Uge ${w.preferredWeeks.join(', ')}` : `Uge ${w.preferredWeeks[0]}+`)
            : '';

        const sugsHtml = suggestions.map((sug, idx) => {
            const sugColor = sug.hasOverlap ? '#b45309' : (sug.lostMinutes === 0 ? '#15803d' : '#64748b');
            const sugWeight = (sug.lostMinutes === 0 || sug.hasOverlap) ? '700' : '400';
            return `
                <div class="sb-wish-sug-box">
                    <div style="min-width:0;">
                        <strong>Uge ${sug.week} · ${DAY_SHORT[sug.day]}</strong>
                        <div style="font-size:0.65rem; color:${sugColor}; font-weight:${sugWeight};">
                            ${sug.impactText}
                        </div>
                    </div>
                    <button type="button" class="btn btn-outline btn-apply-wish-sug" data-wish-id="${w.id}" data-sug-idx="${idx}" style="padding:2px 7px; font-size:0.69rem; white-space:nowrap;">
                        + Læg fast
                    </button>
                </div>
            `;
        }).join('');

        // Forhåndsvælg første ønskede uge i dropdownen (eller bedste forslag hvis ingen uge er ønsket)
        const firstPrefWeek = hasPrefWeeks
            ? w.preferredWeeks.map(Number).find(pw => cal.weeks.some(wk => Number(wk.week) === pw))
            : null;
        const defaultManualWeek = firstPrefWeek ?? (bestSug ? Number(bestSug.week) : Number(cal.weeks[0]?.week));
        const defaultManualDay = bestSug && Number(bestSug.week) === defaultManualWeek ? bestSug.day : 'tor';

        const weekOptions = cal.weeks
            .map(wk => `<option value="${wk.week}" ${Number(wk.week) === defaultManualWeek ? 'selected' : ''}>Uge ${wk.week}</option>`)
            .join('');

        const dayOptions = DAY_KEYS
            .map(dk => `<option value="${dk}" ${dk === defaultManualDay ? 'selected' : ''}>${DAY_SHORT[dk]}</option>`)
            .join('');

        const isOpen = openPendingWishIds.has(w.id);

        return `
            <details class="sb-wish-item is-pending is-collapsible" data-wish-id="${w.id}" data-wish-card="${w.id}" ${isOpen ? 'open' : ''}>
                <summary class="sb-wish-summary" title="${w.title} (${prefFullText}) — klik for at folde ud">
                    <div class="sb-wish-main-row">
                        <div class="sb-wish-left">
                            <span class="sb-wish-status-icon is-open">○</span>
                            <span class="sb-wish-title">${w.title}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
                            ${prefShortText ? `<span class="sb-wish-pref-pill">${prefShortText}</span>` : ''}
                            <span class="sb-wish-chevron" aria-hidden="true">▾</span>
                            ${w._customWish
                                ? `<button type="button" class="btn-delete-custom-wish" data-wish-id="${w.id}" title="Slet ønske" style="background:none; border:none; cursor:pointer; font-size:0.95rem; line-height:1; color:#92400e; padding:0 2px;">&times;</button>`
                                : ''}
                        </div>
                    </div>
                </summary>
                <div class="sb-wish-actions">
                    <div class="sb-wish-sub" style="margin-bottom:2px;">${prefFullText}</div>
                    ${sugsHtml}
                    <div style="display:flex; gap:4px; align-items:center; margin-top:3px;">
                        <select class="select-input manual-wish-week" data-default-week="${defaultManualWeek}" style="padding:2px 4px; font-size:0.7rem; flex:1;">${weekOptions}</select>
                        <select class="select-input manual-wish-day" data-default-day="${defaultManualDay}" style="padding:2px 4px; font-size:0.7rem;">${dayOptions}</select>
                        <button type="button" class="btn btn-outline btn-manual-lock" data-wish-id="${w.id}" style="padding:2px 6px; font-size:0.7rem;">Lås</button>
                    </div>
                </div>
            </details>
        `;
    }).join('');

    if (dom.wishesCounterBadge) {
        dom.wishesCounterBadge.textContent = `${scheduledCount}/${wishes.length}`;
    }
    dom.simWishesContainer.innerHTML = wishItemsHtml;

    dom.simWishesContainer.querySelectorAll('details.is-collapsible').forEach(det => {
        det.addEventListener('toggle', () => {
            if (det.open) openPendingWishIds.add(det.dataset.wishId);
            else openPendingWishIds.delete(det.dataset.wishId);
        });
    });

    dom.simWishesContainer.querySelectorAll('.manual-wish-week').forEach(sel => {
        if (sel.dataset.defaultWeek) sel.value = sel.dataset.defaultWeek;
    });
    dom.simWishesContainer.querySelectorAll('.manual-wish-day').forEach(sel => {
        if (sel.dataset.defaultDay) sel.value = sel.dataset.defaultDay;
    });

    dom.simWishesContainer.querySelectorAll('.btn-apply-wish-sug').forEach(btn => {
        btn.addEventListener('click', () => {
            const wish = wishes.find(x => x.id === btn.dataset.wishId);
            const chosen = suggestPlacementsForWish(wish, simulatedWeeks, blockStats)[parseInt(btn.dataset.sugIdx, 10)];
            if (chosen) lockWishIntoCalendar(cal.id, wish, chosen);
        });
    });

    dom.simWishesContainer.querySelectorAll('.btn-manual-lock').forEach(btn => {
        btn.addEventListener('click', () => {
            const wish = wishes.find(x => x.id === btn.dataset.wishId);
            const card = btn.closest('.sb-wish-item');
            if (!wish || !card) return;
            lockWishIntoCalendar(cal.id, wish, {
                week: parseInt(card.querySelector('.manual-wish-week').value, 10),
                day: card.querySelector('.manual-wish-day').value,
                start: wish.start || '08:00',
                end: wish.end || '16:00',
                type: wish.type === 'immersion' ? 'immersion' : 'event',
                targetBlock: wish.targetBlock || null
            });
        });
    });

    dom.simWishesContainer.querySelectorAll('.btn-unlock-wish').forEach(btn => {
        btn.addEventListener('click', () => unlockWishFromCalendar(cal.id, btn.dataset.wishId));
    });

    dom.simWishesContainer.querySelectorAll('.btn-delete-custom-wish').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteCustomWish(cal.id, btn.dataset.wishId);
        });
    });
}

// --- OVERRIDE MODAL HJÆLPERE ---
function populateOverrideWeekOptions(cal, selectedWeekNum) {
    if (!dom.overrideWeekSelect || !cal) return;
    dom.overrideWeekSelect.innerHTML = cal.weeks
        .map(w => `<option value="${w.week}">Uge ${w.week} (${w.label || 'Normaluge'})</option>`)
        .join('');
    if (selectedWeekNum !== undefined) {
        dom.overrideWeekSelect.value = selectedWeekNum;
    }
}

function openCreateOverrideModal() {
    const cal = getActiveCalendar();
    if (!cal || !dom.overrideModal) return;

    state.editingOverrideContext = null;
    if (dom.overrideModalTitle) dom.overrideModalTitle.textContent = 'Tilføj ændring / override';
    if (dom.btnDeleteOverride) dom.btnDeleteOverride.style.display = 'none';

    const defaultWeek = cal.weeks[state.selectedSimWeekIndex]
        ? cal.weeks[state.selectedSimWeekIndex].week
        : cal.weeks[0]?.week;
    populateOverrideWeekOptions(cal, defaultWeek);

    if (dom.overrideDaySelect) dom.overrideDaySelect.value = 'man';
    if (dom.overrideTypeSelect) dom.overrideTypeSelect.value = 'event';
    if (dom.overrideTitleInput) dom.overrideTitleInput.value = '';
    if (dom.overrideStartInput) dom.overrideStartInput.value = '08:00';
    if (dom.overrideEndInput) dom.overrideEndInput.value = '12:00';
    if (dom.overrideTargetBlockGroup) dom.overrideTargetBlockGroup.style.display = 'none';

    dom.overrideModal.showModal();
}

function openEditOverrideModal(cal, weekNum, simItem) {
    if (!cal || !dom.overrideModal || !simItem) return;

    state.editingOverrideContext = {
        calId: cal.id,
        week: weekNum,
        source: simItem._source || 'base',
        overrideId: simItem._overrideId || null,
        wishId: simItem.wishId || null,
        baseIdx: simItem._baseIdx,
        origDay: simItem.day,
        origTitle: simItem.title,
        origStart: simItem.start,
        origEnd: simItem.end
    };

    if (dom.overrideModalTitle) dom.overrideModalTitle.textContent = `Rediger ændring (Uge ${weekNum})`;
    if (dom.btnDeleteOverride) dom.btnDeleteOverride.style.display = 'inline-block';

    populateOverrideWeekOptions(cal, weekNum);
    if (dom.overrideDaySelect) dom.overrideDaySelect.value = simItem.day || 'man';
    if (dom.overrideTypeSelect) dom.overrideTypeSelect.value = simItem.rawType || 'event';
    if (dom.overrideTitleInput) dom.overrideTitleInput.value = simItem.title || '';
    if (dom.overrideStartInput) dom.overrideStartInput.value = simItem.start || '08:00';
    if (dom.overrideEndInput) dom.overrideEndInput.value = simItem.end || '16:00';

    if (dom.overrideTargetBlockGroup) {
        const isImm = simItem.rawType === 'immersion';
        dom.overrideTargetBlockGroup.style.display = isImm ? 'flex' : 'none';
        if (isImm && simItem.targetBlock && dom.overrideTargetBlockSelect) {
            dom.overrideTargetBlockSelect.value = simItem.targetBlock;
        }
    }

    dom.overrideModal.showModal();
}

export function renderSemesterSimulation() {
    const cal = getActiveCalendar();
    if (dom.simProtoName) dom.simProtoName.textContent = state.currentTitle;

    if (!cal) {
        if (dom.simKpiRow) {
            dom.simKpiRow.innerHTML = '<p style="color:#64748b;">Læg en kalender-JSON i mappen <code>/calendars/</code> for at starte simuleringen.</p>';
        }
        return;
    }

    const useBuffer = dom.simUseBuffer ? dom.simUseBuffer.checked : true;
    const weeks = cal.weeks || [];
    if (state.selectedSimWeekIndex >= weeks.length) state.selectedSimWeekIndex = 0;

    const simulatedWeeks = weeks.map(w => ({
        ...w,
        days: simulateWeek(w, state.currentSchedule, useBuffer)
    }));

    // 1. Sammentæl fagblokke (kun undervisningsbrikker tæller)
    const blockStats = {};
    state.currentSchedule.forEach(e => {
        if (isEntryTeaching(e, SETTINGS, state.customBlocks) && !blockStats[e.title]) {
            blockStats[e.title] = { plannedCount: 0, plannedMin: 0, actualCount: 0, actualMin: 0, immersionMin: 0 };
        }
    });

    let normalWeeksCount = 0;
    let holidayDaysCount = 0;
    let totalTeachingHours = 0;
    const dayNormalCounts = { man: 0, tir: 0, ons: 0, tor: 0, fre: 0 };

    simulatedWeeks.forEach(w => {
        if (!w.changes || w.changes.length === 0) normalWeeksCount++;
        let weekTeachingMin = 0;

        DAY_KEYS.forEach(d => {
            const dObj = w.days[d];
            if (dObj.changes.length === 0) dayNormalCounts[d]++;
            if (dObj.changes.some(c => c.type === 'holiday')) holidayDaysCount++;

            state.currentSchedule
                .filter(e => e.day === d && isEntryTeaching(e, SETTINGS, state.customBlocks))
                .forEach(e => {
                    blockStats[e.title].plannedCount += 1;
                    blockStats[e.title].plannedMin += Math.max(timeToMinutes(e.end) - timeToMinutes(e.start), 0);
                });

            dObj.items.forEach(item => {
                if (item.simStatus === 'normal' || item.simStatus === 'rescued') {
                    const key = item.rescuedTitle || item.title;
                    if (item.isTeaching) {
                        if (blockStats[key]) {
                            blockStats[key].actualCount += 1;
                            blockStats[key].actualMin += item.effectiveMinutes;
                        }
                        weekTeachingMin += item.effectiveMinutes;
                    }
                } else if (item.simStatus === 'immersion' && item.targetBlock) {
                    if (!blockStats[item.targetBlock]) {
                        blockStats[item.targetBlock] = { plannedCount: 0, plannedMin: 0, actualCount: 0, actualMin: 0, immersionMin: 0 };
                    }
                    blockStats[item.targetBlock].actualCount += 1;
                    blockStats[item.targetBlock].actualMin += item.effectiveMinutes;
                    blockStats[item.targetBlock].immersionMin += item.effectiveMinutes;
                    if (isBlockTitleTeaching(item.targetBlock, SETTINGS, state.customBlocks)) {
                        weekTeachingMin += item.effectiveMinutes;
                    }
                } else if (item.simStatus === 'event') {
                    weekTeachingMin += Math.min(item.effectiveMinutes, 360);
                }
            });
        });

        totalTeachingHours += (weekTeachingMin / 60);
    });

    renderWishesSection(cal, simulatedWeeks, blockStats);
    if (state.activeTab !== 'tab-semester') return;

    // 2. KPI-kort (klokketimer)
    const avgHours = weeks.length > 0 ? (totalTeachingHours / weeks.length).toFixed(1) : 0;
    const meetsSemRequirement = parseFloat(avgHours) >= 21;
    if (dom.simKpiRow) {
        dom.simKpiRow.innerHTML = `
            <div class="sim-kpi-box">
                <div class="sim-kpi-label">Semesterlængde</div>
                <div class="sim-kpi-val">${weeks.length} uger</div>
                <div class="sim-kpi-sub">${cal.name}</div>
            </div>
            <div class="sim-kpi-box">
                <div class="sim-kpi-label">100 % Normaluger</div>
                <div class="sim-kpi-val">${normalWeeksCount} ud af ${weeks.length}</div>
                <div class="sim-kpi-sub">Uger helt uden ændringer</div>
            </div>
            <div class="sim-kpi-box">
                <div class="sim-kpi-label">Helligdage / lukkedage</div>
                <div class="sim-kpi-val">${holidayDaysCount} dage</div>
                <div class="sim-kpi-sub">Låst i kalenderen</div>
            </div>
            <div class="sim-kpi-box" style="${!meetsSemRequirement ? 'border-color:#fca5a5; background:#fef2f2;' : ''}">
                <div class="sim-kpi-label">Gns. undervisning / uge</div>
                <div class="sim-kpi-val" style="${!meetsSemRequirement ? 'color:#991b1b;' : ''}">${avgHours} timer</div>
                <div class="sim-kpi-sub">Lovkrav: min. 21 klokketimer</div>
            </div>
        `;
    }

    // 3. Fagblok-regnskab
    if (dom.semesterStatsContainer) {
        const rowsHtml = Object.entries(blockStats).map(([title, st]) => {
            const pHours = (st.plannedMin / 60).toFixed(1);
            const aHours = (st.actualMin / 60).toFixed(1);
            const diffHours = ((st.actualMin - st.plannedMin) / 60).toFixed(1);
            const diffSign = diffHours > 0 ? `+${diffHours}` : diffHours;
            const diffColor = diffHours < -3 ? '#dc2626' : (diffHours > 0 ? '#16a34a' : '#475569');
            const { color } = getBlockColors({ title }, SETTINGS, state.customBlocks);
            const immersionNote = st.immersionMin > 0
                ? `<div style="font-size:0.68rem; color:#15803d; font-weight:600;">heraf +${(st.immersionMin / 60).toFixed(1)}t fordybelse</div>`
                : '';
            return `
                <tr>
                    <td>
                        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:6px;"></span><strong>${title}</strong>
                        ${immersionNote}
                    </td>
                    <td>${st.plannedCount}x (${pHours}t)</td>
                    <td><strong>${st.actualCount}x (${aHours}t)</strong></td>
                    <td style="color:${diffColor};font-weight:800;">${diffSign}t</td>
                </tr>
            `;
        }).join('');

        dom.semesterStatsContainer.innerHTML = `
            <table class="sim-table">
                <thead><tr><th>Undervisningsfag</th><th>Planlagt</th><th>Reelt</th><th>Forskel</th></tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        `;
    }

    // 4. Ugevælger & proportional uge-tidslinje
    if (dom.simWeekSelect) {
        dom.simWeekSelect.innerHTML = '';
        simulatedWeeks.forEach((w, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = `Uge ${w.week} – ${w.label || 'Normaluge'}`;
            dom.simWeekSelect.appendChild(opt);
        });
        dom.simWeekSelect.value = state.selectedSimWeekIndex;
    }

    const currentSimWeek = simulatedWeeks[state.selectedSimWeekIndex];
    if (dom.simWeekDetail && currentSimWeek) {
        const SIM_START_HOUR = 7;
        const SIM_END_HOUR = 21.5;
        const SIM_START_MIN = SIM_START_HOUR * 60;
        const SIM_PX_PER_HOUR = 38;
        const totalHeightPx = (SIM_END_HOUR - SIM_START_HOUR) * SIM_PX_PER_HOUR;

        let ticksHtml = '';
        for (let h = SIM_START_HOUR; h <= 21; h++) {
            ticksHtml += `<div class="sim-time-tick" style="top:${(h - SIM_START_HOUR) * SIM_PX_PER_HOUR}px;">${String(h).padStart(2, '0')}:00</div>`;
        }

        const dayColsHtml = DAY_KEYS.map(d => {
            const dayItems = currentSimWeek.days[d].items;
            const cancelledItems = dayItems.filter(i => i.simStatus === 'cancelled');

            const blocksHtml = dayItems.map((item, itemIdx) => {
                const sMin = Math.max(timeToMinutes(item.start), SIM_START_MIN);
                const eMin = Math.min(timeToMinutes(item.end), SIM_END_HOUR * 60);
                const topPx = ((sMin - SIM_START_MIN) / 60) * SIM_PX_PER_HOUR;
                const heightPx = Math.max(((eMin - sMin) / 60) * SIM_PX_PER_HOUR, 17);
                const isCompact = heightPx < 30;

                let posStyle = 'left: 2px; right: 2px; z-index: 12;';
                if (item.isMeal) {
                    posStyle = 'left: 2px; right: 2px; z-index: 25;';
                } else if (item.simStatus === 'cancelled') {
                    posStyle = 'left: calc(56% + 1px); width: calc(44% - 3px); z-index: 10;';
                } else if (['event', 'immersion', 'cancel_notice', 'holiday'].includes(item.simStatus)) {
                    const overlapsCancelled = cancelledItems.some(c =>
                        Math.min(eMin, timeToMinutes(c.end)) > Math.max(sMin, timeToMinutes(c.start))
                    );
                    posStyle = overlapsCancelled ? 'left: 2px; width: calc(56% - 3px); z-index: 15;' : 'left: 2px; right: 2px; z-index: 15;';
                }

                const baseStyle = `top:${topPx}px; height:${heightPx}px; ${posStyle}`;
                const timeLabel = isCompact ? item.start : `${item.start}–${item.end}`;
                const compactCls = isCompact ? ' is-compact' : '';
                const dataAttrs = `data-sim-day="${d}" data-sim-item-idx="${itemIdx}"`;

                if (item.simStatus === 'cancelled') {
                    return `<div class="sim-mini-block is-cancelled${compactCls}" style="${baseStyle}" title="Aflyst: ${item.title} (${item.start}-${item.end})"><span class="sim-mini-block-title">${item.title}</span><span class="sim-mini-block-time">${timeLabel}</span></div>`;
                }
                if (item.simStatus === 'holiday') {
                    return `<div class="sim-mini-block is-holiday is-editable-override${compactCls}" ${dataAttrs} style="${baseStyle}" title="Klik for at redigere eller slette: ${item.title} (${item.start}-${item.end})"><span class="sim-mini-block-title">🔒 ${item.title}</span><span class="sim-mini-block-time">${timeLabel}</span></div>`;
                }
                if (item.simStatus === 'immersion') {
                    return `<div class="sim-mini-block is-immersion is-editable-override${compactCls}" ${dataAttrs} style="${baseStyle}" title="Klik for at redigere eller slette: ${item.title} (${item.start}-${item.end})"><span class="sim-mini-block-title">⭐ ${item.title}</span><span class="sim-mini-block-time">${timeLabel}</span></div>`;
                }
                if (item.simStatus === 'cancel_notice') {
                    return `<div class="sim-mini-block is-cancel is-editable-override${compactCls}" ${dataAttrs} style="${baseStyle}" title="Klik for at redigere eller slette: ${item.title} (${item.start}-${item.end})"><span class="sim-mini-block-title">🚫 ${item.title}</span><span class="sim-mini-block-time">${timeLabel}</span></div>`;
                }
                if (item.simStatus === 'event') {
                    return `<div class="sim-mini-block is-event is-editable-override${compactCls}" ${dataAttrs} style="${baseStyle}" title="Klik for at redigere eller slette: ${item.title} (${item.start}-${item.end})"><span class="sim-mini-block-title">📌 ${item.title}</span><span class="sim-mini-block-time">${timeLabel}</span></div>`;
                }

                const { color, textColor } = getBlockColors({ title: item.rescuedTitle || item.title }, SETTINGS, state.customBlocks);
                return `<div class="sim-mini-block${compactCls}" style="${baseStyle} background:${color}; color:${textColor};" title="${item.title} (${item.start}-${item.end})"><span class="sim-mini-block-title">${item.title}</span><span class="sim-mini-block-time">${timeLabel}</span></div>`;
            }).join('');

            return `
                <div class="sim-day-col">
                    <div class="sim-day-col-header">${DAY_LABELS[d]}</div>
                    <div class="sim-day-col-body" style="height:${totalHeightPx}px; background-size: 100% ${SIM_PX_PER_HOUR}px;">${blocksHtml}</div>
                </div>
            `;
        }).join('');

        dom.simWeekDetail.className = 'sim-timeline-grid';
        dom.simWeekDetail.innerHTML = `
            <div class="sim-time-axis">
                <div class="sim-time-axis-header"></div>
                <div class="sim-time-axis-body" style="height:${totalHeightPx}px;">${ticksHtml}</div>
            </div>
            ${dayColsHtml}
        `;

        dom.simWeekDetail.querySelectorAll('.is-editable-override').forEach(el => {
            el.addEventListener('click', () => {
                const dayKey = el.dataset.simDay;
                const itemIdx = parseInt(el.dataset.simItemIdx, 10);
                const simItem = currentSimWeek.days[dayKey]?.items[itemIdx];
                if (simItem) {
                    openEditOverrideModal(cal, currentSimWeek.week, simItem);
                }
            });
        });
    }

    // 5. Makro-tabel over hele semesteret
    if (dom.semesterTableContainer) {
        const macroRows = simulatedWeeks.map((w, idx) => {
            const cells = DAY_KEYS.map(d => {
                const chgs = w.days[d].changes;
                if (chgs.length === 0) return `<td class="macro-cell-normal">✓ Normal</td>`;
                const hasHoliday = chgs.some(c => c.type === 'holiday');
                const isAllCancel = chgs.every(c => c.type === 'cancel');
                const cls = hasHoliday ? 'macro-cell-holiday' : (isAllCancel ? 'macro-cell-closed' : 'macro-cell-changed');
                const txt = chgs.map(c => {
                    const prefix = c.type === 'holiday' ? '🔒 ' : (c.type === 'cancel' ? '🚫 ' : '');
                    return `${prefix}${c.title} <small>(${c.start}-${c.end})</small>`;
                }).join('<br>');
                return `<td class="${cls}">${txt}</td>`;
            }).join('');

            return `
                <tr style="cursor:pointer;" data-week-idx="${idx}" title="Klik for at inspicere uge ${w.week}">
                    <td><strong>Uge ${w.week}</strong><br><small style="color:#64748b;">${w.label || ''}</small></td>
                    ${cells}
                </tr>
            `;
        }).join('');

        dom.semesterTableContainer.innerHTML = `
            <table class="sim-table">
                <thead>
                    <tr>
                        <th style="width:140px;">Uge</th>
                        <th>Mandag (${dayNormalCounts.man} normale)</th>
                        <th>Tirsdag (${dayNormalCounts.tir} normale)</th>
                        <th>Onsdag (${dayNormalCounts.ons} normale)</th>
                        <th>Torsdag (${dayNormalCounts.tor} normale)</th>
                        <th>Fredag (${dayNormalCounts.fre} normale)</th>
                    </tr>
                </thead>
                <tbody>${macroRows}</tbody>
            </table>
        `;

        dom.semesterTableContainer.querySelectorAll('tr[data-week-idx]').forEach(tr => {
            tr.addEventListener('click', () => {
                state.selectedSimWeekIndex = parseInt(tr.dataset.weekIdx, 10);
                callbacks.syncUrlState();
                renderSemesterSimulation();
            });
        });
    }
}

export function applySimulatorUrlParams(urlParams) {
    const reqSem = urlParams.get('semester');
    if (reqSem && dom.semesterSelect && Array.from(dom.semesterSelect.options).some(o => o.value === reqSem)) {
        dom.semesterSelect.value = reqSem;
    }

    const reqWeek = parseInt(urlParams.get('uge'), 10);
    const cal = getActiveCalendar();
    if (cal && !isNaN(reqWeek)) {
        const wIdx = cal.weeks.findIndex(w => w.week === reqWeek);
        if (wIdx !== -1) state.selectedSimWeekIndex = wIdx;
    }
}

export function initSimulator(customCallbacks = {}) {
    callbacks = { ...callbacks, ...customCallbacks };

    dom = {
        semesterSelect: document.getElementById('semester-select'),
        simUseBuffer: document.getElementById('sim-use-buffer'),
        simProtoName: document.getElementById('sim-proto-name'),
        simKpiRow: document.getElementById('sim-kpi-row'),
        simWishesContainer: document.getElementById('sim-wishes-container'),
        wishesCounterBadge: document.getElementById('wishes-counter-badge'),
        btnResetWishes: document.getElementById('btn-reset-wishes'),
        btnNewWish: document.getElementById('btn-new-wish'),
        btnResetCalendarOverrides: document.getElementById('btn-reset-calendar-overrides'),
        btnExportCalendarJson: document.getElementById('btn-export-calendar-json'),
        semesterStatsContainer: document.getElementById('semester-stats-container'),
        semesterTableContainer: document.getElementById('semester-table-container'),
        simWeekSelect: document.getElementById('sim-week-select'),
        btnPrevWeek: document.getElementById('btn-prev-week'),
        btnNextWeek: document.getElementById('btn-next-week'),
        btnAddWeekOverride: document.getElementById('btn-add-week-override'),
        simWeekDetail: document.getElementById('sim-week-detail'),
        btnExportSimImage: document.getElementById('btn-export-sim-image'),

        // Wish modal
        wishModal: document.getElementById('wish-modal'),
        wishForm: document.getElementById('wish-form'),
        wishTitleInput: document.getElementById('wish-title'),
        wishTypeSelect: document.getElementById('wish-type'),
        wishTargetBlockGroup: document.getElementById('wish-target-block-group'),
        wishTargetBlockSelect: document.getElementById('wish-target-block'),
        wishStartInput: document.getElementById('wish-start'),
        wishEndInput: document.getElementById('wish-end'),
        wishPrefWeeksInput: document.getElementById('wish-preferred-weeks'),

        // Override modal
        overrideModal: document.getElementById('week-override-modal'),
        overrideModalTitle: document.getElementById('override-modal-title'),
        overrideForm: document.getElementById('week-override-form'),
        overrideWeekSelect: document.getElementById('override-week'),
        overrideDaySelect: document.getElementById('override-day'),
        overrideTypeSelect: document.getElementById('override-type'),
        overrideTargetBlockGroup: document.getElementById('override-target-block-group'),
        overrideTargetBlockSelect: document.getElementById('override-target-block'),
        overrideTitleInput: document.getElementById('override-title'),
        overrideStartInput: document.getElementById('override-start'),
        overrideEndInput: document.getElementById('override-end'),
        btnDeleteOverride: document.getElementById('btn-delete-override')
    };

    populateSemesterDropdown();

    // Wish modal events
    if (dom.wishTypeSelect && dom.wishTargetBlockGroup) {
        dom.wishTypeSelect.addEventListener('change', () => {
            dom.wishTargetBlockGroup.style.display = dom.wishTypeSelect.value === 'immersion' ? 'flex' : 'none';
        });
    }
    if (dom.btnNewWish && dom.wishModal) {
        dom.btnNewWish.addEventListener('click', (e) => {
            e.stopPropagation();
            if (dom.wishForm) dom.wishForm.reset();
            if (dom.wishTargetBlockGroup) dom.wishTargetBlockGroup.style.display = 'none';
            dom.wishModal.showModal();
        });
    }
    document.getElementById('btn-close-wish-modal')?.addEventListener('click', () => dom.wishModal?.close());
    document.getElementById('btn-cancel-wish-modal')?.addEventListener('click', () => dom.wishModal?.close());
    dom.wishModal?.addEventListener('click', (e) => { if (e.target === dom.wishModal) dom.wishModal.close(); });

    if (dom.wishForm && dom.wishModal) {
        dom.wishForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const cal = getActiveCalendar();
            if (!cal) return;
            const title = dom.wishTitleInput.value.trim();
            if (!title) return;

            const type = dom.wishTypeSelect.value;
            const prefRaw = dom.wishPrefWeeksInput.value.trim();
            const preferredWeeks = prefRaw
                ? prefRaw.split(/[,\s;]+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n))
                : [];

            const newWish = {
                id: 'custom_wish_' + Date.now(),
                title,
                type,
                ...(type === 'immersion' ? { targetBlock: dom.wishTargetBlockSelect.value } : {}),
                start: dom.wishStartInput.value || (type === 'buffer_or_event' ? '10:00' : '08:00'),
                end: dom.wishEndInput.value || (type === 'buffer_or_event' ? '11:50' : '16:00'),
                preferredWeeks
            };

            if (!state.customWishesByCal[cal.id]) state.customWishesByCal[cal.id] = [];
            state.customWishesByCal[cal.id].push(newWish);
            saveCustomWishes();

            state.sidebarSectionsState.wishesOpen = true;
            saveSidebarSectionsState();
            callbacks.openWishesSection();

            dom.wishModal.close();
            renderSemesterSimulation();
        });
    }

    // Week override modal events
    if (dom.overrideTypeSelect && dom.overrideTargetBlockGroup) {
        dom.overrideTypeSelect.addEventListener('change', () => {
            dom.overrideTargetBlockGroup.style.display = dom.overrideTypeSelect.value === 'immersion' ? 'flex' : 'none';
        });
    }
    dom.btnAddWeekOverride?.addEventListener('click', openCreateOverrideModal);
    document.getElementById('btn-close-override-modal')?.addEventListener('click', () => dom.overrideModal?.close());
    document.getElementById('btn-cancel-override-modal')?.addEventListener('click', () => dom.overrideModal?.close());
    dom.overrideModal?.addEventListener('click', (e) => { if (e.target === dom.overrideModal) dom.overrideModal.close(); });

    if (dom.btnDeleteOverride && dom.overrideModal) {
        dom.btnDeleteOverride.addEventListener('click', () => {
            const ctx = state.editingOverrideContext;
            if (!ctx) return;

            if (ctx.source === 'wish' && ctx.wishId) {
                unlockWishFromCalendar(ctx.calId, ctx.wishId);
            } else if (ctx.source === 'override' && ctx.overrideId) {
                if (state.weekOverridesByCal[ctx.calId]) {
                    state.weekOverridesByCal[ctx.calId].added = state.weekOverridesByCal[ctx.calId].added.filter(o => o.id !== ctx.overrideId);
                    saveWeekOverrides();
                }
                renderSemesterSimulation();
            } else {
                if (!state.weekOverridesByCal[ctx.calId]) state.weekOverridesByCal[ctx.calId] = { added: [], removed: [] };
                state.weekOverridesByCal[ctx.calId].removed.push({
                    week: ctx.week,
                    baseIdx: ctx.baseIdx,
                    day: ctx.origDay,
                    title: ctx.origTitle,
                    start: ctx.origStart || '',
                    end: ctx.origEnd || ''
                });
                saveWeekOverrides();
                renderSemesterSimulation();
            }

            state.editingOverrideContext = null;
            dom.overrideModal.close();
        });
    }

    if (dom.overrideForm && dom.overrideModal) {
        dom.overrideForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const cal = getActiveCalendar();
            if (!cal) return;

            const wk = parseInt(dom.overrideWeekSelect.value, 10);
            const day = dom.overrideDaySelect.value;
            const type = dom.overrideTypeSelect.value;
            const title = dom.overrideTitleInput.value.trim();
            const start = dom.overrideStartInput.value || '08:00';
            const end = dom.overrideEndInput.value || '16:00';
            if (!title) return;

            const updatedChange = {
                day,
                start,
                end,
                type,
                ...(type === 'immersion' ? { targetBlock: dom.overrideTargetBlockSelect.value } : {}),
                title
            };

            const ctx = state.editingOverrideContext;
            if (ctx) {
                if (ctx.source === 'wish' && ctx.wishId) {
                    const list = state.wishPlacementsByCal[ctx.calId] || [];
                    const pl = list.find(p => p.wishId === ctx.wishId);
                    if (pl) {
                        pl.week = wk;
                        pl.change = { ...updatedChange, wishId: ctx.wishId };
                        saveWishPlacements();
                    }
                } else if (ctx.source === 'override' && ctx.overrideId) {
                    const ovData = state.weekOverridesByCal[ctx.calId];
                    const ov = ovData && ovData.added.find(o => o.id === ctx.overrideId);
                    if (ov) {
                        ov.week = wk;
                        ov.change = updatedChange;
                        saveWeekOverrides();
                    }
                } else {
                    if (!state.weekOverridesByCal[ctx.calId]) state.weekOverridesByCal[ctx.calId] = { added: [], removed: [] };
                    state.weekOverridesByCal[ctx.calId].removed.push({
                        week: ctx.week,
                        baseIdx: ctx.baseIdx,
                        day: ctx.origDay,
                        title: ctx.origTitle,
                        start: ctx.origStart || '',
                        end: ctx.origEnd || ''
                    });
                    state.weekOverridesByCal[ctx.calId].added.push({
                        id: 'ov_' + Date.now(),
                        week: wk,
                        change: updatedChange
                    });
                    saveWeekOverrides();
                }
            } else {
                if (!state.weekOverridesByCal[cal.id]) state.weekOverridesByCal[cal.id] = { added: [], removed: [] };
                state.weekOverridesByCal[cal.id].added.push({
                    id: 'ov_' + Date.now(),
                    week: wk,
                    change: updatedChange
                });
                saveWeekOverrides();
            }

            const wIdx = cal.weeks.findIndex(w => w.week === wk);
            if (wIdx !== -1) state.selectedSimWeekIndex = wIdx;

            state.editingOverrideContext = null;
            dom.overrideModal.close();
            callbacks.syncUrlState();
            renderSemesterSimulation();
        });
    }

    // Simulator controls
    dom.semesterSelect?.addEventListener('change', () => {
        state.selectedSimWeekIndex = 0;
        callbacks.syncUrlState();
        renderSemesterSimulation();
    });

    dom.simUseBuffer?.addEventListener('change', () => renderSemesterSimulation());

    const handleResetAll = (e) => {
        if (e) e.stopPropagation();
        const cal = getActiveCalendar();
        if (!cal) return;
        if (confirm('Vil du nulstille alle dine lokale ønsker og kalender-overrides for dette semester?')) {
            resetLocalCalendarEdits(cal.id);
            renderSemesterSimulation();
        }
    };
    dom.btnResetWishes?.addEventListener('click', handleResetAll);
    dom.btnResetCalendarOverrides?.addEventListener('click', handleResetAll);

    dom.btnExportCalendarJson?.addEventListener('click', () => {
        const cal = getActiveCalendar();
        if (!cal) return;
        const cleanCal = JSON.parse(JSON.stringify(cal));
        (cleanCal.wishes || []).forEach(w => { delete w._customWish; });
        cleanCal.weeks.forEach(w => {
            (w.changes || []).forEach(c => {
                delete c._fromBrowser;
                delete c._source;
                delete c._baseIdx;
                delete c._overrideId;
            });
        });
        downloadJsonFile(cleanCal, `${cleanCal.id}.json`, 2);
    });

    dom.simWeekSelect?.addEventListener('change', (e) => {
        state.selectedSimWeekIndex = parseInt(e.target.value, 10);
        callbacks.syncUrlState();
        renderSemesterSimulation();
    });

    dom.btnPrevWeek?.addEventListener('click', () => {
        if (state.selectedSimWeekIndex > 0) {
            state.selectedSimWeekIndex--;
            callbacks.syncUrlState();
            renderSemesterSimulation();
        }
    });

    dom.btnNextWeek?.addEventListener('click', () => {
        const cal = getActiveCalendar();
        if (cal && state.selectedSimWeekIndex < cal.weeks.length - 1) {
            state.selectedSimWeekIndex++;
            callbacks.syncUrlState();
            renderSemesterSimulation();
        }
    });

    dom.btnExportSimImage?.addEventListener('click', () => {
        const target = document.getElementById('semester-export-target');
        if (!target || typeof window.html2canvas !== 'function') return;
        window.html2canvas(target, { scale: 2, backgroundColor: '#ffffff' }).then(canvas => {
            const a = document.createElement('a');
            a.download = `Semester_Simulering_${state.currentTitle.replace(/\s+/g, '_')}.png`;
            a.href = canvas.toDataURL('image/png');
            a.click();
        });
    });
}