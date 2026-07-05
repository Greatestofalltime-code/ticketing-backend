const express = require("express");
const router = express.Router();
const {
  createTicket,
  getTickets,
  getTicket,
  updateTicketStatus,
  deleteTicket,
  getDashboardStats,
} = require("../controllers/ticketController");
const { protect, requireRole } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

router.get("/stats", protect, requireRole("admin"), getDashboardStats);
router.get("/", protect, getTickets);
router.get("/:id", protect, getTicket);
router.post("/", protect, requireRole("customer"), upload.array("attachments", 5), createTicket);
router.put("/:id", protect, requireRole("agent", "admin"), updateTicketStatus);
router.delete("/:id", protect, requireRole("admin"), deleteTicket);

module.exports = router;