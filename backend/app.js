import express from "express";
import cors from "cors";
import resumeRoutes from "./routes/resumeRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("IT WORKED! 👏 EXPRESS ROOT ROUTE FOUND.");
});

app.use("/api/resume", resumeRoutes);

app.listen(5000, () => {
  console.log("🔥 CLEAN SERVER RUNNING ON 5000");
});
