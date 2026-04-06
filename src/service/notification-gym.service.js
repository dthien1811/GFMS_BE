import db from "../models";

const { Op } = db.Sequelize;

const normalize = (value) => String(value || "").trim().toLowerCase();

const toPositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const canonicalizeType = (value) => {
  const normalized = normalize(value);

  if (["booking_update", "booking"].includes(normalized)) return "booking";
  if (["trainer_request", "request"].includes(normalized)) return "request";
  if (["trainer_share", "trainershare"].includes(normalized)) return "trainershare";
  if (["purchase_request", "purchaserequest"].includes(normalized)) return "purchaserequest";
  if (["package_activation", "packageactivation"].includes(normalized)) return "packageactivation";
  if (["transfer", "equipmenttransfer"].includes(normalized)) return "equipmenttransfer";
  if (["withdrawal", "commission"].includes(normalized)) return "withdrawal";
  if (["franchise", "franchiserequest"].includes(normalized)) return "franchiserequest";

  return normalized;
};

const getKey = (type, id) => `${type}:${id}`;

const uniqueGymIds = (values = []) => (
  [...new Set(
    values
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .map(toPositiveInt)
      .filter(Boolean)
  )].sort((left, right) => left - right)
);

const extractRequestGymIds = (data) => uniqueGymIds([
  data?.gymId,
  data?.application?.gymId,
  data?.fromGymId,
  data?.toGymId,
  data?.targetGymId,
]);

const addResolvedGymIds = (resolvedMap, type, id, gymIds) => {
  const notificationId = toPositiveInt(id);
  if (!notificationId) return;

  const key = getKey(type, notificationId);
  const existing = resolvedMap.get(key) || [];
  resolvedMap.set(key, uniqueGymIds([...existing, ...(gymIds || [])]));
};

const fetchRows = (model, ids, attributes) => {
  if (!ids.length) return Promise.resolve([]);
  return model.findAll({
    where: { id: { [Op.in]: ids } },
    attributes,
    raw: true,
  });
};

async function resolveTransactionGymMap(ids = []) {
  const rows = await fetchRows(db.Transaction, ids, ["id", "gymId"]);
  const map = new Map();

  rows.forEach((row) => {
    map.set(toPositiveInt(row.id), uniqueGymIds([row.gymId]));
  });

  return map;
}

async function resolvePackageGymMap(ids = []) {
  const rows = await fetchRows(db.Package, ids, ["id", "gymId"]);
  const map = new Map();

  rows.forEach((row) => {
    map.set(toPositiveInt(row.id), uniqueGymIds([row.gymId]));
  });

  return map;
}

