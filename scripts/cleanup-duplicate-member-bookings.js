require("dotenv").config();
const db = require("../src/models");
const { Op } = require("sequelize");

const APPLY = process.argv.includes("--apply");

function slotKey(b) {
  return [
    Number(b.memberId || 0),
    String(b.bookingDate || "").slice(0, 10),
    String(b.startTime || "").slice(0, 5),
    String(b.endTime || "").slice(0, 5),
  ].join("|");
}

async function main() {
  try {
    console.log("=== Cleanup duplicate member bookings ===");
    console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);

    const bookings = await db.Booking.findAll({
      where: {
        status: { [Op.ne]: "cancelled" },
      },
      attributes: [
        "id",
        "memberId",
        "trainerId",
        "packageActivationId",
        "bookingDate",
        "startTime",
        "endTime",
        "status",
        "createdAt",
      ],
      order: [["id", "ASC"]],
      raw: true,
    });

    const grouped = new Map();
    for (const b of bookings) {
      const key = slotKey(b);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(b);
    }

    const duplicateGroups = [];
    const deleteIds = [];

    for (const [key, rows] of grouped.entries()) {
      if (rows.length <= 1) continue;
      // Keep newest row, remove older rows.
      const sorted = [...rows].sort((a, b) => Number(b.id) - Number(a.id));
      const keep = sorted[0];
      const remove = sorted.slice(1);
      duplicateGroups.push({ key, keepId: keep.id, removeIds: remove.map((x) => x.id) });
      remove.forEach((x) => deleteIds.push(Number(x.id)));
    }

    if (!duplicateGroups.length) {
      console.log("Khong tim thay booking trung khung gio.");
      await db.sequelize.close();
      return;
    }

    console.log(`Tim thay ${duplicateGroups.length} nhom trung. So booking du: ${deleteIds.length}`);
    duplicateGroups.slice(0, 20).forEach((g) => {
      console.log(`- ${g.key} | keep=${g.keepId} | delete=${g.removeIds.join(",")}`);
    });
    if (duplicateGroups.length > 20) {
      console.log(`... va ${duplicateGroups.length - 20} nhom khac`);
    }

    if (!APPLY) {
      console.log("Chay lai voi --apply de xoa booking trung.");
      await db.sequelize.close();
      return;
    }

    const t = await db.sequelize.transaction();
    try {
      if (db.Attendance) {
        await db.Attendance.destroy({
          where: { bookingId: { [Op.in]: deleteIds } },
          transaction: t,
        });
      }
      if (db.Commission) {
        await db.Commission.destroy({
          where: { bookingId: { [Op.in]: deleteIds } },
          transaction: t,
        });
      }
      if (db.BookingRescheduleRequest) {
        await db.BookingRescheduleRequest.destroy({
          where: { bookingId: { [Op.in]: deleteIds } },
          transaction: t,
        });
      }

      const deleted = await db.Booking.destroy({
        where: { id: { [Op.in]: deleteIds } },
        transaction: t,
      });

      await t.commit();
      console.log(`Da xoa ${deleted} booking trung.`);
    } catch (error) {
      await t.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Script loi:", error?.message || error);
    if (error?.original?.sqlMessage) {
      console.error("MySQL:", error.original.sqlMessage);
    }
    process.exitCode = 1;
  } finally {
    await db.sequelize.close();
  }
}

main();
