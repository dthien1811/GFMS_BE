// controllers/trainerRequestController.js
const db = require("../models");
const TrainerRequestService = require("../service/trainerRequestService");

const getTrainerId = (req) => req.user.id;

// tạo 1 instance dùng chung
const service = new TrainerRequestService(db);

module.exports = {
  async createLeaveRequest(req, res, next) {
    try {
      const result = await service.createTrainerRequest({
        requesterId: getTrainerId(req),
        requestType: "leave",
        reason: req.body.reason,
        data: req.body.data,
      });
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  },

  async createShiftChangeRequest(req, res, next) {
    try {
      const result = await service.createTrainerRequest({
        requesterId: getTrainerId(req),
        requestType: "shift_change",
        reason: req.body.reason,
        data: req.body.data,
      });
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  },

  async createTransferBranchRequest(req, res, next) {
    try {
      const result = await service.createTrainerRequest({
        requesterId: getTrainerId(req),
        requestType: "transfer_branch",
        reason: req.body.reason,
        data: req.body.data,
      });
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  },

  async createOvertimeRequest(req, res, next) {
    try {
      const result = await service.createTrainerRequest({
        requesterId: getTrainerId(req),
        requestType: "overtime",
        reason: req.body.reason,
        data: req.body.data,
      });
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  },

  async getMyRequests(req, res, next) {
    try {
      const result = await service.getMyRequests({
        requesterId: getTrainerId(req),
        status: req.query.status,
        requestType: req.query.requestType,
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  },

  async cancelRequest(req, res, next) {
    try {
      const result = await service.cancelTrainerRequest({
        requesterId: getTrainerId(req),
        requestId: req.params.id,
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  },
};
