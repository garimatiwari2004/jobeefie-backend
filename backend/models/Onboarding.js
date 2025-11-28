import mongoose from "mongoose";

const onboardingSchema = new mongoose.Schema(
  {
    clerkId: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String },
    skills: { type: [String], default: [] },
    city: { type: String },
    industry: { type: String },
    hasOnboarded: { type: Boolean, default: false }

  },
  { timestamps: true }
);

export default mongoose.model("Onboarding", onboardingSchema);
