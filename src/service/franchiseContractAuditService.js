"use strict";

const { FranchiseContractAudit } = require("../models");

async function logEvent({
  franchiseRequestId,
  documentId = null,
  eventType,
  actorRole = "system",
  ip = null,
  userAgent = null,
  meta = null,
  transaction = null,
}) {
  return await FranchiseContractAudit.create(
    {
      franchiseRequestId,
      documentId,
      eventType,
      actorRole,
      ip: ip ? String(ip).slice(0, 64) : null,
      userAgent: userAgent ? String(userAgent) : null,
      meta: meta || null,
    },
    { transaction }
  );
}

async function listEvents(franchiseRequestId, { transaction = null } = {}) {
  return await FranchiseContractAudit.findAll({
    where: { franchiseRequestId },
    order: [["createdAt", "ASC"]],
    transaction,
  });
}

module.exports = {
  logEvent,
  listEvents,
};
