import db from "../../models";
import payosService from "../payment/payos.service";
import realtimeService from "../realtime.service";

const CARD_PLANS = [
  { code: "MC_1M", months: 1, price: 300000, label: "Thẻ 1 tháng" },
  { code: "MC_2M", months: 2, price: 550000, label: "Thẻ 2 tháng" },
  { code: "MC_3M", months: 3, price: 780000, label: "Thẻ 3 tháng" },
];

const getPlanByMonths = (months) => CARD_PLANS.find((p) => Number(p.months) === Number(months)) || null;

const addMonths = (dateInput, months) => {
  const d = new Date(dateInput);
  const out = new Date(d.getTime());
  out.setMonth(out.getMonth() + Number(months || 0));
  return out;
};

const isMissingMembershipCardTableError = (error) =>
  String(error?.original?.code || error?.parent?.code || error?.code || "") === "ER_NO_SUCH_TABLE" &&
  String(error?.original?.sqlMessage || error?.parent?.sqlMessage || error?.message || "")
    .toLowerCase()
    .includes("membershipcard");

const getActiveMembershipCard = async (memberId, transaction = null) => {
  let row = null;
  try {
    row = await db.MembershipCard.findOne({
      where: { memberId, status: "active" },
      order: [["endDate", "DESC"], ["id", "DESC"]],
      ...(transaction ? { transaction } : {}),
    });
  } catch (e) {
    if (isMissingMembershipCardTableError(e)) return null;
    throw e;
  }
  if (!row) return null;
  if (new Date(row.endDate).getTime() < Date.now()) {
    await row.update({ status: "expired" }, transaction ? { transaction } : undefined);
    return null;
  }
  return row;
};

const getMembershipCardSummary = async (memberId) => {
  const active = await getActiveMembershipCard(memberId);
  if (!active) return null;
  return {
    id: active.id,
    planCode: active.planCode,
    planMonths: active.planMonths,
    price: Number(active.price || 0),
    startDate: active.startDate,
    endDate: active.endDate,
    status: active.status,
    purchaseSource: active.purchaseSource,
  };
};

const hasActiveMembershipCard = async (memberId, transaction = null) => {
  const card = await getActiveMembershipCard(memberId, transaction);
  return !!card;
};

const createOrExtendMembershipCard = async ({
  memberId,
  gymId,
  plan,
  transactionId = null,
  purchaseSource = "standalone",
  transaction,
}) => {
  // Idempotent guard: nếu giao dịch này đã được áp vào thẻ trước đó
  // (thường do webhook + confirm cùng chạy), trả luôn thẻ hiện có.
  if (transactionId) {
    const existedByTransaction = await db.MembershipCard.findOne({
      where: { memberId, gymId, transactionId },
      order: [["id", "DESC"]],
      ...(transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {}),
    });
    if (existedByTransaction) return existedByTransaction;
  }

  const active = await getActiveMembershipCard(memberId, transaction);
  const now = new Date();
  const start = active ? new Date(active.endDate) : now;
  const end = addMonths(start, plan.months);

  if (active) {
    await active.update(
      {
        endDate: end,
        planCode: plan.code,
        planMonths: plan.months,
        price: Number(active.price || 0) + Number(plan.price || 0),
        transactionId: transactionId || active.transactionId || null,
        purchaseSource,
      },
      { transaction }
    );
    return active;
  }

  return db.MembershipCard.create(
    {
      memberId,
      gymId,
      transactionId,
      planCode: plan.code,
      planMonths: plan.months,
      price: plan.price,
      startDate: now,
      endDate: end,
      status: "active",
      purchaseSource,
    },
    { transaction }
  );
};

