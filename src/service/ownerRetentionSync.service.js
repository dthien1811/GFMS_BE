import { Op } from "sequelize";
import db from "../models/index";
import realtimeService from "./realtime.service";
import { applyPackageActivationCompletion, removePendingCommissionForBooking } from "./bookingActivationHelpers";
import { bookingSlotEndDate, bookingDateToYmd } from "../utils/vnWallClock";

const DEFAULT_RETENTION_REASON =
  "Buổi tập đã qua giờ, huấn luyện viên không điểm danh — toàn bộ giá trị buổi ghi nhận cho chủ phòng tập.";
const ATTENDANCE_EDIT_GRACE_HOURS_RAW = Number(process.env.ATTENDANCE_EDIT_GRACE_HOURS || 24);
const ATTENDANCE_EDIT_GRACE_HOURS =
  Number.isFinite(ATTENDANCE_EDIT_GRACE_HOURS_RAW) && ATTENDANCE_EDIT_GRACE_HOURS_RAW >= 24
    ? ATTENDANCE_EDIT_GRACE_HOURS_RAW
    : 24;
const PT_REMINDER_AFTER_HOURS = Number(process.env.PT_ATTENDANCE_REMINDER_AFTER_HOURS || 6);
const PT_REMINDER_INTERVAL_HOURS = Math.max(
  1,
  Number(
    process.env.PT_ATTENDANCE_REMINDER_INTERVAL_HOURS ||
      6
  )
);
const OWNER_REMINDER_MARKER = "[ATTENDANCE_OWNER_REMINDER]";
const PT_REMINDER_MARKER = "[ATTENDANCE_PT_REMINDER]";
const PT_REMINDER_COUNT_MARKER = "[ATTENDANCE_PT_REMINDER_COUNT:";

/** Ngày YYYY-MM-DD theo giờ local server (tránh lệch ngày so với toISOString UTC). */
const toYmdLocal = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Không chạy đồng bộ nặng trong GET /commissions — chỉ lên lịch nền + giới hạn tần suất */
const ownerPageSyncLastAt = new Map();
const ownerPageSyncInFlight = new Set();
const OWNER_PAGE_SYNC_MIN_MS = Number(process.env.OWNER_COMMISSION_PAGE_SYNC_MS || 120000);

/**
 * Gọi từ API danh sách hoa hồng: trả về ngay, đồng bộ buổi quá hạn chạy sau (socket commission:changed sẽ refresh FE).
 */
export function scheduleSyncForOwnerUser(ownerUserId) {
  const id = Number(ownerUserId);
  if (!id) return;

  const now = Date.now();
  const last = ownerPageSyncLastAt.get(id) || 0;
  if (now - last < OWNER_PAGE_SYNC_MIN_MS) return;
  if (ownerPageSyncInFlight.has(id)) return;

  ownerPageSyncLastAt.set(id, now);
  ownerPageSyncInFlight.add(id);

  setImmediate(() => {
    syncForOwnerUser(id)
      .catch((e) => console.error("[ownerRetentionSync] scheduled sync:", e.message))
      .finally(() => ownerPageSyncInFlight.delete(id));
  });
}

const isTrainerShareBooking = (booking) =>
  String(booking?.sessionType || "").toLowerCase() === "trainer_share";

const trainerPayeeOrNullWhere = () => ({
  [Op.or]: [{ payee: null }, { payee: "trainer" }],
});

export const computeSessionValueForBooking = async (booking, { transaction } = {}) => {
  const PackageActivation = db.PackageActivation || db.packageactivation;
  const Package = db.Package || db.package;

  const activationId = booking.packageActivationId || booking.activationId || null;
  const bookingPackageId = booking.packageId || null;
  let sessionValue = 0;

  if (activationId && PackageActivation) {
    const activation = await PackageActivation.findByPk(activationId, {
      include: [{ model: Package, attributes: ["id", "price", "sessions"] }],
      transaction,
    });
    if (activation && activation.Package) {
      const totalSessions = Number(activation.totalSessions ?? activation.Package.sessions ?? 0);
      const price = Number(activation.Package.price || 0);
      if (totalSessions > 0 && price > 0) {
        sessionValue = price / totalSessions;
      }
    }
  }

  if ((!sessionValue || sessionValue <= 0) && bookingPackageId && Package) {
    const pkg = await Package.findByPk(bookingPackageId, {
      attributes: ["id", "price", "sessions"],
      transaction,
    });
    if (pkg) {
      const totalSessions = Number(pkg.sessions || 0);
      const price = Number(pkg.price || 0);
      if (totalSessions > 0 && price > 0) {
        sessionValue = price / totalSessions;
      }
    }
  }

  return sessionValue;
};

