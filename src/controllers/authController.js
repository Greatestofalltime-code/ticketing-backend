const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const sendEmail = require("../utils/sendEmail");

const prisma = new PrismaClient();

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: "3h" }
  );
};

// REGISTER
const register = async (req, res) => {
  const { name, email, password, role } = req.body;

    // Server-side validation — never trust only the frontend
  if (!name || !email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (password.length < 8) {
    return res.status(400).json({
      message: "Password must be at least 8 characters",
    });
  }

  if (!/[A-Z]/.test(password)) {
    return res.status(400).json({
      message: "Password must contain at least one uppercase letter",
    });
  }

  if (!/[0-9]/.test(password)) {
    return res.status(400).json({
      message: "Password must contain at least one number",
    });
  }

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Only allow customer or agent self-registration — never admin
    const allowedRole = role === "agent" ? "agent" : "customer";

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: allowedRole,
      },
    });

    res.status(201).json({
      message: "Account created successfully",
      token: generateToken(user),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// LOGIN
const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.password) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    res.json({
      message: "Login successful",
      token: generateToken(user),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// GET CURRENT USER
const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        createdAt: true,
      },
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// FORGOT PASSWORD — request reset link
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    // Don't reveal whether email exists — security best practice
    if (!user) {
      return res.json({
        message: "If that email exists, a reset link has been sent.",
      });
    }

    // Generate a secure random token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${token}`;

    await sendEmail(
      user.email,
      "Reset Your Password",
      `
        <h2>Password Reset Request</h2>
        <p>Hi ${user.name},</p>
        <p>Click the link below to reset your password. This link expires in 1 hour.</p>
        <a href="${resetLink}" style="background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:12px;">
          Reset Password
        </a>
        <p style="margin-top:20px;color:#666;font-size:14px;">
          If you didn't request this, you can safely ignore this email.
        </p>
      `
    );

    res.json({
      message: "If that email exists, a reset link has been sent.",
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// RESET PASSWORD — using the token from email
const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({
      message: "Password must be at least 8 characters",
    });
  }

  if (!/[A-Z]/.test(newPassword)) {
    return res.status(400).json({
      message: "Password must contain at least one uppercase letter",
    });
  }

  if (!/[0-9]/.test(newPassword)) {
    return res.status(400).json({
      message: "Password must contain at least one number",
    });
  }
  try {
    const resetRequest = await prisma.passwordReset.findUnique({
      where: { token },
    });

    if (!resetRequest) {
      return res.status(400).json({ message: "Invalid or expired reset link" });
    }

    if (new Date() > resetRequest.expiresAt) {
      // Clean up expired token
      await prisma.passwordReset.delete({ where: { token } });
      return res.status(400).json({ message: "Reset link has expired" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: resetRequest.userId },
      data: { password: hashedPassword },
    });

    // Delete the used token so it can't be reused
    await prisma.passwordReset.delete({ where: { token } });

    res.json({ message: "Password reset successfully. You can now log in." });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// GOOGLE OAUTH CALLBACK
const googleCallback = async (req, res) => {
  try {
    const user = req.user;
    const token = generateToken(user);

    // Redirect to frontend with token in URL
    // Frontend reads it and stores in localStorage
    res.redirect(
      `${process.env.FRONTEND_URL}/auth/google/success?token=${token}&name=${encodeURIComponent(user.name)}&email=${encodeURIComponent(user.email)}&role=${user.role}&id=${user.id}`
    );
  } catch (error) {
    res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
  }
};

// GET ALL AGENTS (admin only)
const getAgents = async (req, res) => {
  try {
    const agents = await prisma.user.findMany({
      where: { role: "agent" },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        ticketsAssigned: {
          where: { status: { in: ["open", "in_progress"] } },
          select: { id: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const agentsWithCount = agents.map((agent) => ({
      ...agent,
      activeTickets: agent.ticketsAssigned.length,
      ticketsAssigned: undefined,
    }));

    res.json(agentsWithCount);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// CREATE AGENT (admin only)
const createAgent = async (req, res) => {
  const { name, email, password } = req.body;

  try {
    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters",
      });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const agent = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: "agent",
      },
    });

    // Send welcome email to new agent
    await sendEmail(
      email,
      "Welcome to IT Support Portal — Agent Account Created",
      `
        <h2>Welcome to the IT Support Portal</h2>
        <p>Hi ${name},</p>
        <p>An agent account has been created for you on the IT Support Portal.</p>
        <table style="border-collapse:collapse;width:100%;max-width:400px">
          <tr>
            <td style="padding:8px;border:1px solid #ddd"><strong>Email</strong></td>
            <td style="padding:8px;border:1px solid #ddd">${email}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #ddd"><strong>Password</strong></td>
            <td style="padding:8px;border:1px solid #ddd">${password}</td>
          </tr>
        </table>
        <p style="margin-top:16px;color:#666;font-size:14px;">
          Please log in and change your password immediately.
        </p>
        <a href="${process.env.FRONTEND_URL}/login"
           style="background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:12px;">
          Log In Now
        </a>
      `
    );

    res.status(201).json({
      message: "Agent created successfully",
      agent: {
        id: agent.id,
        name: agent.name,
        email: agent.email,
        role: agent.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// CHANGE PASSWORD
const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user || !user.password) {
      return res.status(400).json({
        message: "Cannot change password for Google accounts",
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({
        message: "Current password is incorrect",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword },
    });

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  register,
  login,
  getMe,
  forgotPassword,
  resetPassword,
  googleCallback,
  getAgents,
  createAgent,
  changePassword,
};