const genCode = (prefix = "TX") => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const listPlans = async ({ gymId }) => {
  const gid = Number(gymId || 0);
  if (!gid) return [];
  try {
    const rows = await db.MembershipCardPlan.findAll({
      where: { gymId: gid, isActive: true },
      attributes: ["id", "name", "months", "price", "imageUrl", "description"],
      order: [["months", "ASC"], ["price", "ASC"], ["id", "ASC"]],
    });
    return rows.map((r) => ({
      id: r.id,
      code: `PLAN_${r.id}`,
      label: r.name,
      months: Number(r.months || 0),
      price: Number(r.price || 0),
      imageUrl: r.imageUrl || "",
      description: r.description || "",
    }));
  } catch (e) {
    if (isMissingMembershipCardTableError(e)) return [];
    throw e;
  }
};

const getPlanById = async (planId, gymId = null) => {
  const where = { id: Number(planId || 0), isActive: true };
  if (gymId) where.gymId = Number(gymId);
  let row = null;
  try {
    row = await db.MembershipCardPlan.findOne({
      where,
      attributes: ["id", "name", "months", "price", "gymId"],
    });
  } catch (e) {
    const isMissingPlanTable =
      String(e?.original?.code || e?.parent?.code || e?.code || "") === "ER_NO_SUCH_TABLE" &&
      String(e?.original?.sqlMessage || e?.parent?.sqlMessage || e?.message || "")
        .toLowerCase()
        .includes("membershipcardplan");
    if (isMissingPlanTable) return null;
    throw e;
  }
  if (!row) return null;
  return {
    id: row.id,
    code: `PLAN_${row.id}`,
    label: row.name,
    months: Number(row.months || 0),
    price: Number(row.price || 0),
    gymId: Number(row.gymId || 0),
  };
};