export async function createOwnerRetentionCommissionForBooking(booking, { transaction } = {}) {
  const Commission = db.Commission || db.commission;
  if (!Commission || !booking?.id) return null;

  const dup = await Commission.findOne({
    where: { bookingId: booking.id, payee: "owner" },
    transaction,
  });
  if (dup) return dup;

  const sessionValue = await computeSessionValueForBooking(booking, { transaction });
  if (!sessionValue || !Number.isFinite(sessionValue) || sessionValue <= 0) return null;

  return Commission.create(
    {
      trainerId: booking.trainerId,
      bookingId: booking.id,
      gymId: booking.gymId,
      activationId: booking.packageActivationId || null,
      payrollPeriodId: null,
      sessionDate: booking.bookingDate || new Date(),
      sessionValue,
      commissionRate: 0,
      commissionAmount: 0,
      status: "calculated",
      calculatedAt: new Date(),
      payee: "owner",
      retentionReason: DEFAULT_RETENTION_REASON,
    },
    { transaction }
  );
}

const formatSlotLabel = (booking) => {
  const ymd = bookingDateToYmd(booking?.bookingDate);
  const start = String(booking?.startTime || "").slice(0, 5);
  const end = String(booking?.endTime || "").slice(0, 5);
  if (!ymd) return "Buổi tập";
  const [y, m, d] = ymd.split("-");
  const vn = d && m && y ? `${d}/${m}/${y}` : ymd;
  return start && end ? `${vn} (${start}-${end})` : vn;
};

const notifyOwnerRetentionRecorded = async (booking) => {
  try {
    const gym = await db.Gym.findByPk(booking.gymId, { attributes: ["ownerId", "name"] });
    const ownerId = gym?.ownerId;
    if (!ownerId) return;
    await realtimeService.notifyUser(ownerId, {
      title: "Đã ghi nhận doanh thu buổi tập",
      message: `Buổi ${formatSlotLabel(booking)}: toàn bộ giá trị buổi được ghi nhận cho chủ phòng vì PT chưa điểm danh sau giờ kết thúc.${
        gym?.name ? ` Chi nhánh: ${gym.name}.` : ""
      }`,
      notificationType: "booking_update",
      relatedType: "booking",
      relatedId: booking.id,
    });
  } catch (e) {
    console.error("[ownerRetentionSync] notifyOwnerRetentionRecorded:", e.message);
  }
};

const bookingSlotEnd = bookingSlotEndDate;

const bookingAttendanceDeadline = (booking) => {
  const end = bookingSlotEnd(booking);
  if (!end) return null;
  return new Date(end.getTime() + ATTENDANCE_EDIT_GRACE_HOURS * 60 * 60 * 1000);
};

const isPastAttendanceDeadline = (booking, now = new Date()) => {
  const deadline = bookingAttendanceDeadline(booking);
  return !!deadline && now >= deadline;
};

const bookingPtReminderAt = (booking) => {
  const end = bookingSlotEnd(booking);
  if (!end) return null;
  return new Date(end.getTime() + PT_REMINDER_AFTER_HOURS * 60 * 60 * 1000);
};

const hasMarker = (notes, marker) => String(notes || "").includes(marker);

const appendMarker = (notes, marker, extra = "") => {
  const current = String(notes || "");
  if (current.includes(marker)) return current;
  const line = `${marker}${extra ? ` ${extra}` : ""}`.trim();
  return current ? `${current}\n${line}` : line;
};

