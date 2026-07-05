const express = require("express");
const router = express.Router();
const passport = require("../config/passport");
const {
  register,
  login,
  getMe,
  forgotPassword,
  resetPassword,
  googleCallback,
  getAgents,
  createAgent,
} = require("../controllers/authController");
const { protect, requireRole } = require("../middleware/authMiddleware");

// Standard auth
router.post("/register", register);
router.post("/login", login);
router.get("/me", protect, getMe);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Agent management (admin only)
router.get("/agents", protect, requireRole("admin"), getAgents);
router.post("/agents", protect, requireRole("admin"), createAgent);

// Google OAuth
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  googleCallback
);

module.exports = router;