import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import pool from "./db.js";
import authRoutes from "./routes/auth.js";
import dashboardRoutes from "./routes/dashboard.js";
import clientsRoutes from "./routes/clients.js";
import quotesRoutes from "./routes/quotes.js";
import invoicesRoutes from "./routes/invoices.js";
import settingsRoutes from "./routes/settings.js";
import teamRoutes from "./routes/team.js";
import remindersRoutes from "./routes/reminders.js";
import paymentsRoutes, { handleStripeWebhook } from "./routes/payments.js";
import billingRoutes from "./routes/billing.js";
import suppliersRoutes from "./routes/suppliers.js";
import purchasesRoutes from "./routes/purchases.js";
import expensesRoutes from "./routes/expenses.js";
import ledgerRoutes from "./routes/ledger.js";
import inventoryRoutes from "./routes/inventory.js";
import platformRoutes from "./routes/platform.js";
import pipelineRoutes from "./routes/pipeline.js";
import uploadRoutes, { uploadRoot } from "./routes/uploads.js";
import auditRoutes from "./routes/audit.js";
import portalRoutes from "./routes/portal.js";
import chatbotRoutes from "./routes/chatbot.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { startReminderScheduler } from "./services/reminders.js";
import { assertJwtSecretConfigured } from "./utils/jwtSecret.js";

dotenv.config();
assertJwtSecretConfigured();

const app = express();
const port = Number(process.env.PORT || 4000);
const configuredOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const devOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost",
  "http://127.0.0.1"
];
const allowedOrigins = new Set([...configuredOrigins, ...devOrigins]);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin is not allowed."));
    }
  })
);

app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

app.use("/uploads", express.static(uploadRoot));
app.use(express.json({ limit: "8mb" }));
app.use(requestLogger);

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.json({
      status: "ok",
      service: "konzotech-saas-api"
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Database connection unavailable."
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/clients", clientsRoutes);
app.use("/api/quotes", quotesRoutes);
app.use("/api/invoices", invoicesRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/reminders", remindersRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/suppliers", suppliersRoutes);
app.use("/api/purchases", purchasesRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/ledger", ledgerRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/platform", platformRoutes);
app.use("/api/pipeline", pipelineRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/portal", portalRoutes);
app.use("/api/chatbot", chatbotRoutes);

app.use((req, res) => {
  return res.status(404).json({ message: "Route not found." });
});

app.use((error, req, res, next) => {
  if (error?.message === "Origin is not allowed.") {
    return res.status(403).json({ message: error.message });
  }

  console.error(error);
  return res.status(500).json({
    message: "Unexpected server error."
  });
});

app.listen(port, () => {
  startReminderScheduler();
  console.log(`Konzotech API running on http://localhost:${port}`);
});
