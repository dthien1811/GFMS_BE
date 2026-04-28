// src/service/member/package.service.js
import db from "../../models";
import payosService from "../payment/payos.service";
import realtimeService from "../realtime.service";
import membershipCardService from "./membershipCard.service";

function genCode(prefix = "TX") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

const ALLOWED_PAYMENT = new Set(["cash", "momo", "vnpay", "payos"]);

function genMembershipNumber() {
  return `MEM${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

async function getMembersByUserId(userId) {
  return db.Member.findAll({ where: { userId } });
}

async function getMemberByUserIdAndGymId(userId, gymId) {
  return db.Member.findOne({ where: { userId, gymId } });
}

async function ensureMemberForGym({ userId, gymId, transaction }) {
  let member = await getMemberByUserIdAndGymId(userId, gymId);
  if (!member) {
    member = await db.Member.create(
      {
        userId,
        gymId,
        membershipNumber: genMembershipNumber(),
        status: "active",
        joinDate: new Date(),
      },
      { transaction }
    );
  } else if (!member.membershipNumber) {
    await member.update(
      { membershipNumber: genMembershipNumber() },
      { transaction }
    );
  }
  return member;
}

function parseGymIdMaybe(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const memberPackageService = {
  // ================= LIST PACKAGES =================
  async listPackages(userId, { gymId } = {}) {
    const wantedGymId = parseGymIdMaybe(gymId);

    if (!wantedGymId) {
      const members = await getMembersByUserId(userId);

      if (members.length === 0) {
        // marketplace: chưa “thuộc” gym nào, bắt buộc FE truyền gymId
        const err = new Error("Bạn chưa chọn gym. Vui lòng truyền gymId để xem gói tập.");
        err.statusCode = 400;
        throw err;
      }

      if (members.length === 1) {
        return db.Package.findAll({
          where: { gymId: members[0].gymId, isActive: true },
          order: [["createdAt", "DESC"]],
        });
      }

      const err = new Error("Bạn đang có nhiều gym. Vui lòng truyền gymId để xem gói tập.");
      err.statusCode = 400;
      throw err;
    }

    // Validate gym tồn tại + active (optional nhưng nên có)
    const gym = await db.Gym.findByPk(wantedGymId, { attributes: ["id", "status"] });
    if (!gym || String(gym.status).toLowerCase() !== "active") {
      const err = new Error("Gym không tồn tại hoặc không hoạt động.");
      err.statusCode = 404;
      throw err;
    }

    return db.Package.findAll({
      where: { gymId: wantedGymId, isActive: true },
      order: [["createdAt", "DESC"]],
    });
  },

  // ================= PURCHASE PACKAGE =================
  async purchasePackage(userId, packageId, payload) {
    const t = await db.sequelize.transaction();
    try {
      // 1) LOAD PACKAGE
      const pkg = await db.Package.findByPk(packageId, { transaction: t });
      if (!pkg || !pkg.isActive) {
        const err = new Error("Gói không tồn tại hoặc chưa được công bố.");
        err.statusCode = 404;
        throw err;
      }

      // 2) ENSURE MEMBER FOR THIS GYM (✅ multi gym)
      const member = await ensureMemberForGym({
        userId,
        gymId: pkg.gymId,
        transaction: t,
      });

      const membershipDecision = await membershipCardService.resolvePlanForPackagePurchase({
        memberId: member.id,
        gymId: pkg.gymId,
        payload,
        transaction: t,
      });
      const membershipPlan = membershipDecision.plan;
      const packageAmount = Number(pkg.price || 0);
      const membershipAmount = Number(membershipDecision.additionalAmount || 0);
      const totalAmount = packageAmount + membershipAmount;

      // 3) VALIDATE PAYMENT METHOD
      const paymentMethod = String(payload?.paymentMethod || "cash").toLowerCase();
      if (!ALLOWED_PAYMENT.has(paymentMethod)) {
        const err = new Error("paymentMethod không hợp lệ. Hỗ trợ: cash / momo / vnpay / payos.");
        err.statusCode = 400;
        throw err;
      }

      let trainerId = Number(payload?.trainerId || pkg.trainerId || 0) || null;
      if (trainerId) {
        const trainer = await db.Trainer.findOne({ where: { id: trainerId, gymId: pkg.gymId, status: "active" }, transaction: t });
        if (!trainer) {
          const err = new Error("PT được chọn không hợp lệ hoặc không thuộc gym của gói.");
          err.statusCode = 400;
          throw err;
        }
      }

      // 4) PAYOS FLOW
      if (paymentMethod === "payos") {
        const tx = await db.Transaction.create(
          {
            transactionCode: genCode("PKG"),
            memberId: member.id,
            trainerId,
            gymId: pkg.gymId,
            packageId: pkg.id,
            amount: packageAmount,
            transactionType: "package_purchase",
            paymentMethod,
            paymentStatus: "pending",
            description: membershipDecision.requireCardPurchase
              ? `Thanh toán gói + thẻ thành viên (PayOS): ${pkg.name}`
              : `Thanh toán gói (đã có thẻ thành viên còn hạn): ${pkg.name}`,
            processedBy: userId,
            metadata: membershipDecision.requireCardPurchase
              ? {
                  membershipCard: {
                    planId: membershipPlan.id,
                    planCode: membershipPlan.code,
                    planMonths: membershipPlan.months,
                    planPrice: membershipPlan.price,
                  },
                }
              : {},
          },
          { transaction: t }
        );

        let membershipTx = null;
        if (membershipDecision.requireCardPurchase) {
          membershipTx = await db.Transaction.create(
            {
              transactionCode: genCode("MCB"),
              memberId: member.id,
              gymId: pkg.gymId,
              amount: membershipAmount,
              transactionType: "membership_card_purchase",
              paymentMethod,
              paymentStatus: "pending",
              description: `Mua thẻ thành viên kèm gói ${pkg.name}`,
              processedBy: userId,
              metadata: {
                membershipCard: {
                  planId: membershipPlan.id,
                  planCode: membershipPlan.code,
                  planMonths: membershipPlan.months,
                  planPrice: membershipPlan.price,
                },
                bundle: {
                  source: "package_bundle",
                  packageTransactionId: tx.id,
                },
              },
            },
            { transaction: t }
          );
        }

        const payosResp = await payosService.createPackagePaymentLink({
          orderCode: tx.id,
          amount: totalAmount,
          description: membershipDecision.requireCardPurchase
            ? `Thanh toán gói ${pkg.name} + thẻ thành viên`
            : `Thanh toán gói ${pkg.name} (đã có thẻ thành viên còn hạn)`,
        });

        await tx.update(
          {
            metadata: {
              ...(tx.metadata || {}),
              bundle: membershipTx
                ? {
                    membershipTransactionId: membershipTx.id,
                    packageAmount,
                    membershipAmount,
                    totalAmount,
                  }
                : undefined,
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
        await realtimeService.notifyUser(userId, {
          title: "Đã tạo thanh toán gói tập",
          message: `Đơn thanh toán cho gói ${pkg.name} đã được tạo.`,
          notificationType: "package_purchase",
          relatedType: "transaction",
          relatedId: tx.id,
        });
        return {
          transaction: tx,
          paymentProvider: "payos",
          paymentUrl: payosResp.checkoutUrl,
        };
      }

      // 5) OTHER PAYMENT (PAID NGAY)
      const tx = await db.Transaction.create(
        {
          transactionCode: genCode("PKG"),
          memberId: member.id,
          trainerId,
          gymId: pkg.gymId,
          packageId: pkg.id,
          amount: packageAmount,
          transactionType: "package_purchase",
          paymentMethod,
          paymentStatus: "completed",
          description: membershipDecision.requireCardPurchase
            ? `Mua gói + thẻ thành viên: ${pkg.name}`
            : `Mua gói (đã có thẻ thành viên còn hạn): ${pkg.name}`,
          transactionDate: new Date(),
          processedBy: userId,
          metadata: membershipDecision.requireCardPurchase
            ? {
                membershipCard: {
                  planId: membershipPlan.id,
                  planCode: membershipPlan.code,
                  planMonths: membershipPlan.months,
                  planPrice: membershipPlan.price,
                },
              }
            : {},
        },
        { transaction: t }
      );

      let expiryDate = null;
      if (pkg.durationDays && pkg.durationDays > 0) {
        expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + pkg.durationDays);
      }

      const activation = await db.PackageActivation.create(
        {
          memberId: member.id,
          packageId: pkg.id,
          transactionId: tx.id,
          activationDate: new Date(),
          expiryDate,
          totalSessions: pkg.sessions,
          sessionsUsed: 0,
          sessionsRemaining: pkg.sessions,
          pricePerSession: pkg.sessions ? pkg.price / pkg.sessions : null,
          status: "active",
        },
        { transaction: t }
      );

      await tx.update({ packageActivationId: activation.id }, { transaction: t });
      if (membershipDecision.requireCardPurchase) {
        const membershipTx = await db.Transaction.create(
          {
            transactionCode: genCode("MCB"),
            memberId: member.id,
            gymId: pkg.gymId,
            amount: membershipAmount,
            transactionType: "membership_card_purchase",
            paymentMethod,
            paymentStatus: "completed",
            description: `Mua thẻ thành viên kèm gói ${pkg.name}`,
            transactionDate: new Date(),
            processedBy: userId,
            metadata: {
              membershipCard: {
                planId: membershipPlan.id,
                planCode: membershipPlan.code,
                planMonths: membershipPlan.months,
                planPrice: membershipPlan.price,
              },
              bundle: {
                source: "package_bundle",
                packageTransactionId: tx.id,
              },
            },
          },
          { transaction: t }
        );
        await membershipCardService.createOrExtendMembershipCard({
          memberId: member.id,
          gymId: pkg.gymId,
          plan: membershipPlan,
          transactionId: membershipTx.id,
          purchaseSource: "package_bundle",
          transaction: t,
        });
        await tx.update(
          {
            metadata: {
              ...(tx.metadata || {}),
              bundle: {
                membershipTransactionId: membershipTx.id,
                packageAmount,
                membershipAmount,
                totalAmount,
              },
            },
          },
          { transaction: t }
        );
      }

      await t.commit();

      await realtimeService.notifyUser(userId, {
        title: "Mua gói thành công",
        message: `Bạn đã kích hoạt gói ${pkg.name} thành công.`,
        notificationType: "package_purchase",
        relatedType: "packageActivation",
        relatedId: activation.id,
      });
      if (trainerId) {
        const trainer = await db.Trainer.findByPk(trainerId, { attributes: ["userId"] });
        await realtimeService.notifyUser(trainer?.userId, {
          title: "Bạn có hội viên mới",
          message: `Một hội viên mới đã mua gói ${pkg.name} của bạn.`,
          notificationType: "package_purchase",
          relatedType: "packageActivation",
          relatedId: activation.id,
        });
      }
      const gym = await db.Gym.findByPk(pkg.gymId, { attributes: ["ownerId"] });
      await realtimeService.notifyUser(gym?.ownerId, {
        title: "Gym có giao dịch gói mới",
        message: `${member?.User?.username || "Một hội viên"} vừa mua gói ${pkg.name}. Mã giao dịch: ${tx.transactionCode || `TX-${tx.id}`}.`,
        notificationType: "package_purchase",
        relatedType: "transaction",
        relatedId: tx.id,
      });
      if (membershipDecision.requireCardPurchase) {
        const membershipTx = await db.Transaction.findOne({
          where: {
            memberId: member.id,
            gymId: pkg.gymId,
            transactionType: "membership_card_purchase",
            paymentMethod,
          },
          order: [["id", "DESC"]],
        });
        if (membershipTx) {
          const summary = await membershipCardService.getMembershipCardSummary(member.id);
          await membershipCardService.notifyOwnerAboutMembershipCardPurchase({
            gymId: pkg.gymId,
            memberId: member.id,
            plan: membershipPlan,
            card: summary || { id: null, endDate: new Date() },
            transactionId: membershipTx.id,
          });
        }
      }
      return { transaction: tx, activation };
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};

export default memberPackageService;
