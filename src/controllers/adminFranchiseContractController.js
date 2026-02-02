"use strict";

const svc = require("../service/adminFranchiseContractService");

const wrap = (fn) => async (req, res) => {
  try {
    const data = await fn(req);
    return res.status(200).json(data);
  } catch (e) {
    console.error("adminFranchiseContractController error:", e);
    const status = e.statusCode || 400;
    return res.status(status).json({
      message: e.message || "Bad Request",
      ...(process.env.NODE_ENV !== "production" ? { stack: e.stack } : {}),
    });
  }
};

module.exports = {
  // PATCH /api/admin/inventory/franchise-contract/:id/send
  sendContract: wrap((req) => svc.sendContract(req)),

  // GET /api/admin/inventory/franchise-contract/:id/status
  getStatus: wrap((req) => svc.getContractStatus(req)),

  // PATCH /api/admin/inventory/franchise-contract/:id/mock/viewed
  mockMarkViewed: wrap((req) => svc.mockMarkViewed(req)),

  // PATCH /api/admin/inventory/franchise-contract/:id/mock/signed
  mockMarkSigned: wrap((req) => svc.mockMarkSigned(req)),

  // PATCH /api/admin/inventory/franchise-contract/:id/mock/completed
  mockMarkCompleted: wrap((req) => svc.mockMarkCompleted(req)),
};
