"use strict";

const express = require("express");
const router = express.Router();

const publicFranchiseContractController = require("../controllers/publicFranchiseContractController");

// Public signing endpoints (no JWT)
router.get("/franchise-contract/by-token", publicFranchiseContractController.getByToken);
router.get("/franchise-contract/document", publicFranchiseContractController.documentByToken);
router.post("/franchise-contract/sign", publicFranchiseContractController.signByToken);

module.exports = router;