const getPtReminderCount = (notes) => {
  const raw = String(notes || "");
  const m = raw.match(/\[ATTENDANCE_PT_REMINDER_COUNT:(\d+)\]/);
  const parsed = m ? Number(m[1]) : 0;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

const hasRequiredReminderEvidence = (notes) => {
  const raw = String(notes || "");
  const hasOwnerReminder = raw.includes(OWNER_REMINDER_MARKER);
  const hasPtReminder = raw.includes(PT_REMINDER_MARKER);
  const ptReminderCount = getPtReminderCount(raw);
  return hasOwnerReminder && hasPtReminder && ptReminderCount >= 1;
};

const setPtReminderCount = (notes, count) => {
  const safeCount = Math.max(0, Number(count) || 0);
  const raw = String(notes || "");
  const line = `${PT_REMINDER_COUNT_MARKER}${safeCount}]`;
  if (raw.match(/\[ATTENDANCE_PT_REMINDER_COUNT:(\d+)\]/)) {
    return raw.replace(/\[ATTENDANCE_PT_REMINDER_COUNT:(\d+)\]/, line);
  }
  return raw ? `${raw}\n${line}` : line;
};

const notifyAttendancePendingReminder = async ({
  booking,
  trainerUserId,
  ownerId,
  gymName,
  deadline,
  notifyOwner,
  notifyPt,
  ptReminderSequence,
}) => {
  const slot = formatSlotLabel(booking);
  const deadlineLabel = deadline
    ? new Date(deadline).toLocaleString("vi-VN")
    : `${ATTENDANCE_EDIT_GRACE_HOURS} giờ sau giờ kết thúc`;

  if (notifyOwner && ownerId) {
    await realtimeService.notifyUser(ownerId, {
      title: "PT chưa điểm danh buổi tập",
      message: `Buổi ${slot} chưa được PT điểm danh. Vui lòng nhắc PT cập nhật trước ${deadlineLabel}. Quá hạn hệ thống sẽ tự ghi nhận doanh thu về chủ phòng tập.${
        gymName ? ` Chi nhánh: ${gymName}.` : ""
      }`,
      notificationType: "booking_update",
      relatedType: "booking",
      relatedId: booking.id,
    });
  }

  if (notifyPt && trainerUserId) {
    const remindLabel =
      Number.isInteger(Number(ptReminderSequence))
        ? ` (lần ${ptReminderSequence})`
        : "";
    await realtimeService.notifyUser(trainerUserId, {
      title: "Nhắc cập nhật điểm danh buổi tập",
      message: `Buổi ${slot} chưa được điểm danh${remindLabel}. Bạn có thể cập nhật trong vòng ${ATTENDANCE_EDIT_GRACE_HOURS} giờ sau giờ kết thúc (đến ${deadlineLabel}). Quá hạn doanh thu buổi sẽ chuyển về chủ phòng tập.`,
      notificationType: "booking_update",
      relatedType: "booking",
      relatedId: booking.id,
    });
  }
};

const emitOwnersForGyms = async (gymIds) => {
  const uniq = [...new Set((gymIds || []).map(Number).filter((n) => n > 0))];
  if (!uniq.length) return;
  const gyms = await db.Gym.findAll({
    where: { id: { [Op.in]: uniq } },
    attributes: ["ownerId"],
    raw: true,
  });
  const ownerIds = [...new Set(gyms.map((g) => g.ownerId).filter(Boolean))];
  ownerIds.forEach((userId) => {
    realtimeService.emitUser(userId, "commission:changed", { source: "owner_retention_sync" });
  });
};

async function processOneBooking(bookingId) {
  const { Booking, Trainer, Attendance, Commission } = db;
  const t = await db.sequelize.transaction();
  let reminderPayload = null;
  try {
    const booking = await Booking.findByPk(bookingId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!booking) {
      await t.rollback();
      return false;
    }

    if (!["confirmed", "in_progress"].includes(String(booking.status || ""))) {
      await t.rollback();
      return false;
    }

    if (isTrainerShareBooking(booking)) {
      await t.rollback();
      return false;
    }

    const end = bookingSlotEnd(booking);
    if (!end || end >= new Date()) {
      await t.rollback();
      return false;
    }

    const trainer = await Trainer.findByPk(booking.trainerId, {
      attributes: ["id", "userId"],
      transaction: t,
    });
    if (!trainer?.userId) {
      await t.rollback();
      return false;
    }

    const att = await Attendance.findOne({
      where: {
        bookingId: booking.id,
        attendanceType: "trainer",
        userId: trainer.userId,
      },
      transaction: t,
    });
    if (att) {
      await t.rollback();
      return false;
    }

    const trainerLine = await Commission.findOne({
      where: {
        bookingId: booking.id,
        ...trainerPayeeOrNullWhere(),
      },
      transaction: t,
    });
    if (trainerLine) {
      await t.rollback();
      return false;
    }

    const ownerLine = await Commission.findOne({
      where: { bookingId: booking.id, payee: "owner" },
      transaction: t,
    });
    if (ownerLine) {
      await t.rollback();
      return false;
    }

    const deadline = bookingAttendanceDeadline(booking);
    if (!deadline) {
      await t.rollback();
      return false;
    }
    const beforeDeadline = deadline && deadline > new Date();
    if (beforeDeadline) {
      const gym = await db.Gym.findByPk(booking.gymId, {
        attributes: ["ownerId", "name"],
        transaction: t,
      });
      const now = new Date();
      const ptReminderAt = bookingPtReminderAt(booking);
      const notifyOwner = !hasMarker(booking.notes, OWNER_REMINDER_MARKER);
      const remindedCount = getPtReminderCount(booking.notes);
      const nextReminderAt = ptReminderAt
        ? new Date(
            ptReminderAt.getTime() + remindedCount * PT_REMINDER_INTERVAL_HOURS * 60 * 60 * 1000
          )
        : null;
      const notifyPt = !!nextReminderAt && now >= nextReminderAt && now < deadline;
      if (notifyOwner || notifyPt) {
        let nextNotes = booking.notes;
        if (notifyOwner) {
          nextNotes = appendMarker(nextNotes, OWNER_REMINDER_MARKER, new Date().toISOString());
        }
        if (notifyPt) {
          nextNotes = appendMarker(nextNotes, PT_REMINDER_MARKER, new Date().toISOString());
          nextNotes = setPtReminderCount(nextNotes, remindedCount + 1);
        }
        booking.notes = nextNotes;
        await booking.save({ transaction: t, fields: ["notes", "updatedAt"] });
        reminderPayload = {
          booking: booking.toJSON ? booking.toJSON() : booking,
          trainerUserId: Number(trainer.userId || 0) || null,
          ownerId: Number(gym?.ownerId || 0) || null,
          gymName: gym?.name || null,
          deadline,
          notifyOwner,
          notifyPt,
          ptReminderSequence: notifyPt ? remindedCount + 1 : null,
        };
      }
      await t.commit();
      if (reminderPayload) {
        await notifyAttendancePendingReminder(reminderPayload);
      }
      return false;
    }

    // Safety gate: never retain revenue unless reminders to owner/PT were recorded.
    // If deadline is already passed but reminders are missing, push reminder now and defer retention.
    if (!hasRequiredReminderEvidence(booking.notes)) {
      const gym = await db.Gym.findByPk(booking.gymId, {
        attributes: ["ownerId", "name"],
        transaction: t,
      });
      const existingCount = getPtReminderCount(booking.notes);
      const notifyOwner = !hasMarker(booking.notes, OWNER_REMINDER_MARKER);
      const notifyPt = !hasMarker(booking.notes, PT_REMINDER_MARKER) || existingCount < 1;
      if (notifyOwner || notifyPt) {
        let nextNotes = booking.notes;
        if (notifyOwner) {
          nextNotes = appendMarker(nextNotes, OWNER_REMINDER_MARKER, new Date().toISOString());
        }
        if (notifyPt) {
          nextNotes = appendMarker(nextNotes, PT_REMINDER_MARKER, new Date().toISOString());
          nextNotes = setPtReminderCount(nextNotes, Math.max(1, existingCount + 1));
        }
        booking.notes = nextNotes;
        await booking.save({ transaction: t, fields: ["notes", "updatedAt"] });
        reminderPayload = {
          booking: booking.toJSON ? booking.toJSON() : booking,
          trainerUserId: Number(trainer.userId || 0) || null,
          ownerId: Number(gym?.ownerId || 0) || null,
          gymName: gym?.name || null,
          deadline,
          notifyOwner,
          notifyPt,
          ptReminderSequence: notifyPt ? Math.max(1, existingCount + 1) : null,
        };
      }
      await t.commit();
      if (reminderPayload) {
        await notifyAttendancePendingReminder(reminderPayload);
      }
      return false;
    }

    await applyPackageActivationCompletion(booking, { transaction: t });
    await removePendingCommissionForBooking(booking.id, t);
    await createOwnerRetentionCommissionForBooking(booking, { transaction: t });

    await booking.update(
      {
        status: "no_show",
        checkoutTime: new Date(),
      },
      { transaction: t }
    );

    await t.commit();
    await notifyOwnerRetentionRecorded(booking);
    return true;
  } catch (e) {
    await t.rollback();
    console.error("[ownerRetentionSync] processOneBooking:", bookingId, e.message);
    return false;
  }
}

export async function syncPastUnmarkedForGymIds(gymIds, { limit = 350 } = {}) {
  if (!gymIds?.length) return { processed: 0 };

  const min = new Date();
  min.setDate(min.getDate() - 180);
  const minStr = toYmdLocal(min);
  const todayStr = toYmdLocal(new Date());

  const rows = await db.Booking.findAll({
    where: {
      gymId: { [Op.in]: gymIds },
      status: { [Op.in]: ["confirmed", "in_progress"] },
      bookingDate: { [Op.between]: [minStr, todayStr] },
    },
    attributes: ["id", "bookingDate", "endTime", "status", "sessionType"],
    // DESC: ưu tiên buổi gần đây — ASC + limit dễ bị các booking cũ chiếm hết quota, không bao giờ xử lý tới buổi mới.
    order: [
      ["bookingDate", "DESC"],
      ["id", "DESC"],
    ],
    limit: Math.min(Math.max(limit, 1), 800),
  });

  const candidates = rows.filter((r) => {
    if (isTrainerShareBooking(r)) return false;
    const end = bookingSlotEnd(r);
    return end && end < new Date();
  });

  let processed = 0;
  const touchedGyms = new Set();
  for (const r of candidates) {
    const ok = await processOneBooking(r.id);
    if (ok) {
      processed += 1;
      touchedGyms.add(Number(r.gymId));
    }
  }

  if (processed > 0) {
    await emitOwnersForGyms([...touchedGyms]);
  }

  return { processed };
}

export async function backfillOwnerCommissionRowsForGyms(gymIds, { limit = 150 } = {}) {
  if (!gymIds?.length) return { backfilled: 0 };

  const rows = await db.Booking.findAll({
    where: {
      gymId: { [Op.in]: gymIds },
      status: "no_show",
    },
    order: [["bookingDate", "DESC"]],
    limit: Math.min(Math.max(limit, 1), 400),
  });

  let backfilled = 0;
  const touchedGyms = new Set();
  const now = new Date();
  for (const b of rows) {
    if (!isPastAttendanceDeadline(b, now)) continue;
    if (!hasRequiredReminderEvidence(b.notes)) continue;
    const hasOwner = await db.Commission.findOne({
      where: { bookingId: b.id, payee: "owner" },
    });
    if (hasOwner) continue;
    const hasTrainer = await db.Commission.findOne({
      where: { bookingId: b.id, ...trainerPayeeOrNullWhere() },
    });
    if (hasTrainer) continue;
    const created = await createOwnerRetentionCommissionForBooking(b);
    if (created) {
      backfilled += 1;
      if (b.gymId) touchedGyms.add(Number(b.gymId));
      await notifyOwnerRetentionRecorded(b);
    }
  }

  if (backfilled > 0) {
    await emitOwnersForGyms([...touchedGyms]);
  }

  return { backfilled };
}

export async function syncForOwnerUser(ownerUserId) {
  const gyms = await db.Gym.findAll({
    where: { ownerId: ownerUserId },
    attributes: ["id"],
    raw: true,
  });
  const gymIds = gyms.map((g) => g.id);
  const processed = await syncPastUnmarkedForGymIds(gymIds);
  const backfill = await backfillOwnerCommissionRowsForGyms(gymIds);
  return { ...processed, ...backfill };
}

export async function syncPastUnmarkedGlobally({ limit = 400 } = {}) {
  const min = new Date();
  min.setDate(min.getDate() - 180);
  const minStr = toYmdLocal(min);
  const todayStr = toYmdLocal(new Date());

  const rows = await db.Booking.findAll({
    where: {
      status: { [Op.in]: ["confirmed", "in_progress"] },
      bookingDate: { [Op.between]: [minStr, todayStr] },
    },
    attributes: ["id", "bookingDate", "endTime", "status", "sessionType", "gymId"],
    order: [
      ["bookingDate", "DESC"],
      ["id", "DESC"],
    ],
    limit: Math.min(Math.max(limit, 1), 800),
  });

  const candidates = rows.filter((r) => {
    if (isTrainerShareBooking(r)) return false;
    const end = bookingSlotEnd(r);
    return end && end < new Date();
  });

  let processed = 0;
  const touchedGyms = new Set();
  for (const r of candidates) {
    const ok = await processOneBooking(r.id);
    if (ok) {
      processed += 1;
      if (r.gymId) touchedGyms.add(Number(r.gymId));
    }
  }

  if (processed > 0) {
    await emitOwnersForGyms([...touchedGyms]);
  }

  return { processed };
}

export default {
  computeSessionValueForBooking,
  createOwnerRetentionCommissionForBooking,
  syncPastUnmarkedForGymIds,
  syncForOwnerUser,
  scheduleSyncForOwnerUser,
  syncPastUnmarkedGlobally,
  backfillOwnerCommissionRowsForGyms,
  trainerPayeeOrNullWhere,
};
