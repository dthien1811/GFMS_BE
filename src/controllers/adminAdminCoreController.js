"use strict";

const adminAdminCoreService = require("../service/adminAdminCoreService");

const wrap = (fn) => async (req, res) => {
  try {
    const data = await fn(req);
    return res.status(200).json(data);
  } catch (e) {
    console.error("adminAdminCoreController error:", e);
    const status = e.statusCode || 400;
    return res.status(status).json({ message: e.message || "Bad Request" });
  }
};

module.exports = {
  // ========== MODULE 2: MAINTENANCE ==========
  getMaintenances: wrap((req) => adminAdminCoreService.getMaintenances(req)),
  getMaintenanceDetail: wrap((req) => adminAdminCoreService.getMaintenanceDetail(req)),
  approveMaintenance: wrap((req) => adminAdminCoreService.approveMaintenance(req)),
  rejectMaintenance: wrap((req) => adminAdminCoreService.rejectMaintenance(req)),
  assignMaintenance: wrap((req) => adminAdminCoreService.assignMaintenance(req)),
  startMaintenance: wrap((req) => adminAdminCoreService.startMaintenance(req)),
  completeMaintenance: wrap((req) => adminAdminCoreService.completeMaintenance(req)),

  // ✅ NEW: get technicians (for dropdown assign)
  getTechnicians: wrap((req) => adminAdminCoreService.getTechnicians(req)),

  // ✅ DASHBOARD
  getDashboardOverview: wrap((req) => adminAdminCoreService.getDashboardOverview(req)),

  // ========== MODULE 3: FRANCHISE ==========
  getFranchiseRequests: wrap((req) => adminAdminCoreService.getFranchiseRequests(req)),
  getFranchiseRequestDetail: wrap((req) => adminAdminCoreService.getFranchiseRequestDetail(req)),
  approveFranchiseRequest: wrap((req) => adminAdminCoreService.approveFranchiseRequest(req)),
  rejectFranchiseRequest: wrap((req) => adminAdminCoreService.rejectFranchiseRequest(req)),

  // ========== MODULE 4: POLICIES ==========
  getPolicies: wrap((req) => adminAdminCoreService.getPolicies(req)),
  getEffectivePolicy: wrap((req) => adminAdminCoreService.getEffectivePolicy(req)),
  createPolicy: wrap((req) => adminAdminCoreService.createPolicy(req)),
  updatePolicy: wrap((req) => adminAdminCoreService.updatePolicy(req)),
  togglePolicy: wrap((req) => adminAdminCoreService.togglePolicy(req)),

  // ========== MODULE 5: TRAINER SHARE ==========
  getTrainerShares: wrap((req) => adminAdminCoreService.getTrainerShares(req)),
  getTrainerShareDetail: wrap((req) => adminAdminCoreService.getTrainerShareDetail(req)),
  approveTrainerShare: wrap((req) => adminAdminCoreService.approveTrainerShare(req)),
  rejectTrainerShare: wrap((req) => adminAdminCoreService.rejectTrainerShare(req)),
  overrideTrainerShare: wrap((req) => adminAdminCoreService.overrideTrainerShare(req)),

  // ========== MODULE 6.1: AUDIT LOGS ==========
  getAuditLogs: wrap((req) => adminAdminCoreService.getAuditLogs(req)),

  // ========== MODULE 6.2: REPORTS ==========
  getReportSummary: wrap((req) => adminAdminCoreService.getReportSummary(req)),
  getReportRevenue: wrap((req) => adminAdminCoreService.getReportRevenue(req)),
  getReportInventory: wrap((req) => adminAdminCoreService.getReportInventory(req)),
  getReportTrainerShare: wrap((req) => adminAdminCoreService.getReportTrainerShare(req)),
};
