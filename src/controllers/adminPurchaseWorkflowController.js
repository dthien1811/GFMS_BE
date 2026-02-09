// src/controllers/adminPurchaseWorkflowController.js
const adminPurchaseWorkflowService = require("../service/adminPurchaseWorkflowService");

class AdminPurchaseWorkflowController {
  /* ========================= QUOTATIONS ========================= */

  getQuotations = async (req, res) => {
    try {
      const result = await adminPurchaseWorkflowService.getQuotations(req.query);
      return res.status(200).json(result);
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  };

  getQuotationDetail = async (req, res) => {
    try {
      const result = await adminPurchaseWorkflowService.getQuotationDetail(req.params.id);
      return res.status(200).json(result);
    } catch (e) {
      const code = e.message?.toLowerCase().includes("not found") ? 404 : 500;
      return res.status(code).json({ message: e.message });
    }
  };

  quoteQuotation = async (req, res) => {
    try {
      const result = await adminPurchaseWorkflowService.quoteQuotation(
        req.params.id,
        req.body,
        req.user?.id,
        req
      );
      return res.status(200).json(result);
    } catch (e) {
      const code = e.message?.toLowerCase().includes("not found") ? 404 : 400;
      return res.status(code).json({ message: e.message });
    }
  };

  approveQuotation = async (req, res) => {
    try {
      const result = await adminPurchaseWorkflowService.approveQuotation(
        req.params.id,
        req.user?.id,
        req
      );
      return res.status(200).json(result);
    } catch (e) {
      const code = e.message?.toLowerCase().includes("not found") ? 404 : 400;
      return res.status(code).json({ message: e.message });
    }
  };

  rejectQuotation = async (req, res) => {
    try {
      const result = await adminPurchaseWorkflowService.rejectQuotation(
        req.params.id,
        req.body,
        req.user?.id,
        req
      );
      return res.status(200).json(result);
    } catch (e) {
      const code = e.message?.toLowerCase().includes("not found") ? 404 : 400;
      return res.status(code).json({ message: e.message });
    }
  };

  /* ========================= PURCHASE ORDERS ========================= */

  createPOFromQuotation = async (req, res) => {
    try {
      const result = await adminPurchaseWorkflowService.createPOFromQuotation(
        req.params.id,
        req.user?.id,
        req
      );
      return res.status(201).json(result);
    } catch (e) {
      const code = e.message?.toLowerCase().includes("not found") ? 404 : 400;
      return res.status(code).json({ message: e.message });
    }
  };

  getPurchaseOrders = async (req, res) => {
    try {
      const result = await adminPurchaseWorkflowService.getPurchaseOrders(req.query);
      return res.status(200).json(result);
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  };

  getPurchaseOrderDetail = async (req, res) => {
    try {
      const result = await adminPurchaseWorkflowService.getPurchaseOrderDetail(req.params.id);
      return res.status(200).json(result);
    } catch (e) {
      const code = e.message?.toLowerCase().includes("not found") ? 404 : 500;
      return res.status(code).json({ message: e.message });
    }
  };

  approvePurchaseOrder = async (req, res) => {
    try {
      const result = await adminPurchaseWorkflowService.approvePurchaseOrder(
        req.params.id,
        req.user?.id,
        req
      );
      return res.status(200).json(result);
    } catch (e) {
      const code = e.message?.toLowerCase().includes("not found") ? 404 : 400;
      return res.status(code).json({ message: e.message });
    }
  };

  orderPurchaseOrder = async (req, res) => {
    try {
      const result = await adminPurchaseWorkflowService.orderPurchaseOrder(
        req.params.id,
        req.body,
        req.user?.id,
        req
      );
      return res.status(200).json(result);
    } catch (e) {
      const code = e.message?.toLowerCase().includes("not found") ? 404 : 400;
      return res.status(code).json({ message: e.message });
    }
  };

  cancelPurchaseOrder = async (req, res) => {
    try {
      const result = await adminPurchaseWorkflowService.cancelPurchaseOrder(
        req.params.id,
        req.body,
        req.user?.id,
        req
      );
      return res.status(200).json(result);
    } catch (e) {
      const code = e.message?.toLowerCase().includes("not found") ? 404 : 400;
      return res.status(code).json({ message: e.message });
    }
  };

  /* ========================= RECEIPTS (INBOUND) ========================= */

  getReceipts = async (req, res) => {
    try {
      const result = await adminPurchaseWorkflowService.getReceipts(req.query);
      return res.status(200).json(result);
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  };

  getReceiptDetail = async (req, res) => {
    try {
      const result = await adminPurchaseWorkflowService.getReceiptDetail(req.params.id);
      return res.status(200).json(result);
    } catch (e) {
      const code = e.message?.toLowerCase().includes("not found") ? 404 : 500;
      return res.status(code).json({ message: e.message });
    }
  };

  createInboundReceiptFromPO = async (req, res) => {
    try {
      const result = await adminPurchaseWorkflowService.createInboundReceiptFromPO(
        req.params.id,
        req.user?.id,
        req
      );
      return res.status(201).json(result);
    } catch (e) {
      const code = e.message?.toLowerCase().includes("not found") ? 404 : 400;
      return res.status(code).json({ message: e.message });
    }
  };

  completeReceipt = async (req, res) => {
    try {
      const result = await adminPurchaseWorkflowService.completeReceipt(
        req.params.id,
        req.user?.id,
        req
      );
      return res.status(200).json(result);
    } catch (e) {
      const code = e.message?.toLowerCase().includes("not found") ? 404 : 400;
      return res.status(code).json({ message: e.message });
    }
  };

  /* ========================= PAYMENTS ========================= */

  getPOPayments = async (req, res) => {
    try {
      const result = await adminPurchaseWorkflowService.getPOPayments(req.params.id);
      return res.status(200).json(result);
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  };

  createPOPayment = async (req, res) => {
    try {
      const result = await adminPurchaseWorkflowService.createPOPayment(
        req.params.id,
        req.body,
        req.user?.id,
        req
      );
      return res.status(201).json(result);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
  };
}

module.exports = new AdminPurchaseWorkflowController();
