import mongoose from "mongoose";

const questionStoredSchema = new mongoose.Schema({
  qId: { type: String },
  question: String,
  options: { type: Map, of: String }, // e.g. { A: '...', B: '...' }
  correctOption: String,
  explanation: String
}, { _id: false });

const interviewSessionSchema = new mongoose.Schema({
  clerkId: { type: String, required: true },
  skill: { type: String, required: true },
  totalQuestions: { type: Number, default: 5 },
  questions: [questionStoredSchema],
  answers: [
    { qId: String, selectedOption: String, correct: Boolean }
  ],
  currentIndex: { type: Number, default: 0 },
  score: { type: Number, default: 0 },
  finished: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("InterviewSession", interviewSessionSchema);
