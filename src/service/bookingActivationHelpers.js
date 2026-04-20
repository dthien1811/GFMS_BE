import db from "../models/index";

export const applyPackageActivationCompletion = async (booking, { transaction } = {}) => {
  if (!booking?.packageActivationId) return null;

  const activation = await db.PackageActivation.findByPk(booking.packageActivationId, {
    include: [{ model: db.Package, attributes: ["id", "name"] }],
    transaction,
  });
  if (!activation || activation.sessionsRemaining <= 0) return activation;

  await activation.update(
    {
      sessionsUsed: (activation.sessionsUsed || 0) + 1,
      sessionsRemaining: Math.max(0, activation.sessionsRemaining - 1),
      status: activation.sessionsRemaining - 1 <= 0 ? "completed" : activation.status,
    },
    { transaction }
  );

  return activation;
};

export const removePendingCommissionForBooking = async (bookingId, transaction = null) => {
  const Commission = db.Commission || db.commission;
  if (!Commission || !bookingId) return;
  await Commission.destroy({
    where: {
      bookingId,
      status: "pending",
    },
    transaction,
  });
};
