const service = require('../service/equipmentAsset.service');

const ok = (res, DT, EM = 'OK') => res.json({ EC: 0, EM, DT });
const fail = (res, error) => res.status(error.status || 500).json({ EC: -1, EM: error.message || 'Server error', DT: null });

const requireAdmin = (req) => {
  if (Number(req.user?.groupId) !== 1) {
    const err = new Error('Bạn không có quyền admin');
    err.status = 403;
    throw err;
  }
};

exports.adminList = async (req, res) => {
  try { requireAdmin(req); ok(res, await service.listAssets(req.query)); } catch (e) { fail(res, e); }
};
exports.adminSummary = async (req, res) => {
  try { requireAdmin(req); ok(res, await service.summary()); } catch (e) { fail(res, e); }
};
exports.adminDetail = async (req, res) => {
  try { requireAdmin(req); ok(res, await service.getAssetById(req.params.id)); } catch (e) { fail(res, e); }
};
exports.adminQr = async (req, res) => {
  try { requireAdmin(req); ok(res, await service.getQrById(req.params.id)); } catch (e) { fail(res, e); }
};
exports.adminRegenerateQr = async (req, res) => {
  try { requireAdmin(req); ok(res, await service.regenerateQr(req.params.id), 'Đã tạo lại QR'); } catch (e) { fail(res, e); }
};
exports.ownerList = async (req, res) => {
  try { ok(res, await service.listAssets(req.query, { ownerId: req.user.id })); } catch (e) { fail(res, e); }
};
exports.ownerSummary = async (req, res) => {
  try { ok(res, await service.summary({ ownerId: req.user.id })); } catch (e) { fail(res, e); }
};
exports.ownerDetail = async (req, res) => {
  try { ok(res, await service.getAssetById(req.params.id, { ownerId: req.user.id })); } catch (e) { fail(res, e); }
};
exports.ownerQr = async (req, res) => {
  try { ok(res, await service.getQrById(req.params.id, { ownerId: req.user.id })); } catch (e) { fail(res, e); }
};
exports.publicScan = async (req, res) => {
  try { ok(res, await service.scanByToken(req.params.publicToken)); } catch (e) { fail(res, e); }
};
