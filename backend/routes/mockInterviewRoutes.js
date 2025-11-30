// backend/routes/mockInterviewRoutes.js
import express from "express";
import InterviewSession from "../models/InterviewSession.js";
import InterviewReport from "../models/InterviewReport.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { nanoid } from "nanoid";
import dotenv from "dotenv";

dotenv.config();
const router = express.Router();

const gen = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = gen.getGenerativeModel({ model: "gemini-2.5-flash" }); // or "gemini-1.5-pro"

function safeExtractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  const str = match ? match[0] : text;
  return JSON.parse(str);
}

async function generateOneQuestion(skill) {
  const prompt = `
Generate ONE multiple-choice technical interview question for skill: "${skill}".
Return JSON ONLY, exactly in this format:
{
  "q": "Question text",
  "options": { "A": "Option A", "B": "Option B", "C": "Option C", "D": "Option D" },
  "correct": "B",
  "explanation": "Short explanation (1-2 lines)"
}
Rules:
- Provide one correct answer only.
- Use interview-level phrasing.
- Return ONLY JSON and no extra commentary.
`;
  const resp = await model.generateContent(prompt);
  const raw = resp.response.text();
  return safeExtractJSON(raw);
}

async function generateImprovementTip(skill, qText, correctKey, userKey, options) {
  const prompt = `
The user answered incorrectly.
Skill: ${skill}
Question: ${qText}
Correct: ${correctKey} -> ${options[correctKey]}
User Answer: ${userKey} -> ${options[userKey] || "N/A"}

Give a concise improvement tip (max 2 sentences). Return plain text only.
`;
  const resp = await model.generateContent(prompt);
  return resp.response.text().trim();
}

async function generateAnalysis(session) {
  const total = session.totalQuestions;
  const score = session.score;
  const incorrect = session.answers.filter(a => !a.correct).map(a => {
    const q = session.questions.find(x => x.qId === a.qId);
    return { question: q.question, correct: q.correctOption, selected: a.selectedOption };
  });

  const prompt = `
Create a JSON analysis for this mock interview.

Skill: ${session.skill}
Score: ${score}/${total}
Incorrect questions: ${JSON.stringify(incorrect)}

Return JSON only with keys:
{
  "accuracy": number,
  "strengths": [string],
  "weaknesses": [string],
  "recommendations": [string],
  "readinessScore": number
}
Make weaknesses specific and actionable. Keep recommendations to 3 short items.
`;
  const resp = await model.generateContent(prompt, { maxOutputTokens: 6000 });
  const raw = resp.response.text();
  return safeExtractJSON(raw);
}

/* START */
router.post("/start", async (req, res) => {
  try {
    const { clerkId, skill, totalQuestions = 5 } = req.body;
    if (!clerkId || !skill) return res.status(400).json({ message: "clerkId and skill required" });

    const session = new InterviewSession({ clerkId, skill, totalQuestions, questions: [] });

    // generate first question
    const gen = await generateOneQuestion(skill);
    const qId = nanoid(8);
    session.questions.push({
      qId,
      question: gen.q,
      options: gen.options,
      correctOption: gen.correct,
      explanation: gen.explanation
    });

    await session.save();

    // return only qId/question/options
    const { qId: idToSend, question, options } = session.questions[0];
    res.json({ sessionId: session._id, question: { qId: idToSend, question, options }, currentIndex: session.currentIndex, totalQuestions: session.totalQuestions });
  } catch (err) {
    console.error("start error", err);
    res.status(500).json({ message: "Failed to start session" });
  }
});

/* NEXT */
router.get("/next/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await InterviewSession.findById(sessionId);
    if (!session) return res.status(404).json({ message: "Session not found" });
    if (session.finished) return res.status(400).json({ message: "Session finished" });

    const nextIdx = session.currentIndex;
    if (session.questions[nextIdx]) {
      const q = session.questions[nextIdx];
      return res.json({ question: { qId: q.qId, question: q.question, options: q.options }, currentIndex: nextIdx, totalQuestions: session.totalQuestions });
    }

    const gen = await generateOneQuestion(session.skill);
    const qId = nanoid(8);
    session.questions.push({
      qId,
      question: gen.q,
      options: gen.options,
      correctOption: gen.correct,
      explanation: gen.explanation
    });
    await session.save();
    const q = session.questions[session.currentIndex];
    res.json({ question: { qId: q.qId, question: q.question, options: q.options }, currentIndex: session.currentIndex, totalQuestions: session.totalQuestions });
  } catch (err) {
    console.error("next error", err);
    res.status(500).json({ message: "Failed to fetch next question" });
  }
});

/* ANSWER */
router.post("/answer", async (req, res) => {
  try {
    const { sessionId, qId, selectedOption } = req.body;
    if (!sessionId || !qId) return res.status(400).json({ message: "sessionId and qId required" });

    const session = await InterviewSession.findById(sessionId);
    if (!session) return res.status(404).json({ message: "Session not found" });

    const q = session.questions.find(item => item.qId === qId);
    if (!q) return res.status(404).json({ message: "Question not found" });

    const correct = q.correctOption === selectedOption;
    session.answers.push({ qId, selectedOption, correct });
    if (correct) session.score += 1;
    session.currentIndex = Math.min(session.currentIndex + 1, session.totalQuestions);
    await session.save();

    let improvementTip = null;
    if (!correct) {
      improvementTip = await generateImprovementTip(session.skill, q.question, q.correctOption, selectedOption, q.options);
    }

    res.json({ correct, explanation: q.explanation, improvementTip });
  } catch (err) {
    console.error("answer error", err);
    res.status(500).json({ message: "Failed to record answer" });
  }
});

/* FINISH */
router.post("/finish", async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ message: "sessionId required" });

    const session = await InterviewSession.findById(sessionId);
    if (!session) return res.status(404).json({ message: "Session not found" });

    session.finished = true;
    await session.save();

    const analysis = await generateAnalysis(session);

    const report = await InterviewReport.create({
      clerkId: session.clerkId,
      sessionId: session._id,
      skill: session.skill,
      score: session.score,
      totalQuestions: session.totalQuestions,
      accuracy: analysis.accuracy,
      strengths: analysis.strengths,
      weaknesses: analysis.weaknesses,
      tips: analysis.recommendations
    });

    res.json({ reportId: report._id, report: analysis, score: session.score, total: session.totalQuestions });
  } catch (err) {
    console.error("finish error", err);
    res.status(500).json({ message: "Failed to finish session" });
  }
});

export default router;
