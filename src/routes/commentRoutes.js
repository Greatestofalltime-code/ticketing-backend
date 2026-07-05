const express = require("express");
const router = express.Router();
const { addComment, deleteComment } = require("../controllers/commentController");
const { protect, requireRole } = require("../middleware/authMiddleware");

router.post("/:ticketId", protect, addComment);
router.delete("/:id", protect, requireRole("admin"), deleteComment);

module.exports = router;