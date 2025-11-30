import mongoose from "mongoose";

const interviewReportSchema = new mongoose.Schema({
  clerkId: { type: String, required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "InterviewSession", required: true },
  skill: String,
  score: Number,
  totalQuestions: Number,
  accuracy: Number,
  strengths: [String],
  weaknesses: [String],
  tips: [String],
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("InterviewReport", interviewReportSchema);
