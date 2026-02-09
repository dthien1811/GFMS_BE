import ownerTransactionService from "../../service/owner/transaction.service";

const ownerTransactionController = {
  /**
   * GET /api/owner/transactions
   * Owner xem danh sách giao dịch mua gói theo gym
   */
  async getMyTransactions(req, res) {
    try {
      const userId = req.user.id;
      const result = await ownerTransactionService.getMyTransactions(userId, req.query);

      return res.status(200).json({
        data: result.data,
        pagination: result.pagination,
      });
    } catch (e) {
      console.error("Error in getMyTransactions controller:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default ownerTransactionController;
