/**
 * One-off: xóa gym theo id — xóa model Sequelize liên quan trước khi xóa gym.
 * Usage: npx babel-node scripts/deleteGymById.js 133
 */
require("dotenv").config();
const db = require("../src/models");

const GYM_ID = Number(process.argv[2]);
if (!GYM_ID) {
  console.error("Usage: npx babel-node scripts/deleteGymById.js <gymId>");
  process.exit(1);
}

async function destroyIf(model, where, transaction) {
  if (!model || typeof model.destroy !== "function") return 0;
  return model.destroy({ where, transaction });
}

async function main() {
  const gym = await db.Gym.findByPk(GYM_ID);
  if (!gym) {
    console.log(`Gym id=${GYM_ID} không tồn tại.`);
    await db.sequelize.close();
    process.exit(0);
  }
  console.log(`Xóa gym id=${GYM_ID} name="${gym.name}"`);

  const t = await db.sequelize.transaction();
  try {
    let n;
    n = await destroyIf(db.EquipmentStock, { gymId: GYM_ID }, t);
    console.log("equipmentstock:", n);
    n = await destroyIf(db.EquipmentUnit, { gymId: GYM_ID }, t);
    console.log("equipmentunit:", n);
    n = await destroyIf(db.Inventory, { gymId: GYM_ID }, t);
    console.log("inventory:", n);
    n = await destroyIf(db.Maintenance, { gymId: GYM_ID }, t);
    console.log("maintenance:", n);
    n = await destroyIf(db.Booking, { gymId: GYM_ID }, t);
    console.log("booking:", n);
    n = await destroyIf(db.Member, { gymId: GYM_ID }, t);
    console.log("member:", n);
    n = await destroyIf(db.Trainer, { gymId: GYM_ID }, t);
    console.log("trainer:", n);
    n = await destroyIf(db.Package, { gymId: GYM_ID }, t);
    console.log("package:", n);
    n = await destroyIf(db.PurchaseRequest, { gymId: GYM_ID }, t);
    console.log("purchaserequest:", n);
    n = await destroyIf(db.Quotation, { gymId: GYM_ID }, t);
    console.log("quotation:", n);
    n = await destroyIf(db.PurchaseOrder, { gymId: GYM_ID }, t);
    console.log("purchaseorder:", n);
    n = await destroyIf(db.Receipt, { gymId: GYM_ID }, t);
    console.log("receipt:", n);
    n = await destroyIf(db.Policy, { gymId: GYM_ID }, t);
    console.log("policy:", n);
    n = await destroyIf(db.Commission, { gymId: GYM_ID }, t);
    console.log("commission:", n);
    n = await destroyIf(db.Transaction, { gymId: GYM_ID }, t);
    console.log("transaction:", n);
    n = await destroyIf(db.Attendance, { gymId: GYM_ID }, t);
    console.log("attendance:", n);
    n = await destroyIf(db.Review, { gymId: GYM_ID, reviewType: "gym" }, t);
    console.log("review (gym):", n);
    n = await destroyIf(db.FranchiseRequest, { gymId: GYM_ID }, t);
    console.log("franchiserequest:", n);

    if (db.EquipmentTransfer) {
      n = await db.EquipmentTransfer.destroy({
        where: { [db.Sequelize.Op.or]: [{ fromGymId: GYM_ID }, { toGymId: GYM_ID }] },
        transaction: t,
      });
      console.log("equipmenttransfer:", n);
    }
    if (db.TrainerShare) {
      n = await db.TrainerShare.destroy({
        where: { [db.Sequelize.Op.or]: [{ fromGymId: GYM_ID }, { toGymId: GYM_ID }] },
        transaction: t,
      });
      console.log("trainershare:", n);
    }

    await db.Gym.destroy({ where: { id: GYM_ID }, transaction: t });
    await t.commit();
    console.log("Hoàn tất: đã xóa gym", GYM_ID);
  } catch (e) {
    await t.rollback();
    console.error("Lỗi:", e?.message || e);
    if (e?.original?.sqlMessage) console.error("MySQL:", e.original.sqlMessage);
    process.exitCode = 1;
  } finally {
    await db.sequelize.close();
  }
}

main();
