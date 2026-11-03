export const VIH_SKEMA_SETTINGS = {
    // 1. Tidslinje opsætning
    timeline: {
        startHour: 7,      // 07:00
        endHour: 22,       // 22:00
        pixelPerHour: 56   // 56px pr. time
    },

    // 2. Faste brikker i paletten
    defaultBlocks: [
        { id: "b_idraet1", title: "Idræt 1", color: "#38bdf8", textColor: "#0f172a", defaultDuration: 90 },
        { id: "b_idraet2", title: "Idræt 2", color: "#2563eb", textColor: "#ffffff", defaultDuration: 90 },
        { id: "b_idraet_rota", title: "Idræt 1/2", color: "#113b96", textColor: "#ffffff", defaultDuration: 90 },
        { id: "b_kompetence", title: "Kompetencefag", color: "#22c55e", textColor: "#ffffff", defaultDuration: 90 },
        { id: "b_inspiration", title: "Inspirationsfag", color: "#eab308", textColor: "#000000", defaultDuration: 90 },
        { id: "b_dgl", title: "DGL", color: "#f97316", textColor: "#ffffff", defaultDuration: 75 },
        { id: "b_morgensamling", title: "Morgensamling", color: "#c084fc", textColor: "#ffffff", defaultDuration: 45 },
        { id: "b_faellessang", title: "Fællessang", color: "#e879f9", textColor: "#ffffff", defaultDuration: 45 },
        { id: "b_connected", title: "Connected", color: "#a855f7", textColor: "#ffffff", defaultDuration: 45 },
        { id: "b_faelles", title: "Fælles / Møde", color: "#ef4444", textColor: "#ffffff", defaultDuration: 60 },
        { id: "b_aften", title: "Højskoleaften", color: "#7c3aed", textColor: "#ffffff", defaultDuration: 90 },
        { id: "b_frivillig", title: "Frivillig / Aften", color: "#0d9488", textColor: "#ffffff", defaultDuration: 75 },
        { id: "b_buffer", title: "BUFFER", color: "#94a3b8", textColor: "#ffffff", defaultDuration: 90 },
        { id: "b_cleaning", title: "Rengøring", color: "#808895", textColor: "#ffffff", defaultDuration: 90 }

    ],

    // 3. Faste måltider
    mealBlocks: [
        { title: "Morgenmad", start: "07:30", end: "08:00", color: "#353636", textColor: "#e5e7e7" },
        { title: "Frokost", start: "12:00", end: "12:30", color: "#353636", textColor: "#e5e7e7" },
        { title: "Rengøring", start: "12:30", end: "13:00", color: "#353636", textColor: "#e5e7e7" },
        { title: "Aftensmad", start: "17:30", end: "18:15", color: "#353636", textColor: "#e5e7e7" }
    ]
};