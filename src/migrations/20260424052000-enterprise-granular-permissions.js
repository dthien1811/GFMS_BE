'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    const perms = [
      { url: "perm:equipment:write", description: "Admin can create/update/delete equipment templates" },
      { url: "perm:equipment_assets:qr_regenerate", description: "Admin can regenerate equipment asset QR tokens" },
      { url: "perm:purchase_workflow:ship", description: "Admin can move paid combo request to shipping" },
      { url: "perm:maintenance:transition", description: "Admin can approve/assign/start/complete maintenance requests" },
    ];

    // 1) ensure roles exist
    for (const p of perms) {
      // eslint-disable-next-line no-await-in-loop
      const existing = await queryInterface.sequelize.query(
        "SELECT id FROM role WHERE url = :url LIMIT 1",
        { replacements: { url: p.url }, type: Sequelize.QueryTypes.SELECT }
      );
      if (existing && existing[0]?.id) continue;
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.bulkInsert(
        "role",
        [
          {
            url: p.url,
            description: p.description,
            createdAt: now,
            updatedAt: now,
          },
        ],
        {}
      );
    }

    // 2) attach these roles to all groups that already have any "/admin" permission
    const adminGroupRows = await queryInterface.sequelize.query(
      `
      SELECT DISTINCT gr.groupId AS groupId
      FROM grouprole gr
      JOIN role r ON r.id = gr.roleId
      WHERE r.url LIKE '/admin%'
      `,
      { type: Sequelize.QueryTypes.SELECT }
    );

    // fallback: if no '/admin%' role found, attach to groupId=1 if exists
    let targetGroupIds = (adminGroupRows || []).map((x) => Number(x.groupId)).filter(Boolean);
    if (!targetGroupIds.length) {
      const anyGroup = await queryInterface.sequelize.query("SELECT id FROM `group` ORDER BY id ASC LIMIT 1", {
        type: Sequelize.QueryTypes.SELECT,
      });
      if (anyGroup?.[0]?.id) targetGroupIds = [Number(anyGroup[0].id)];
    }

    const grDesc = await queryInterface.describeTable("grouprole").catch(() => ({}));
    const hasTimestamps = !!grDesc.createdAt && !!grDesc.updatedAt;

    const roleRows = await queryInterface.sequelize.query(
      `SELECT id, url FROM role WHERE url IN (:urls)`,
      { replacements: { urls: perms.map((p) => p.url) }, type: Sequelize.QueryTypes.SELECT }
    );
    const roleIdByUrl = new Map((roleRows || []).map((r) => [String(r.url), Number(r.id)]));

    const inserts = [];
    for (const gid of targetGroupIds) {
      for (const p of perms) {
        const rid = roleIdByUrl.get(p.url);
        if (!rid) continue;
        // eslint-disable-next-line no-await-in-loop
        const exists = await queryInterface.sequelize.query(
          "SELECT id FROM grouprole WHERE groupId = :groupId AND roleId = :roleId LIMIT 1",
          { replacements: { groupId: gid, roleId: rid }, type: Sequelize.QueryTypes.SELECT }
        );
        if (exists && exists[0]?.id) continue;
        const row = { groupId: gid, roleId: rid };
        if (hasTimestamps) {
          row.createdAt = now;
          row.updatedAt = now;
        }
        inserts.push(row);
      }
    }

    if (inserts.length) {
      await queryInterface.bulkInsert("grouprole", inserts, {});
    }
  },

  async down(queryInterface, Sequelize) {
    const urls = [
      "perm:equipment:write",
      "perm:equipment_assets:qr_regenerate",
      "perm:purchase_workflow:ship",
      "perm:maintenance:transition",
    ];

    const roleRows = await queryInterface.sequelize.query(
      `SELECT id FROM role WHERE url IN (:urls)`,
      { replacements: { urls }, type: Sequelize.QueryTypes.SELECT }
    );
    const ids = (roleRows || []).map((r) => Number(r.id)).filter(Boolean);
    if (ids.length) {
      await queryInterface.sequelize.query(`DELETE FROM grouprole WHERE roleId IN (:ids)`, {
        replacements: { ids },
        type: Sequelize.QueryTypes.DELETE,
      });
      await queryInterface.sequelize.query(`DELETE FROM role WHERE id IN (:ids)`, {
        replacements: { ids },
        type: Sequelize.QueryTypes.DELETE,
      });
    }
  },
};

