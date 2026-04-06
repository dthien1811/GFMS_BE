'use strict';

const EN_TO_VI = [
  ["functional training", "Tập chức năng"],
  ["personal training", "Huấn luyện viên cá nhân"],
  ["nutrition coaching", "Huấn luyện dinh dưỡng"],
  ["muscle building", "Tăng cơ"],
  ["body building", "Thể hình"],
  ["bodybuilding", "Thể hình"],
  ["fat burning", "Đốt mỡ"],
  ["weight loss", "Giảm mỡ"],
  ["muscle gain", "Tăng cơ"],
  ["weight gain", "Tăng cân"],
  ["fat loss", "Giảm mỡ"],
  ["rehabilitation", "Phục hồi chức năng"],
  ["calisthenics", "Thể dục tự thân"],
  ["powerlifting", "Cử tạ"],
  ["stretching", "Kéo giãn"],
  ["nutrition", "Dinh dưỡng"],
  ["swimming", "Bơi lội"],
  ["running", "Chạy bộ"],
  ["cycling", "Đạp xe"],
  ["boxing", "Quyền anh"],
  ["cardio", "Tập cardio"],
  ["yoga", "Yoga"],
];

const VI_TO_EN = [
  ["Tăng cơ", "muscle building"],
  ["Thể hình", "bodybuilding"],
  ["Đốt mỡ", "fat burning"],
  ["Giảm mỡ", "weight loss"],
  ["Tăng cân", "weight gain"],
  ["Phục hồi chức năng", "rehabilitation"],
  ["Thể dục tự thân", "calisthenics"],
  ["Cử tạ", "powerlifting"],
  ["Kéo giãn", "stretching"],
  ["Linh hoạt khớp", "mobility"],
  ["Dinh dưỡng", "nutrition"],
  ["Bơi lội", "swimming"],
  ["Chạy bộ", "running"],
  ["Đạp xe", "cycling"],
  ["Quyền anh", "boxing"],
  ["Tập cardio", "cardio"],
  ["Yoga", "yoga"],
];

const toTitleCase = (value) =>
  String(value || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const normalizeSpecialization = (raw, mapPairs, fallbackFormatter) => {
  if (!raw) return '';

  const map = new Map(mapPairs.map(([from, to]) => [String(from).toLowerCase(), to]));

  const parts = String(raw)
    .split(/[\n,;|]+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const dedup = new Set();
  const normalized = [];

  parts.forEach((part) => {
    const key = part.toLowerCase();
    const mapped = map.get(key) || fallbackFormatter(part);
    const dedupKey = mapped.toLowerCase();
    if (!dedup.has(dedupKey)) {
      dedup.add(dedupKey);
      normalized.push(mapped);
    }
  });

  return normalized.join(', ');
};

module.exports = {
  up: async (queryInterface) => {
    const [rows] = await queryInterface.sequelize.query(`
      SELECT id, specialization
      FROM trainer
      WHERE specialization IS NOT NULL
        AND TRIM(specialization) <> ''
    `);

    for (const row of rows) {
      const nextValue = normalizeSpecialization(
        row.specialization,
        EN_TO_VI,
        (value) => toTitleCase(value)
      );

      if (!nextValue || nextValue === row.specialization) continue;

      await queryInterface.sequelize.query(
        `UPDATE trainer SET specialization = :specialization WHERE id = :id`,
        {
          replacements: { id: row.id, specialization: nextValue },
        }
      );
    }

    console.log('✅ Normalized trainer.specialization to Vietnamese labels');
  },

  down: async (queryInterface) => {
    const [rows] = await queryInterface.sequelize.query(`
      SELECT id, specialization
      FROM trainer
      WHERE specialization IS NOT NULL
        AND TRIM(specialization) <> ''
    `);

    for (const row of rows) {
      const prevValue = normalizeSpecialization(
        row.specialization,
        VI_TO_EN,
        (value) => String(value || '').trim().toLowerCase()
      );

      if (!prevValue || prevValue === row.specialization) continue;

      await queryInterface.sequelize.query(
        `UPDATE trainer SET specialization = :specialization WHERE id = :id`,
        {
          replacements: { id: row.id, specialization: prevValue },
        }
      );
    }

    console.log('↩️ Reverted trainer.specialization to English labels (best effort)');
  },
};
