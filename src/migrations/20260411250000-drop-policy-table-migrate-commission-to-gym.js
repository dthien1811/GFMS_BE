"use strict";

/**
 * Xóa hoàn toàn bảng `policy`: chuyển tỷ lệ commission gym → gym.ownerCommissionRate,
 * gỡ FK/cột policyId trên trainershare & trainershareoverride, sau đó DROP policy.
 */
async function columnExists(queryInterface, table, column) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :col`,
    { replacements: { table, col: column } },
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function dropForeignKeysReferencingPolicy(queryInterface, tableName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = :t
       AND REFERENCED_TABLE_NAME = 'policy'`,
    { replacements: { t: tableName } },
  );
  const seen = new Set();
  for (const r of rows || []) {
    const name = r?.CONSTRAINT_NAME;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    await queryInterface.removeConstraint(tableName, name);
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await columnExists(queryInterface, "gym", "ownerCommissionRate"))) {
      await queryInterface.addColumn("gym", "ownerCommissionRate", {
        type: Sequelize.DECIMAL(6, 5),
        allowNull: true,
        comment: "Owner share 0–1 for commission; null = default 0.15 in app",
      });
    }

    // Copy từ policy commission (gym) sang gym — bỏ qua nếu bảng policy đã không còn
    try {
      await queryInterface.sequelize.query(`
        UPDATE gym g
        INNER JOIN (
          SELECT gymId,
            CAST(
              IFNULL(
                NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(CAST(\`value\` AS CHAR), '$.ownerRate'))), ''),
                '0.15'
              ) AS DECIMAL(8,5)
            ) AS ownerRate
          FROM policy
          WHERE policyType = 'commission' AND appliesTo = 'gym' AND gymId IS NOT NULL AND isActive = 1
        ) p ON p.gymId = g.id
        SET g.ownerCommissionRate = p.ownerRate
      `);
    } catch {
      /* policy table may already be gone */
    }

    if (await columnExists(queryInterface, "trainershare", "policyId")) {
      await dropForeignKeysReferencingPolicy(queryInterface, "trainershare");
      await queryInterface.removeColumn("trainershare", "policyId");
    }

    if (await columnExists(queryInterface, "trainershareoverride", "policyId")) {
      await dropForeignKeysReferencingPolicy(queryInterface, "trainershareoverride");
      await queryInterface.removeColumn("trainershareoverride", "policyId");
    }

    try {
      await queryInterface.dropTable("policy");
    } catch {
      /* already dropped */
    }
  },

  async down() {
    // Không khôi phục bảng policy (phức tạp + không còn dùng).
  },
};
