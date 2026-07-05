const express = require("express");
const router = express.Router();
const {
  getArticles,
  getArticle,
  createArticle,
  updateArticle,
  deleteArticle,
} = require("../controllers/knowledgeController");
const { protect, requireRole } = require("../middleware/authMiddleware");

router.get("/", getArticles);
router.get("/:id", getArticle);
router.post("/", protect, requireRole("admin"), createArticle);
router.put("/:id", protect, requireRole("admin"), updateArticle);
router.delete("/:id", protect, requireRole("admin"), deleteArticle);

module.exports = router;