require("dotenv").config();
const db = require("../src/models");

const KEEP_CODE = process.argv[2];

if (!KEEP_CODE) {
  console.error("Usage: node scripts/keepOnePurchaseRequestHistory.js <purchaseRequestCode>");
  process.exit(1);
}

async function main() {
  const keep = await db.PurchaseRequest.findOne({
    where: { code: KEEP_CODE },
    attributes: ["id", "code"],
  });

  if (!keep) {
    console.error(`Không tìm thấy purchase request code=${KEEP_CODE}`);
    await db.sequelize.close();
    process.exit(1);
  }

  const t = await db.sequelize.transaction();
  try {
    const toDelete = await db.PurchaseRequest.findAll({
      where: {
        id: { [db.Sequelize.Op.ne]: keep.id },
      },
      attributes: ["id", "code"],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    const deleteIds = toDelete.map((x) => Number(x.id)).filter(Boolean);
    if (!deleteIds.length) {
      await t.commit();
      console.log(`Không có dữ liệu nào cần xóa. Đang giữ code=${KEEP_CODE}`);
      await db.sequelize.close();
      return;
    }

    const deletedTransactions = await db.Transaction.destroy({
      where: { purchaseRequestId: deleteIds },
      transaction: t,
    });

    const deletedQuotations = await db.Quotation.destroy({
      where: { purchaseRequestId: deleteIds },
      transaction: t,
    });

    const deletedRequests = await db.PurchaseRequest.destroy({
      where: { id: deleteIds },
      transaction: t,
    });

    await t.commit();

    console.log(`Giữ lại: ${KEEP_CODE} (id=${keep.id})`);
    console.log(`Đã xóa ${deletedRequests} purchase request(s).`);
    console.log(`Đã xóa ${deletedTransactions} transaction(s) liên quan.`);
    console.log(`Đã xóa ${deletedQuotations} quotation(s) liên quan.`);
  } catch (error) {
    await t.rollback();
    console.error("Xóa dữ liệu thất bại:", error?.message || error);
    if (error?.original?.sqlMessage) {
      console.error("MySQL:", error.original.sqlMessage);
    }
    process.exitCode = 1;
  } finally {
    await db.sequelize.close();
  }
}

main();
