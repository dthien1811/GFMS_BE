require("dotenv").config();
const db = require("../src/models");
const { Op } = require("sequelize");

const argGymIds = (process.argv[2] || "")
  .split(",")
  .map((x) => Number(String(x).trim()))
  .filter(Boolean);
const gymIds = argGymIds.length ? argGymIds : [166, 165, 164, 163, 162, 161];
const APPLY = process.argv.includes("--apply");

const asIds = (rows, key = "id") =>
  [...new Set((rows || []).map((x) => Number(x?.[key] || 0)).filter(Boolean))];

async function destroyIfModel(modelName, where, transaction) {
  const model = db[modelName];
  if (!model) return 0;
  return model.destroy({ where, transaction });
}

async function main() {
  console.log("=== Cleanup gyms + unsigned franchise requests ===");
  console.log(`Gyms target: ${gymIds.join(", ")}`);
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);

  const gyms = await db.Gym.findAll({
    where: { id: { [Op.in]: gymIds } },
    attributes: ["id", "name", "ownerId", "franchiseRequestId"],
  });
  const foundGymIds = asIds(gyms);
  console.log(`Found gyms: ${foundGymIds.length}`);
  gyms.forEach((g) => console.log(`- #${g.id}: ${g.name}`));

  const members = db.Member
    ? await db.Member.findAll({ where: { gymId: { [Op.in]: foundGymIds } }, attributes: ["id"] })
    : [];
  const trainers = db.Trainer
    ? await db.Trainer.findAll({ where: { gymId: { [Op.in]: foundGymIds } }, attributes: ["id"] })
    : [];
  const packages = db.Package
    ? await db.Package.findAll({ where: { gymId: { [Op.in]: foundGymIds } }, attributes: ["id"] })
    : [];
  const bookings = db.Booking
    ? await db.Booking.findAll({ where: { gymId: { [Op.in]: foundGymIds } }, attributes: ["id"] })
    : [];
  const purchaseRequests = db.PurchaseRequest
    ? await db.PurchaseRequest.findAll({ where: { gymId: { [Op.in]: foundGymIds } }, attributes: ["id"] })
    : [];
  const purchaseOrders = db.PurchaseOrder
    ? await db.PurchaseOrder.findAll({ where: { gymId: { [Op.in]: foundGymIds } }, attributes: ["id"] })
    : [];
  const quotations = db.Quotation
    ? await db.Quotation.findAll({ where: { purchaseRequestId: { [Op.in]: asIds(purchaseRequests) } }, attributes: ["id"] })
    : [];

  const memberIds = asIds(members);
  const trainerIds = asIds(trainers);
  const packageIds = asIds(packages);
  const bookingIds = asIds(bookings);
  const purchaseRequestIds = asIds(purchaseRequests);
  const purchaseOrderIds = asIds(purchaseOrders);
  const quotationIds = asIds(quotations);

  const activations = db.PackageActivation
    ? await db.PackageActivation.findAll({
        where: {
          [Op.or]: [
            memberIds.length ? { memberId: { [Op.in]: memberIds } } : null,
            packageIds.length ? { packageId: { [Op.in]: packageIds } } : null,
          ].filter(Boolean),
        },
        attributes: ["id", "transactionId"],
      })
    : [];
  const activationIds = asIds(activations);
  const activationTxIds = asIds(activations, "transactionId");

  const unsignedFranchiseRequests = db.FranchiseRequest
    ? await db.FranchiseRequest.findAll({
        where: {
          [Op.or]: [
            { contractSigned: { [Op.ne]: 1 } },
            { contractSigned: null },
            { contractSignedAt: null },
          ],
        },
        attributes: ["id", "businessName", "contractSigned", "contractSignedAt"],
      })
    : [];
  const unsignedFranchiseRequestIds = asIds(unsignedFranchiseRequests);

  console.log(`Members: ${memberIds.length}`);
  console.log(`Trainers: ${trainerIds.length}`);
  console.log(`Packages: ${packageIds.length}`);
  console.log(`Bookings: ${bookingIds.length}`);
  console.log(`PackageActivations: ${activationIds.length}`);
  console.log(`PurchaseRequests: ${purchaseRequestIds.length}`);
  console.log(`PurchaseOrders: ${purchaseOrderIds.length}`);
  console.log(`Unsigned FranchiseRequests: ${unsignedFranchiseRequestIds.length}`);

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to execute delete.");
    await db.sequelize.close();
    return;
  }

  const t = await db.sequelize.transaction();
  try {
    // 1) delete deep children by booking/purchase relationships
    if (bookingIds.length) {
      await destroyIfModel("Attendance", { bookingId: { [Op.in]: bookingIds } }, t);
      await destroyIfModel("Commission", { bookingId: { [Op.in]: bookingIds } }, t);
      await destroyIfModel("BookingRescheduleRequest", { bookingId: { [Op.in]: bookingIds } }, t);
    }

    if (purchaseOrderIds.length) {
      await destroyIfModel("PurchaseOrderItem", { purchaseOrderId: { [Op.in]: purchaseOrderIds } }, t);
    }
    if (quotationIds.length) {
      await destroyIfModel("QuotationItem", { quotationId: { [Op.in]: quotationIds } }, t);
    }
    if (purchaseRequestIds.length) {
      await destroyIfModel("Quotation", { purchaseRequestId: { [Op.in]: purchaseRequestIds } }, t);
    }

    // 2) delete by gymId from all models except preserved core models
    const skippedModels = new Set(["Gym"]);
    for (const [modelName, model] of Object.entries(db)) {
      if (!model?.rawAttributes || skippedModels.has(modelName)) continue;
      if (!Object.prototype.hasOwnProperty.call(model.rawAttributes, "gymId")) continue;
      await model.destroy({
        where: { gymId: { [Op.in]: foundGymIds } },
        transaction: t,
      });
    }

    // 3) delete entities that reference gym-linked entities but may not have gymId
    if (bookingIds.length) {
      await destroyIfModel("Booking", { id: { [Op.in]: bookingIds } }, t);
    }
    if (activationIds.length) {
      await destroyIfModel("PackageActivation", { id: { [Op.in]: activationIds } }, t);
    }
    await destroyIfModel(
      "Transaction",
      {
        [Op.or]: [
          { gymId: { [Op.in]: foundGymIds } },
          activationTxIds.length ? { id: { [Op.in]: activationTxIds } } : null,
          memberIds.length ? { memberId: { [Op.in]: memberIds } } : null,
          packageIds.length ? { packageId: { [Op.in]: packageIds } } : null,
        ].filter(Boolean),
      },
      t
    );

    if (packageIds.length) await destroyIfModel("Package", { id: { [Op.in]: packageIds } }, t);
    if (trainerIds.length) await destroyIfModel("Trainer", { id: { [Op.in]: trainerIds } }, t);
    if (memberIds.length) await destroyIfModel("Member", { id: { [Op.in]: memberIds } }, t);

    // 4) delete franchise contract docs/audits for unsigned requests, then delete unsigned requests
    if (unsignedFranchiseRequestIds.length) {
      await destroyIfModel(
        "FranchiseContractAudit",
        { franchiseRequestId: { [Op.in]: unsignedFranchiseRequestIds } },
        t
      );
      await destroyIfModel(
        "FranchiseContractDocument",
        { franchiseRequestId: { [Op.in]: unsignedFranchiseRequestIds } },
        t
      );
      await destroyIfModel("FranchiseRequest", { id: { [Op.in]: unsignedFranchiseRequestIds } }, t);
    }

    // 5) finally delete gyms
    if (foundGymIds.length) {
      await db.Gym.destroy({
        where: { id: { [Op.in]: foundGymIds } },
        transaction: t,
      });
    }

    await t.commit();
    console.log("Cleanup completed successfully.");
  } catch (error) {
    await t.rollback();
    console.error("Cleanup failed:", error?.message || error);
    if (error?.original?.sqlMessage) {
      console.error("MySQL:", error.original.sqlMessage);
    }
    process.exitCode = 1;
  } finally {
    await db.sequelize.close();
  }
}

main();
