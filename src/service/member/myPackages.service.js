// src/service/member/myPackages.service.js
import db from "../../models";
import { Op } from "sequelize";

const SLOT_MINUTES = 60;

/* ================= TIME UTILS ================= */
const assertDateOnly = (d) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const e = new Error("Date must be YYYY-MM-DD");
    e.statusCode = 400;
    throw e;
  }
};

const timeToMinutes = (t) => {
  const s = String(t || "").slice(0, 5);
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

const minutesToTime = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;

const parseHHMM = (t) => {
  if (!t) return null;
  const s = String(t);
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  return null;
};

const dayKeyFromISODate = (date) => {
  const keys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return keys[new Date(`${date}T00:00:00`).getDay()];
};

const toLocalISO = (d) => d.toLocaleDateString("en-CA");
const startOfWeekMonday = (isoDate) => {
  const d = new Date(`${isoDate}T00:00:00`);
  const jsDow = d.getDay();             // 0=Sun..6=Sat
  const mondayIndex = (jsDow + 6) % 7;  // 0=Mon..6=Sun
  d.setDate(d.getDate() - mondayIndex);
  return toLocalISO(d);
};

const addDaysISO = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toLocalISO(d);
};

/* ================= MATCH RULE ================= */
function trainerMatchPackage(trainer, pkg) {
  if (!pkg?.type || pkg.type === "basic") return true;
  if (!trainer?.specialization) return false;

  const specs = Array.isArray(trainer.specialization)
    ? trainer.specialization
    : String(trainer.specialization).split(",").map((s) => s.trim().toLowerCase());

  return specs.includes(String(pkg.type).trim().toLowerCase());
}

/* ================= CORE: GET ACTIVATION ================= */
async function getActivationOrThrow(userId, activationId, t) {
  if (!activationId) {
    const e = new Error("Thiếu activationId");
    e.statusCode = 400;
    throw e;
  }

  const activation = await db.PackageActivation.findByPk(activationId, {
    include: [
      { model: db.Member, attributes: ["id", "userId", "gymId"] },
      { model: db.Package, attributes: ["id", "name", "type", "sessions", "trainerId", "gymId"] },
      { model: db.Transaction, attributes: ["id", "trainerId", "paymentStatus", "transactionType"] },
    ],
    transaction: t,
    lock: t ? t.LOCK.UPDATE : undefined,
  });

  if (!activation) {
    const e = new Error("Không tìm thấy gói đã mua");
    e.statusCode = 404;
    throw e;
  }

  if (Number(activation.Member.userId) !== Number(userId)) {
    const e = new Error("Gói tập không thuộc về bạn");
    e.statusCode = 403;
    throw e;
  }

  if (activation.status !== "active") {
    const e = new Error("Gói tập không active");
    e.statusCode = 400;
    throw e;
  }

  return activation;
}

/* ================= MEMBERS ================= */
async function getMembersByUserId(userId) {
  return db.Member.findAll({ where: { userId }, attributes: ["id", "gymId"] });
}

/* ================= COUNT HELPERS (LIMIT + COUNTERS) ================= */
async function countBookedNotCancelled(activationId, transaction) {
  return db.Booking.count({
    where: {
      packageActivationId: activationId,
      status: { [Op.ne]: "cancelled" },
    },
    transaction,
  });
}

async function countCompleted(activationId, transaction) {
  return db.Booking.count({
    where: {
      packageActivationId: activationId,
      status: { [Op.in]: ["completed", "in_progress"] },
    },
    transaction,
  });
}

async function syncActivationCounters(activation, transaction) {
  // ✅ sessionsRemaining = total - completed (KHÔNG phải total - booked)
  const total = Number(activation.totalSessions ?? activation.Package?.sessions ?? 0) || 0;
  const done = await countCompleted(activation.id, transaction);
  const remaining = Math.max(0, total - done);

  // update DB để UI đọc đúng (bạn có thể tắt nếu không muốn auto-update)
  try {
    await activation.update(
      { sessionsUsed: done, sessionsRemaining: remaining, totalSessions: total },
      { transaction }
    );
  } catch {
    // ignore nếu cột không cho update hoặc model khác
  }

  return { total, done, remaining };
}