const purchaseMembershipCard = async (userId, payload = {}) => {
  const gymId = Number(payload.gymId || 0);
  const planId = Number(payload.planId || 0);
  const paymentMethod = String(payload.paymentMethod || "payos").toLowerCase();
  const plan = await getPlanById(planId, gymId);
  if (!gymId || !plan) {
    const err = new Error("Gói thẻ thành viên không hợp lệ");
    err.statusCode = 400;
    throw err;
  }

  const t = await db.sequelize.transaction();
  try {
    let member = await db.Member.findOne({ where: { userId, gymId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!member) {
      member = await db.Member.create(
        { userId, gymId, membershipNumber: `MEM${Date.now()}${Math.floor(Math.random() * 1000)}`, status: "active", joinDate: new Date() },
        { transaction: t }
      );
    }

    const tx = await db.Transaction.create(
      {
        transactionCode: genCode("MC"),
        memberId: member.id,
        gymId,
        amount: plan.price,
        transactionType: "membership_card_purchase",
        paymentMethod,
        paymentStatus: paymentMethod === "payos" ? "pending" : "completed",
        description: `Mua ${plan.label}`,
        processedBy: userId,
        ...(paymentMethod === "payos" ? {} : { transactionDate: new Date() }),
        metadata: {
          membershipCard: {
            planId: plan.id,
            planCode: plan.code,
            planMonths: plan.months,
            planPrice: plan.price,
          },
        },
      },
      { transaction: t }
    );

    if (paymentMethod === "payos") {
      const frontendBase = process.env.FRONTEND_URL || "http://localhost:3000";
      const payosResp = await payosService.createPackagePaymentLink({
        orderCode: tx.id,
        amount: plan.price,
        description: `Thanh toán ${plan.label}`,
        returnUrl: `${frontendBase}/member/payment-success?payos=success&orderCode=${encodeURIComponent(tx.id)}`,
        cancelUrl: `${frontendBase}/member/payment-success?payos=cancel&orderCode=${encodeURIComponent(tx.id)}`,
      });
      await tx.update(
        {
          metadata: {
            ...(tx.metadata || {}),
            payos: {
              orderCode: payosResp.orderCode,
              checkoutUrl: payosResp.checkoutUrl,
              paymentLinkId: payosResp.paymentLinkId,
            },
          },
        },
        { transaction: t }
      );
      await t.commit();
      return { transaction: tx, paymentProvider: "payos", paymentUrl: payosResp.checkoutUrl };
    }

    const card = await createOrExtendMembershipCard({
      memberId: member.id,
      gymId,
      plan,
      transactionId: tx.id,
      purchaseSource: "standalone",
      transaction: t,
    });
    await t.commit();
    await realtimeService.notifyUser(userId, {
      title: "Mua thẻ thành viên thành công",
      message: `${plan.label} đã được kích hoạt đến ${new Date(card.endDate).toLocaleDateString("vi-VN")}.`,
      notificationType: "membership_card",
      relatedType: "membershipcard",
      relatedId: card.id,
    });
    await notifyOwnerAboutMembershipCardPurchase({
      gymId,
      memberId: member.id,
      plan,
      card,
      transactionId: tx.id,
    });
    return { transaction: tx, card };
  } catch (e) {
    await t.rollback();
    throw e;
  }
};

const resolvePlanForPackagePurchase = async ({ memberId, gymId, payload = {}, transaction = null }) => {
  const activeCard = memberId ? await getActiveMembershipCard(memberId, transaction) : null;
  if (activeCard) {
    return {
      requireCardPurchase: false,
      activeCard,
      plan: null,
      additionalAmount: 0,
    };
  }

  const plan = await getPlanById(Number(payload.membershipCardPlanId || 0), gymId);
  if (!plan) {
    const err = new Error("Bạn chưa có thẻ thành viên còn hạn, vui lòng chọn thẻ (1/2/3 tháng) khi mua gói PT.");
    err.statusCode = 400;
    throw err;
  }
  return {
    requireCardPurchase: true,
    activeCard: null,
    plan,
    additionalAmount: Number(plan.price || 0),
  };
};

const syncExpiredCardsAndNotify = async () => {
  const now = new Date();
  let due = [];
  try {
    due = await db.MembershipCard.findAll({
      where: { status: "active", endDate: { [db.Sequelize.Op.lt]: now } },
      limit: 200,
    });
  } catch (e) {
    if (isMissingMembershipCardTableError(e)) return 0;
    throw e;
  }
  for (const card of due) {
    await card.update({ status: "expired" });
    const member = await db.Member.findByPk(card.memberId, { attributes: ["userId"] });
    if (member?.userId) {
      await realtimeService.notifyUser(member.userId, {
        title: "Thẻ thành viên đã hết hạn",
        message: "Thẻ thành viên của bạn đã hết hạn. Vui lòng gia hạn để tiếp tục tập luyện.",
        notificationType: "membership_card",
        relatedType: "membershipcard",
        relatedId: card.id,
      });
    }
  }
  return due.length;
};

const notifyOwnerAboutMembershipCardPurchase = async ({
  gymId,
  memberId,
  plan,
  card,
  transactionId = null,
}) => {
  const gym = await db.Gym.findByPk(gymId, { attributes: ["id", "ownerId", "name"] });
  if (!gym?.ownerId) return null;

  const member = await db.Member.findByPk(memberId, {
    attributes: ["id", "userId"],
    include: [{ model: db.User, attributes: ["id", "username", "email"] }],
  });
  const memberName =
    member?.User?.username ||
    (member?.User?.email ? String(member.User.email).split("@")[0] : "") ||
    `Member #${memberId}`;

  return realtimeService.notifyUser(gym.ownerId, {
    title: "Có hội viên mua thẻ thành viên",
    message: `${memberName} vừa mua ${plan?.label || "thẻ thành viên"} tại ${gym.name || "gym"} (hạn đến ${new Date(
      card?.endDate || Date.now()
    ).toLocaleDateString("vi-VN")}).`,
    notificationType: "membership_card_purchase",
    relatedType: "transaction",
    relatedId: transactionId || card?.id || null,
  });
};

export default {
  CARD_PLANS,
  listPlans,
  getPlanByMonths,
  getPlanById,
  getMembershipCardSummary,
  hasActiveMembershipCard,
  resolvePlanForPackagePurchase,
  createOrExtendMembershipCard,
  purchaseMembershipCard,
  syncExpiredCardsAndNotify,
  notifyOwnerAboutMembershipCardPurchase,
};
