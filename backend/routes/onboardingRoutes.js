import express from "express";
import Onboarding from "../models/onboarding.js";   // ✅ correct import

const router = express.Router();

// ------------------ CREATE ONBOARDING (POST) ------------------
router.post("/", async (req, res) => {
  try {
    const { clerkId, name, email, phone, skills, city, industry } = req.body;

    if (!clerkId || !name || !email) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const newProfile = await Onboarding.create({
      clerkId,
      name,
      email,
      phone,
      skills,
      city,
      industry,
      hasOnboarded: true,
    });

    res.status(201).json(newProfile);

  } catch (error) {
    console.error("ONBOARDING ERROR:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

// ------------------ GET USER ONBOARDING (GET) ------------------
router.get("/:clerkId", async (req, res) => {
  try {
    const user = await Onboarding.findOne({
      clerkId: req.params.clerkId
    });

    if (!user) {
      return res.status(404).json({ message: "Not onboarded yet" });
    }

    res.json(user);

  } catch (err) {
    res.status(500).json({ message: "Error fetching onboarding info" });
  }
});

export default router;