/* ================= PICK TRAINER (POOL+RULE) ================= */
async function pickTrainerIdForActivation(activation, t) {
  const gymId = activation.Member.gymId;
  const pkg = activation.Package;

  const trainers = await db.Trainer.findAll({
    where: { gymId, isActive: true },
    attributes: ["id", "specialization", "rating"],
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  const pool = trainers.filter((tr) => trainerMatchPackage(tr, pkg));
  if (!pool.length) {
    const err = new Error("Gym không có PT phù hợp gói tập");
    err.statusCode = 400;
    throw err;
  }

  // đơn giản: ưu tiên rating
  pool.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
  return pool[0].id;
}


function deriveExpiryDate(activationDate, expiryDate, durationDays) {
  if (expiryDate) return expiryDate;
  const days = Number(durationDays || 0);
  if (!activationDate || !Number.isFinite(days) || days <= 0) return null;
  const d = new Date(activationDate);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d;
}

async function isActivationReviewEligible(memberId, activation) {
  if (!activation || !memberId) return false;
  const total = Number(activation.totalSessions ?? activation.Package?.sessions ?? 0) || 0;
  const status = String(activation.status || "").toLowerCase();
  const done = await countCompleted(activation.id).catch(() => 0);
  const remainingRaw = activation.sessionsRemaining;
  const remaining = Number.isFinite(Number(remainingRaw)) ? Number(remainingRaw) : Math.max(0, total - done);
  const isCompleted = status === 'completed' || (total > 0 && done >= total) || (total > 0 && remaining <= 0);
  if (!isCompleted) return false;
  const existing = await db.Review.findOne({
    where: { memberId, packageActivationId: activation.id, reviewType: 'package' },
    attributes: ['id'],
  }).catch(() => null);
  return !existing;
}

/* ================= MAIN SERVICE ================= */
const memberMyPackageService = {
  /* ===== GET DETAIL ===== */
  async getMyPackageDetail(userId, activationId) {
    if (String(activationId).startsWith("pending-")) {
      const err = new Error("Giao dịch đang chờ thanh toán");
      err.statusCode = 400;
      throw err;
    }

    const activation = await db.PackageActivation.findOne({
      where: { id: activationId },
      include: [
        { model: db.Package },
        {
          model: db.Member,
          include: [
            { model: db.Gym },
            { model: db.User, attributes: ["id", "username", "email", "phone", "address"] },
          ],
        },
        { model: db.Transaction },
      ],
    });

    if (!activation) {
      const err = new Error("Không tìm thấy gói");
      err.statusCode = 404;
      throw err;
    }

    if (activation.Member.userId !== userId) {
      const err = new Error("Không có quyền truy cập gói này");
      err.statusCode = 403;
      throw err;
    }

    // ✅ SYNC counters dứt điểm
    const { total, done, remaining } = await syncActivationCounters(activation);

    // resolve trainerId
    const trainerId = activation.Transaction?.trainerId || activation.Package?.trainerId || null;

    let trainer = null;
    if (trainerId) {
      trainer = await db.Trainer.findOne({
        where: { id: trainerId, isActive: true },
        include: [{ model: db.User, attributes: ["id", "username"] }],
      });
    }

    return {
      id: activation.id,
      status: activation.status,
      activationDate: activation.activationDate,
      expiryDate: deriveExpiryDate(activation.activationDate, activation.expiryDate, activation.Package?.durationDays),
      reviewEligible: await isActivationReviewEligible(activation.memberId, { ...activation, Package: activation.Package, totalSessions: total, status: remaining <= 0 ? 'completed' : activation.status }),

      // ✅ luôn trả theo synced value
      sessionsTotal: total,
      sessionsUsed: done,
      sessionsRemaining: remaining,

      Package: activation.Package,
      Gym: activation.Member?.Gym,
      Transaction: activation.Transaction,
      Trainer: trainer,
    };
  },

  /* ===== GET LIST ===== */
  async getMyPackages(userId) {
    try {
    const members = await getMembersByUserId(userId);
    if (!members || members.length === 0) {
      const err = new Error("Không tìm thấy thành viên");
      err.statusCode = 404;
      throw err;
    }

    const memberIds = members.map((m) => m.id);

    const activations = await db.PackageActivation.findAll({
      where: { memberId: memberIds },
      include: [
        {
          model: db.Package,
          attributes: ["id", "name", "type", "sessions", "price", "durationDays", "gymId", "trainerId"],
        },
        {
          model: db.Transaction,
          attributes: ["id", "transactionCode", "amount", "paymentMethod", "paymentStatus", "transactionDate", "description", "gymId", "trainerId", "createdAt"],
        },
        {
          model: db.Member,
          attributes: ["id", "gymId"],
          include: [{ model: db.Gym, attributes: ["id", "name"] }],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    // ✅ sync counter cho từng activation (có thể hơi nhiều query, nhưng fix dứt điểm)
    const activationList = [];
    for (const a of activations) {
      try {
        const synced = await syncActivationCounters(a).catch(() => ({
          total: Number(a.totalSessions ?? a.Package?.sessions ?? 0) || 0,
          done: Number(a.sessionsUsed || 0) || 0,
          remaining: Number(a.sessionsRemaining ?? Math.max(0, (Number(a.totalSessions ?? a.Package?.sessions ?? 0) || 0) - (Number(a.sessionsUsed || 0) || 0))) || 0,
        }));
        const total = synced.total;
        const done = synced.done;
        const remaining = synced.remaining;
        const safeActivation = {
          id: a.id,
          memberId: a.memberId,
          status: remaining <= 0 && total > 0 ? 'completed' : a.status,
          sessionsRemaining: remaining,
          totalSessions: total,
          Package: a.Package,
        };
        activationList.push({
          id: a.id,
          status: a.status,
          activationDate: a.activationDate,
          expiryDate: deriveExpiryDate(a.activationDate, a.expiryDate, a.Package?.durationDays),
          totalSessions: total,
          sessionsUsed: done,
          sessionsRemaining: remaining,
          pricePerSession: a.pricePerSession,
          reviewEligible: await isActivationReviewEligible(a.memberId, safeActivation),
          Package: a.Package || null,
          Transaction: a.Transaction || null,
          Member: a.Member || null,
          Gym: a.Member?.Gym || null,
        });
      } catch (err) {
        console.error('[memberMyPackageService.getMyPackages] skip broken activation', a?.id, err?.message || err);
      }
    }

    const pendingTransactions = await db.Transaction.findAll({
      where: {
        memberId: memberIds,
        transactionType: "package_purchase",
        paymentStatus: "pending",
        packageActivationId: null,
      },
      include: [
        { model: db.Package, attributes: ["id", "name", "type", "sessions", "price", "durationDays", "gymId", "trainerId"] },
        {
          model: db.Member,
          attributes: ["id", "gymId"],
          include: [{ model: db.Gym, attributes: ["id", "name"] }],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const pendingList = pendingTransactions.map((tx) => ({
      id: `pending-${tx.id}`,
      status: null,
      activationDate: null,
      expiryDate: null,
      totalSessions: tx.Package?.sessions || null,
      sessionsUsed: 0,
      sessionsRemaining: 0,
      pricePerSession: null,
      Package: tx.Package,
      Transaction: {
        id: tx.id,
        transactionCode: tx.transactionCode,
        amount: tx.amount,
        paymentMethod: tx.paymentMethod,
        paymentStatus: tx.paymentStatus,
        transactionDate: tx.transactionDate,
        description: tx.description,
        gymId: tx.gymId,
        trainerId: tx.trainerId || null,
      },
      Member: tx.Member,
      Gym: tx.Member?.Gym,
    }));

    return [...pendingList, ...activationList].sort((a, b) => {
      const aDate = a.Transaction?.transactionDate || a.Transaction?.createdAt || a.activationDate || new Date(0);
      const bDate = b.Transaction?.transactionDate || b.Transaction?.createdAt || b.activationDate || new Date(0);
      return new Date(bDate) - new Date(aDate);
    });
    } catch (e) {
      console.error('[memberMyPackageService.getMyPackages] error:', e?.message || e);
      throw e;
    }
  },

  /* ===== OPTIONAL: ASSIGN TRAINER ===== */
  async assignTrainer(userId, activationId, trainerId) {
    if (!trainerId) {
      const err = new Error("Thiếu trainerId");
      err.statusCode = 400;
      throw err;
    }

    const t = await db.sequelize.transaction();
    try {
      const activation = await getActivationOrThrow(userId, activationId, t);

      const trainer = await db.Trainer.findOne({
        where: { id: trainerId, gymId: activation.Member.gymId, isActive: true },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!trainer) {
        const err = new Error("Trainer không hợp lệ hoặc không thuộc gym");
        err.statusCode = 400;
        throw err;
      }

      if (!activation.transactionId) {
        const err = new Error("Gói này thiếu transactionId");
        err.statusCode = 400;
        throw err;
      }

      await db.Transaction.update(
        { trainerId: trainer.id },
        { where: { id: activation.transactionId }, transaction: t }
      );

      await t.commit();
      return { activationId: activation.id, trainerId: trainer.id };
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  /* ===== AUTO BOOK 4/8/12 WEEKS ===== */
  async saveWeekPatternAndAutoBook(userId, activationId, body = {}) {
    console.log("[AUTO_BOOK] TZ:", Intl.DateTimeFormat().resolvedOptions().timeZone);
    console.log("[AUTO_BOOK] serverNow ISO:", new Date().toISOString(), "local:", new Date().toString());
    console.log("[AUTO_BOOK] body:", JSON.stringify(body, null, 2));

    const repeatWeeks = Number(body.repeatWeeks || 8);
    if (![4, 8, 12].includes(repeatWeeks)) {
      const err = new Error("repeatWeeks chỉ hỗ trợ 4/8/12");
      err.statusCode = 400;
      throw err;
    }

    const startDate = String(body.startDate || "");
    assertDateOnly(startDate);

    const pattern = Array.isArray(body.pattern) ? body.pattern : [];
    if (!pattern.length) {
      const err = new Error("Thiếu pattern");
      err.statusCode = 400;
      throw err;
    }

    // default false để tạo trong tuần hiện tại (như bạn đang dùng)
    const startFromNextWeek = body.startFromNextWeek === true;

    const items = pattern
      .map((p) => {
        const jsDow = Number(p.dow);
        const st = parseHHMM(p.startTime);
        if (!Number.isInteger(jsDow) || jsDow < 0 || jsDow > 6 || !st) return null;
        return { jsDow, startTime: st };
      })
      .filter(Boolean);

    if (!items.length) {
      const err = new Error("pattern không hợp lệ");
      err.statusCode = 400;
      throw err;
    }

    const t = await db.sequelize.transaction();
    try {
      const activation = await getActivationOrThrow(userId, activationId, t);

      const gymId = activation.Member.gymId;

      // ✅ trainerId ưu tiên từ body để không bị trộn
      let trainerId = body.trainerId ? Number(body.trainerId) : null;

      if (!trainerId) {
        trainerId = activation.Transaction?.trainerId || activation.Package?.trainerId || null;

        if (!trainerId) {
          if (!activation.transactionId) {
            const err = new Error("Gói này thiếu transactionId nên không thể gán PT");
            err.statusCode = 400;
            throw err;
          }
          trainerId = await pickTrainerIdForActivation(activation, t);
          await db.Transaction.update({ trainerId }, { where: { id: activation.transactionId }, transaction: t });
        }
      }

      const trainer = await db.Trainer.findOne({
        where: { id: trainerId, gymId, isActive: true },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!trainer || !trainerMatchPackage(trainer, activation.Package)) {
        const err = new Error("Trainer không hợp lệ hoặc không phù hợp gói tập");
        err.statusCode = 400;
        throw err;
      }

      if (activation.transactionId) {
        await db.Transaction.update({ trainerId: trainer.id }, { where: { id: activation.transactionId }, transaction: t });
      }

      // ✅ LIMIT theo tổng số buổi: total - bookedNotCancelled
      const total = Number(activation.totalSessions ?? activation.Package?.sessions ?? 0) || 0;
      if (total <= 0) {
        const err = new Error("Gói không có tổng số buổi hợp lệ");
        err.statusCode = 400;
        throw err;
      }

      const bookedNow = await countBookedNotCancelled(activation.id, t);
      let canCreate = Math.max(0, total - bookedNow);

      console.log("[AUTO_BOOK] total=", total, "bookedNow=", bookedNow, "canCreate=", canCreate);

      // optional lưu pattern
      await activation
        .update(
          {
            weekPattern: items.map((x) => ({ dow: x.jsDow, startTime: x.startTime.slice(0, 5) })),
            autoRepeatWeeks: repeatWeeks,
          },
          { transaction: t }
        )
        .catch(() => {});

      const baseMonday = startOfWeekMonday(startDate);
      const now = new Date();

      const created = [];
      const skipped = [];

      items.sort((a, b) => a.jsDow - b.jsDow || a.startTime.localeCompare(b.startTime));
      const weekStartIndex = startFromNextWeek ? 1 : 0;

      console.log("[AUTO_BOOK] startDate:", startDate, "baseMonday:", baseMonday, "startFromNextWeek:", startFromNextWeek, "repeatWeeks:", repeatWeeks);

      for (let w = weekStartIndex; w < weekStartIndex + repeatWeeks; w++) {
        for (const it of items) {
          if (canCreate <= 0) {
            skipped.push({ date: null, startTime: it.startTime.slice(0, 5), reason: "Đã đặt đủ số buổi của gói" });
            continue;
          }

          const mondayISO = addDaysISO(baseMonday, w * 7);
          const mondayIndex = (it.jsDow + 6) % 7; // Mon=0..Sun=6
          const dateISO = addDaysISO(mondayISO, mondayIndex);

          const bookingDateTime = new Date(`${dateISO}T${it.startTime}`);
          if (bookingDateTime <= now) {
            skipped.push({ date: dateISO, startTime: it.startTime.slice(0, 5), reason: "Quá khứ" });
            continue;
          }

          const dayKey = dayKeyFromISODate(dateISO);
          const hours = trainer.availableHours?.[dayKey] || [];

          const sMin = timeToMinutes(it.startTime.slice(0, 5));
          const eMin = sMin + SLOT_MINUTES;
          const endTime = minutesToTime(eMin);

          const inWorkingHours = hours.some((h) => {
            const hs = timeToMinutes(h.start);
            const he = timeToMinutes(h.end);
            return sMin >= hs && eMin <= he;
          });

          if (!inWorkingHours) {
            skipped.push({ date: dateISO, startTime: it.startTime.slice(0, 5), reason: "Ngoài giờ PT" });
            continue;
          }

          const conflict = await db.Booking.findOne({
            where: {
              trainerId: trainer.id,
              gymId,
              bookingDate: dateISO,
              status: { [Op.notIn]: ["cancelled"] },
              [Op.and]: [{ startTime: { [Op.lt]: endTime } }, { endTime: { [Op.gt]: it.startTime } }],
            },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });

          if (conflict) {
            skipped.push({ date: dateISO, startTime: it.startTime.slice(0, 5), reason: "Trùng lịch" });
            continue;
          }

          console.log("[AUTO_BOOK] create candidate:", { trainerId: trainer.id, dateISO, startTime: it.startTime });

          const booking = await db.Booking.create(
            {
              memberId: activation.memberId,
              trainerId: trainer.id,
              gymId,
              packageId: activation.packageId,
              packageActivationId: activation.id,
              bookingDate: dateISO,
              startTime: it.startTime,
              endTime,
              status: "confirmed",
              createdBy: userId,
            },
            { transaction: t }
          );

          // ❌ KHÔNG decrement sessionsRemaining ở đây nữa
          canCreate -= 1;

          created.push({
            id: booking.id,
            date: dateISO,
            startTime: it.startTime.slice(0, 5),
            endTime: endTime.slice(0, 5),
          });
        }
      }

      // ✅ cuối cùng sync counters theo completed (để UI đúng)
      await syncActivationCounters(activation, t);

      await t.commit();

      return {
        repeatWeeks,
        trainerId: trainer.id,
        createdCount: created.length,
        created,
        skippedCount: skipped.length,
        skipped,
      };
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};

export default memberMyPackageService;