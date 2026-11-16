export const VIH_SKEMA_SETTINGS = {
    // 1. Tidslinje opsætning
    timeline: {
        startHour: 7,      // 07:00
        endHour: 22,       // 22:00
        pixelPerHour: 56   // 56px pr. time
    },

    // 2. Faste brikker i paletten
    defaultBlocks: [
        { id: "b_idraet1", title: "Idræt 1", color: "#38bdf8", textColor: "#0f172a", defaultDuration: 90, isTeaching: true },
        { id: "b_idraet2", title: "Idræt 2", color: "#2563eb", textColor: "#ffffff", defaultDuration: 90, isTeaching: true },
        { id: "b_idraet_rota", title: "Idræt 1/2", color: "#113b96", textColor: "#ffffff", defaultDuration: 90, isTeaching: true },
        { id: "b_kompetence", title: "Kompetencefag", color: "#22c55e", textColor: "#ffffff", defaultDuration: 90, isTeaching: true },
        { id: "b_inspiration", title: "Inspirationsfag", color: "#eab308", textColor: "#000000", defaultDuration: 90, isTeaching: true },
        { id: "b_dgl", title: "DGL", color: "#f97316", textColor: "#ffffff", defaultDuration: 75, isTeaching: true },
        { id: "b_morgensamling", title: "Morgensamling", color: "#c084fc", textColor: "#ffffff", defaultDuration: 30, isTeaching: true },
        { id: "b_faellessang", title: "Fællessang", color: "#e879f9", textColor: "#ffffff", defaultDuration: 45, isTeaching: true },
        { id: "b_connected", title: "Connected", color: "#a855f7", textColor: "#ffffff", defaultDuration: 45, isTeaching: true },
        { id: "b_faelles", title: "Fællesskab", color: "#ef4444", textColor: "#ffffff", defaultDuration: 60, isTeaching: true },
        { id: "b_aften", title: "Højskoleaften", color: "#7c3aed", textColor: "#ffffff", defaultDuration: 90, isTeaching: true },
        { id: "b_frivillig", title: "Frivillig / Aften", color: "#0d9488", textColor: "#ffffff", defaultDuration: 75 },
        { id: "b_buffer", title: "BUFFER", color: "#94a3b8", textColor: "#ffffff", defaultDuration: 90, isTeaching: true },
        { id: "b_cleaning", title: "Rengøring", color: "#808895", textColor: "#ffffff", defaultDuration: 90 }
    ],

    // 3. Højskolens egne måltider (understøtter forskellige tider pr. dag via timesByDay og/eller days)
    mealBlocks: [
        {
            title: "Morgenmad",
            start: "07:30",
            end: "08:00",
            color: "#353636",
            textColor: "#e5e7e7"
        },
        {
            title: "Frokost",
            start: "12:00",
            end: "12:30",
            timesByDay: {
                fre: { start: "12:00", end: "12:30" }
            },
            color: "#353636",
            textColor: "#e5e7e7"
        },
        {
            title: "Rengøring",
            start: "12:30",
            end: "13:00",
            color: "#353636",
            textColor: "#e5e7e7"
        },
        {
            title: "Aftensmad",
            start: "17:30",
            end: "18:15",
            days: ["man", "tir", "ons", "tor", "fre"],
            color: "#353636",
            textColor: "#e5e7e7"
        }
    ],

    // 4. Begrænsninger & samlede ugekrav pr. fag
    constraints: {
        // Efterskolens spisetider / spærretider (understøtter også timesByDay pr. ugedag)
        blockedWindows: [
            {
                id: "c_vies_morgen",
                label: "Efterskolen spiser morgenmad",
                days: ["man", "tir", "ons", "tor", "fre"],
                start: "07:00",
                end: "07:25",
                timesByDay: {},
                severity: "error"
            },
            {
                id: "c_vies_frokost",
                label: "Efterskolen spiser frokost",
                days: ["man", "tir", "ons", "tor", "fre"],
                start: "12:45",
                end: "13:15",
                timesByDay: {
                    // Eksempel: fre: { start: "11:15", end: "11:45" }
                },
                severity: "error"
            },
            {
                id: "c_vies_aften",
                label: "Efterskolen spiser aftensmad",
                days: ["man", "tir", "ons", "tor", "fre"],
                start: "18:15",
                end: "18:45",
                timesByDay: {},
                severity: "error"
            }
        ],

        // Idrætslokaler / faciliteter (efterskolens haltider)
        facilityRestrictions: [
            {
                id: "c_hal_eftermiddag",
                label: "Efterskolen har idrætshaller (15:45–18:00)",
                appliesTo: ["Idræt 1", "Idræt 2", "Idræt 1/2"],
                days: ["man", "tir", "tor"],
                blockedStart: "15:45",
                blockedEnd: "18:00",
                severity: "error"
            },
            {
                id: "c_hal_morgen",
                label: "Efterskolen har haller man/tir/tor morgen (08.00-09:30)",
                appliesTo: ["Idræt 1", "Idræt 2", "Idræt 1/2"],
                days: ["man", "tir", "tor"],
                blockedStart: "08:00",
                blockedEnd: "09:30",
                severity: "error"
            },
            {
                id: "c_hal_formiddag",
                label: "Efterskolen har haller fre formiddag (10:00-12:00)",
                appliesTo: ["Idræt 1", "Idræt 2", "Idræt 1/2"],
                days: ["fre"],
                blockedStart: "10:00",
                blockedEnd: "12:00",
                severity: "error"
            }
        ],

        // Samlet ugentligt timetal i minutter pr. fag
        blockWishes: {
            "Idræt 1":        { desiredWeeklyMinutes: 270, note: "Evt. prøve 105 min på én af gangene" },
            "Idræt 2":        { desiredWeeklyMinutes: 180, note: "" },
            "Kompetencefag":  { desiredWeeklyMinutes: 270, note: "Gerne samlet i længere blokke" },
            "Inspirationsfag":{ desiredWeeklyMinutes: 135, note: "" },
            "DGL":            { desiredWeeklyMinutes: 150, note: "" },
            "Morgensamling":  { desiredWeeklyMinutes: 90, note: "" }
        }
    }
};