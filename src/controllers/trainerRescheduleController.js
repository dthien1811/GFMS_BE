
const trainerRescheduleService = require('../service/trainerRescheduleService');

exports.listMine = async (req, res) => {
  try {
    const data = await trainerRescheduleService.listMyRescheduleRequests(req.user.id);
    return res.status(200).json({ data });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ message: e.message });
  }
};

exports.approve = async (req, res) => {
  try {
    const data = await trainerRescheduleService.approveRescheduleRequest(req.user.id, Number(req.params.id), req.body || {});
    return res.status(200).json({ data, message: 'Đã chấp nhận yêu cầu đổi lịch' });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ message: e.message });
  }
};

exports.reject = async (req, res) => {
  try {
    const data = await trainerRescheduleService.rejectRescheduleRequest(req.user.id, Number(req.params.id), req.body || {});
    return res.status(200).json({ data, message: 'Đã từ chối yêu cầu đổi lịch' });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ message: e.message });
  }
};