async function resolveNotificationGymIdMap(items = []) {
  const groupedIds = new Map();

  items.forEach((item) => {
    const type = canonicalizeType(item?.relatedType || item?.notificationType);
    const relatedId = toPositiveInt(item?.relatedId);
    if (!type || !relatedId) return;

    if (!groupedIds.has(type)) groupedIds.set(type, new Set());
    groupedIds.get(type).add(relatedId);
  });

  const resolvedMap = new Map();
  const idsFor = (type) => [...(groupedIds.get(type) || [])];

  const bookingIds = idsFor("booking");
  if (bookingIds.length) {
    const rows = await fetchRows(db.Booking, bookingIds, ["id", "gymId"]);
    rows.forEach((row) => addResolvedGymIds(resolvedMap, "booking", row.id, [row.gymId]));
  }

  const reviewIds = idsFor("review");
  if (reviewIds.length) {
    const rows = await fetchRows(db.Review, reviewIds, ["id", "gymId"]);
    rows.forEach((row) => addResolvedGymIds(resolvedMap, "review", row.id, [row.gymId]));
  }

  const maintenanceIds = idsFor("maintenance");
  if (maintenanceIds.length) {
    const rows = await fetchRows(db.Maintenance, maintenanceIds, ["id", "gymId"]);
    rows.forEach((row) => addResolvedGymIds(resolvedMap, "maintenance", row.id, [row.gymId]));
  }

  const requestIds = idsFor("request");
  if (requestIds.length) {
    const rows = await fetchRows(db.Request, requestIds, ["id", "data"]);
    rows.forEach((row) => addResolvedGymIds(resolvedMap, "request", row.id, extractRequestGymIds(row.data)));
  }

  const trainerShareIds = idsFor("trainershare");
  if (trainerShareIds.length) {
    const rows = await fetchRows(db.TrainerShare, trainerShareIds, ["id", "fromGymId", "toGymId"]);
    rows.forEach((row) => addResolvedGymIds(resolvedMap, "trainershare", row.id, [row.fromGymId, row.toGymId]));
  }

  const purchaseRequestIds = idsFor("purchaserequest");
  if (purchaseRequestIds.length) {
    const rows = await fetchRows(db.PurchaseRequest, purchaseRequestIds, ["id", "gymId"]);
    rows.forEach((row) => addResolvedGymIds(resolvedMap, "purchaserequest", row.id, [row.gymId]));
  }

  const quotationIds = idsFor("quotation");
  if (quotationIds.length) {
    const rows = await fetchRows(db.Quotation, quotationIds, ["id", "gymId", "purchaseRequestId"]);
    const missingPurchaseRequestIds = uniqueGymIds(
      rows.filter((row) => !toPositiveInt(row.gymId)).map((row) => row.purchaseRequestId)
    );
    const purchaseRequestMap = new Map();
    if (missingPurchaseRequestIds.length) {
      const purchaseRequestRows = await fetchRows(db.PurchaseRequest, missingPurchaseRequestIds, ["id", "gymId"]);
      purchaseRequestRows.forEach((row) => {
        purchaseRequestMap.set(toPositiveInt(row.id), uniqueGymIds([row.gymId]));
      });
    }
    rows.forEach((row) => {
      addResolvedGymIds(
        resolvedMap,
        "quotation",
        row.id,
        uniqueGymIds([row.gymId, ...(purchaseRequestMap.get(toPositiveInt(row.purchaseRequestId)) || [])])
      );
    });
  }

  const purchaseOrderIds = idsFor("purchaseorder");
  if (purchaseOrderIds.length) {
    const rows = await fetchRows(db.PurchaseOrder, purchaseOrderIds, ["id", "gymId", "quotationId"]);
    const missingQuotationIds = uniqueGymIds(
      rows.filter((row) => !toPositiveInt(row.gymId)).map((row) => row.quotationId)
    );
    const quotationMap = new Map();
    if (missingQuotationIds.length) {
      const quotationRows = await fetchRows(db.Quotation, missingQuotationIds, ["id", "gymId", "purchaseRequestId"]);
      const quotationPurchaseRequestIds = uniqueGymIds(
        quotationRows.filter((row) => !toPositiveInt(row.gymId)).map((row) => row.purchaseRequestId)
      );
      const purchaseRequestMap = new Map();
      if (quotationPurchaseRequestIds.length) {
        const purchaseRequestRows = await fetchRows(db.PurchaseRequest, quotationPurchaseRequestIds, ["id", "gymId"]);
        purchaseRequestRows.forEach((row) => {
          purchaseRequestMap.set(toPositiveInt(row.id), uniqueGymIds([row.gymId]));
        });
      }
      quotationRows.forEach((row) => {
        quotationMap.set(
          toPositiveInt(row.id),
          uniqueGymIds([row.gymId, ...(purchaseRequestMap.get(toPositiveInt(row.purchaseRequestId)) || [])])
        );
      });
    }
    rows.forEach((row) => {
      addResolvedGymIds(
        resolvedMap,
        "purchaseorder",
        row.id,
        uniqueGymIds([row.gymId, ...(quotationMap.get(toPositiveInt(row.quotationId)) || [])])
      );
    });
  }

  const receiptIds = idsFor("receipt");
  if (receiptIds.length) {
    const rows = await fetchRows(db.Receipt, receiptIds, ["id", "gymId", "purchaseOrderId"]);
    const missingPurchaseOrderIds = uniqueGymIds(
      rows.filter((row) => !toPositiveInt(row.gymId)).map((row) => row.purchaseOrderId)
    );
    const purchaseOrderMap = new Map();
    if (missingPurchaseOrderIds.length) {
      const purchaseOrderRows = await fetchRows(db.PurchaseOrder, missingPurchaseOrderIds, ["id", "gymId"]);
      purchaseOrderRows.forEach((row) => {
        purchaseOrderMap.set(toPositiveInt(row.id), uniqueGymIds([row.gymId]));
      });
    }
    rows.forEach((row) => {
      addResolvedGymIds(
        resolvedMap,
        "receipt",
        row.id,
        uniqueGymIds([row.gymId, ...(purchaseOrderMap.get(toPositiveInt(row.purchaseOrderId)) || [])])
      );
    });
  }

  const withdrawalIds = idsFor("withdrawal");
  if (withdrawalIds.length) {
    const rows = await fetchRows(db.Withdrawal, withdrawalIds, ["id", "trainerId"]);
    const trainerIds = uniqueGymIds(rows.map((row) => row.trainerId));
    const trainerMap = new Map();
    if (trainerIds.length) {
      const trainerRows = await fetchRows(db.Trainer, trainerIds, ["id", "gymId"]);
      trainerRows.forEach((row) => {
        trainerMap.set(toPositiveInt(row.id), uniqueGymIds([row.gymId]));
      });
    }
    rows.forEach((row) => {
      addResolvedGymIds(resolvedMap, "withdrawal", row.id, trainerMap.get(toPositiveInt(row.trainerId)) || []);
    });
  }

  const transactionIds = idsFor("transaction");
  if (transactionIds.length) {
    const transactionMap = await resolveTransactionGymMap(transactionIds);
    transactionIds.forEach((id) => {
      addResolvedGymIds(resolvedMap, "transaction", id, transactionMap.get(id) || []);
    });
  }

  const packageActivationIds = idsFor("packageactivation");
  if (packageActivationIds.length) {
    const rows = await fetchRows(db.PackageActivation, packageActivationIds, ["id", "transactionId", "packageId"]);
    const transactionMap = await resolveTransactionGymMap(uniqueGymIds(rows.map((row) => row.transactionId)));
    const packageMap = await resolvePackageGymMap(uniqueGymIds(rows.map((row) => row.packageId)));
    rows.forEach((row) => {
      addResolvedGymIds(
        resolvedMap,
        "packageactivation",
        row.id,
        uniqueGymIds([
          ...(transactionMap.get(toPositiveInt(row.transactionId)) || []),
          ...(packageMap.get(toPositiveInt(row.packageId)) || []),
        ])
      );
    });
  }

  const transferIds = idsFor("equipmenttransfer");
  if (transferIds.length) {
    const rows = await fetchRows(db.EquipmentTransfer, transferIds, ["id", "fromGymId", "toGymId"]);
    rows.forEach((row) => addResolvedGymIds(resolvedMap, "equipmenttransfer", row.id, [row.fromGymId, row.toGymId]));
  }

  const franchiseRequestIds = idsFor("franchiserequest");
  if (franchiseRequestIds.length) {
    const rows = await fetchRows(db.FranchiseRequest, franchiseRequestIds, ["id", "gymId"]);
    rows.forEach((row) => addResolvedGymIds(resolvedMap, "franchiserequest", row.id, [row.gymId]));
  }

  return resolvedMap;
}

export async function attachGymIdsToNotifications(items = []) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const resolvedMap = await resolveNotificationGymIdMap(items);

  return items.map((item) => {
    const type = canonicalizeType(item?.relatedType || item?.notificationType);
    const relatedId = toPositiveInt(item?.relatedId);
    const gymIds = type && relatedId ? (resolvedMap.get(getKey(type, relatedId)) || []) : [];

    return {
      ...(item?.toJSON ? item.toJSON() : item),
      gymIds,
    };
  });
}

export function matchesNotificationGym(item, gymId) {
  const scopedGymId = toPositiveInt(gymId);
  if (!scopedGymId) return true;

  const gymIds = uniqueGymIds(item?.gymIds || []);
  return gymIds.length === 0 || gymIds.includes(scopedGymId);
}