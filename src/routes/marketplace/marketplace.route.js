import express from "express";
import marketplaceController from "../../controllers/marketplace/marketplace.controller";

const router = express.Router();

/* ================== GYMS ================== */
router.get("/gyms", marketplaceController.listGyms);
router.get("/gyms/:id", marketplaceController.getGymDetail);
router.get("/gyms/:id/trainers", marketplaceController.listGymTrainers);
router.get("/gyms/:id/packages", marketplaceController.listGymPackages);

/* ================== TRAINERS ================== */
router.get("/trainers", marketplaceController.listTrainers);
router.get("/trainers/:id", marketplaceController.getTrainerDetail);
router.get("/trainers/:id/packages", marketplaceController.listTrainerPackages);

/* ================== PACKAGES ================== */
router.get("/highlights", marketplaceController.listLandingHighlights);
router.get("/packages", marketplaceController.listPackages);
router.get("/packages/:id", marketplaceController.getPackageDetail);

/* ✅ NEW: public slots for wizard */
router.get("/slots", marketplaceController.getAvailableSlotsPublic);

export default router;
