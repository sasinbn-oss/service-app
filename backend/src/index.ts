import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth";
import vehicleRoutes from "./routes/vehicles";
import vehicleLogRoutes from "./routes/vehicleLogs";
import branchRoutes from "./routes/branches";
import branchCheckInRoutes from "./routes/branchCheckIns";
import workLogRoutes from "./routes/workLogs";
import guideRoutes from "./routes/guides";
import troubleshootFlowRoutes from "./routes/troubleshootFlows";
import sparePartRoutes from "./routes/spareParts";
import consumableRoutes from "./routes/consumables";
import consumableRequestRoutes from "./routes/consumableRequests";
import assistantRoutes from "./routes/assistant";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/vehicle-logs", vehicleLogRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/branch-checkins", branchCheckInRoutes);
app.use("/api/work-logs", workLogRoutes);
app.use("/api/guides", guideRoutes);
app.use("/api/troubleshoot-flows", troubleshootFlowRoutes);
app.use("/api/spare-parts", sparePartRoutes);
app.use("/api/consumables", consumableRoutes);
app.use("/api/consumable-requests", consumableRequestRoutes);
app.use("/api/assistant", assistantRoutes);

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`Service-app backend listening on port ${PORT}`);
});
