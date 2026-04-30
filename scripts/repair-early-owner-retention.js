require("dotenv").config();
const db = require("../src/models");

const ATTENDANCE_EDIT_GRACE_HOURS_RAW = Number(process.env.ATTENDANCE_EDIT_GRACE_HOURS || 24);
const ATTENDANCE_EDIT_GRACE_HOURS =
  Number.isFinite(ATTENDANCE_EDIT_GRACE_HOURS_RAW) && ATTENDANCE_EDIT_GRACE_HOURS_RAW >= 24
    ? ATTENDANCE_EDIT_GRACE_HOURS_RAW
    : 24;

const toYmdLocal = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const bookingSlotEnd = (booking) => {
  const raw = booking.bookingDate;
  const dateStr =
    typeof raw === "string" ? raw.slice(0, 10) : raw instanceof Date ? toYmdLocal(raw) : "";
  if (!dateStr) return null;
  let end = String(booking.endTime || "23:59:59");
  if (end.length === 5) end = `${end}:00`;
  const d = new Date(`${dateStr}T${end}`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const bookingAttendanceDeadline = (booking) => {
  const end = bookingSlotEnd(booking);
  if (!end) return null;
  return new Date(end.getTime() + ATTENDANCE_EDIT_GRACE_HOURS * 60 * 60 * 1000);
};

async function main() {
  const now = new Date();
  const ownerCommissions = await db.Commission.findAll({
    where: { payee: "owner" },
    attributes: ["id", "bookingId", "retentionReason", "createdAt"],
    order: [["id", "DESC"]],
  });

  const bookingIds = [...new Set(ownerCommissions.map((c) => Number(c.bookingId)).filter(Boolean))];
  if (!bookingIds.length) {
    console.log("Không có commission owner để kiểm tra.");
    await db.sequelize.close();
    return;
  }

  const bookings = await db.Booking.findAll({
    where: { id: bookingIds },
    attributes: ["id", "status", "bookingDate", "startTime", "endTime", "packageActivationId", "checkoutTime"],
  });
  const bookingById = new Map(bookings.map((b) => [Number(b.id), b]));

  const anomalies = ownerCommissions.filter((c) => {
    const b = bookingById.get(Number(c.bookingId));
    if (!b) return false;
    const deadline = bookingAttendanceDeadline(b);
    return !!deadline && deadline > now;
  });

  if (!anomalies.length) {
    console.log("Không phát hiện slot nào bị chốt tiền sớm trước 24h.");
    await db.sequelize.close();
    return;
  }

  const t = await db.sequelize.transaction();
  try {
    let restoredCount = 0;
    for (const commission of anomalies) {
      const booking = bookingById.get(Number(commission.bookingId));
      if (!booking) continue;

      if (booking.packageActivationId) {
        const activation = await db.PackageActivation.findByPk(booking.packageActivationId, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (activation) {
          await activation.update(
            {
              sessionsUsed: Math.max(0, Number(activation.sessionsUsed || 0) - 1),
              sessionsRemaining: Number(activation.sessionsRemaining || 0) + 1,
              status: "active",
            },
            { transaction: t }
          );
        }
      }

      await db.Commission.destroy({
        where: { id: commission.id },
        transaction: t,
      });

      await booking.update(
        {
          status: "confirmed",
          checkoutTime: null,
        },
        { transaction: t }
      );
      restoredCount += 1;
      console.log(`Restored booking #${booking.id} (deleted owner commission #${commission.id})`);
    }

    await t.commit();
    console.log(`Hoàn tất: đã rollback ${restoredCount} slot bị chốt tiền sớm.`);
  } catch (error) {
    await t.rollback();
    console.error("Rollback thất bại:", error?.message || error);
    if (error?.original?.sqlMessage) {
      console.error("MySQL:", error.original.sqlMessage);
    }
    process.exitCode = 1;
  } finally {
    await db.sequelize.close();
  }
}

main();
