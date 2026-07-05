const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");
const session = require("express-session");
const passport = require("./src/config/passport");

dotenv.config();

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5174",
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Static folder for uploads
app.use("/uploads", express.static("uploads"));

// Routes
const authRoutes = require("./src/routes/authRoutes");
const ticketRoutes = require("./src/routes/ticketRoutes");
const commentRoutes = require("./src/routes/commentRoutes");
const notificationRoutes = require("./src/routes/notificationRoutes");
const knowledgeRoutes = require("./src/routes/knowledgeRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/knowledge", knowledgeRoutes);

// Health check
app.get("/", (req, res) => {
  res.json({
    message: "Ticketing System API is running",
    version: "1.0.0",
  });
});

// Start server
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});