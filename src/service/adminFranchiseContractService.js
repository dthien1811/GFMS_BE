"use strict";

const { FranchiseRequest, User, Gym, sequelize } = require("../models");

/**
 * Base 1/2: MOCK SignNow (đủ demo luồng doanh nghiệp)
 *
 * contractStatus enum (THEO DB):
 * not_sent | sent | viewed | signed | completed | void
 *
 * Rule:
 * - Approve request KHÔNG tạo gym
 * - Chỉ tạo gym khi contractStatus=completed
 */

function err(statusCode, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}
function now() {
  return new Date();
}
function mustIntId(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw err(400, "Invalid id");
  return n;
}
function getSignProvider() {
  // SIGN_PROVIDER=mock | signnow (hiện demo để mock)
  return (process.env.SIGN_PROVIDER || "mock").toLowerCase();
}

/**
 * 1) SEND CONTRACT (MOCK)
 * Chỉ cho send sau khi request đã approved.
 * not_sent -> sent (+ contractUrl mock)
 */
async function sendContract(req) {
  const id = mustIntId(req.params.id);
  const provider = getSignProvider();

  const fr = await FranchiseRequest.findByPk(id);
  if (!fr) throw err(404, "FranchiseRequest not found");

  if (fr.status !== "approved") {
    throw err(400, "Only APPROVED request can be sent contract");
  }

  // Các trạng thái đã đi vào flow contract thì không cho send lại
  const blocked = ["sent", "viewed", "signed", "completed", "void"];
  if (blocked.includes(fr.contractStatus)) {
    throw err(400, `Contract already in progress: ${fr.contractStatus}`);
  }

  // ===== BASE DEMO: MOCK =====
  if (provider === "mock") {
    await fr.update({
      contractStatus: "sent",
      signProvider: "mock",
      contractUrl: `https://mock-sign.local/contracts/${fr.id}`,
      signNowDocumentId: null,
      signNowDocumentGroupId: null,
      signNowInviteId: null,
    });

    return {
      ok: true,
      mode: "mock",
      message: "Contract sent (mock). Use mock endpoints to mark signed/completed.",
      data: fr,
    };
  }

  // ===== CHỪA CHỖ SIGNNOW THẬT (sau này làm tiếp) =====
  throw err(501, "SIGN_PROVIDER=signnow not implemented in base demo");
}

/**
 * 2) GET STATUS (polling)
 * FE gọi để lấy trạng thái từ DB.
 */
async function getContractStatus(req) {
  const id = mustIntId(req.params.id);
  const fr = await FranchiseRequest.findByPk(id);
  if (!fr) throw err(404, "FranchiseRequest not found");
  return { ok: true, data: fr };
}

/**
 * 3) MOCK MARK VIEWED (optional)
 * sent -> viewed
 */
async function mockMarkViewed(req) {
  const provider = getSignProvider();
  if (provider !== "mock") throw err(400, "Mock endpoints only allowed when SIGN_PROVIDER=mock");

  const id = mustIntId(req.params.id);
  const fr = await FranchiseRequest.findByPk(id);
  if (!fr) throw err(404, "FranchiseRequest not found");

  if (fr.contractStatus !== "sent") {
    throw err(400, `Cannot mark viewed from status ${fr.contractStatus}`);
  }

  await fr.update({ contractStatus: "viewed" });
  return { ok: true, message: "Mock marked VIEWED", data: fr };
}

/**
 * 4) MOCK MARK SIGNED
 * sent/viewed -> signed (+ signedAt)
 */
async function mockMarkSigned(req) {
  const provider = getSignProvider();
  if (provider !== "mock") throw err(400, "Mock endpoints only allowed when SIGN_PROVIDER=mock");

  const id = mustIntId(req.params.id);
  const fr = await FranchiseRequest.findByPk(id);
  if (!fr) throw err(404, "FranchiseRequest not found");

  const allow = ["sent", "viewed"];
  if (!allow.includes(fr.contractStatus)) {
    throw err(400, `Cannot mark signed from status ${fr.contractStatus}`);
  }

  await fr.update({
    contractStatus: "signed",
    contractSigned: true,
    contractSignedAt: now(),
  });

  return { ok: true, message: "Mock marked SIGNED", data: fr };
}

/**
 * 5) MOCK COMPLETE + CREATE GYM
 * signed -> completed + create gym (1 lần)
 */
async function mockMarkCompleted(req) {
  const provider = getSignProvider();
  if (provider !== "mock") throw err(400, "Mock endpoints only allowed when SIGN_PROVIDER=mock");

  const id = mustIntId(req.params.id);

  return await sequelize.transaction(async (t) => {
    const fr = await FranchiseRequest.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!fr) throw err(404, "FranchiseRequest not found");

    if (fr.contractStatus !== "signed") {
      throw err(400, `Only SIGNED contract can be completed (current: ${fr.contractStatus})`);
    }

    // Nếu đã tạo gym rồi -> chỉ mark completed (idempotent)
    if (fr.gymId) {
      await fr.update(
        { contractStatus: "completed", contractCompletedAt: fr.contractCompletedAt || now() },
        { transaction: t }
      );
      return { ok: true, message: "Already has gym. Marked completed.", data: fr };
    }

    // ✅ Tạo gym từ request
    // NOTE: Gym schema của bạn có thể khác -> bạn sửa mapping nếu cần
    const gym = await Gym.create(
      {
        name: fr.businessName,
        address: fr.location,
        ownerId: fr.requesterId,
      },
      { transaction: t }
    );

    await fr.update(
      {
        contractStatus: "completed",
        contractCompletedAt: now(),
        gymId: gym.id,
        gymCreatedAt: now(),
      },
      { transaction: t }
    );

    return { ok: true, message: "Mock COMPLETED + Gym created", data: { franchiseRequest: fr, gym } };
  });
}

module.exports = {
  sendContract,
  getContractStatus,
  mockMarkViewed,
  mockMarkSigned,
  mockMarkCompleted,
};
