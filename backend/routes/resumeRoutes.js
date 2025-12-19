import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { PdfReader } from "pdfreader";


const router = express.Router();

// Multer config
const storage = multer.diskStorage({
    destination: "./uploads",
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    },
});
const upload = multer({ storage });

const SKILL_KEYWORDS = [
    "javascript", "java", "python", "c++", "c", "c#", "typescript",
    "react", "redux", "angular", "vue", "node", "express",
    "mongodb", "mysql", "postgresql", "sqlite",
    "aws", "azure", "gcp", "cloud",
    "docker", "kubernetes", "git", "github", "jira",
    "tensorflow", "pytorch", "machine learning", "deep learning",
    "html", "css", "bootstrap", "tailwind",
    "django", "flask", "fastapi",
    "firebase", "graphql",
    "linux", "bash"
];

const INVALID_SKILLS = [
    "education", "experience", "projects", "skills", "responsibilities",
    "address", "year", "month", "location", "contact", "resume"
];

function removeInvalidSkills(skills) {
    return skills.filter(s => !INVALID_SKILLS.includes(s));
}



function cleanText(text) {
    return text
        .replace(/[\s-]+/g, " ")       // normalize spaces + dashes
        .replace(/[^\x00-\x7F]/g, "")  // remove weird chars
        .replace(/\n\s*\n/g, "\n")     // collapse blank lines
        .replace(/\s+/g, " ")
        .trim();
}

function extractEmail(text) {
    const emailRegex = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
    const matches = text.match(emailRegex);
    return matches ? matches[0] : null;
}

function extractPhone(text) {
  const match = text.match(/(?:\+91[\s-]?)?[6-9]\d{9}/);
  return match ? match[0] : null;
}

function extractName(text) {
  const firstLine = text.split("\n")[0] || "";

  // Break CamelCase: "NikhilSihare" -> "Nikhil Sihare"
  const spaced = firstLine.replace(/([a-z])([A-Z])/g, "$1 $2");

  // Extract first 2 capitalized words
  const matches = spaced.match(/[A-Z][a-z]+/g);
  if (matches && matches.length >= 2) {
    return matches.slice(0, 2).join(" ");
  }

  return null;
}

function normalizeSkills(skills) {
    return skills
        .map(s => s.toLowerCase().trim())
        .filter(s => s.length > 1);
}
function finalizeSkills(skills) {
    return [...new Set(skills)].sort();
}

function extractCapitalizedWords(text) {
    const words = text.split(/[\s,()]+/);
    return words.filter(w => /^[A-Z][a-zA-Z0-9.+-]*$/.test(w));
}

const SKILL_STOPWORDS = [
  "achieved","achievements","solved","engineered","designed","bacheloroftechnologyincomputerscience",
  "jan","feb","mar","apr","may","jun","july","aug","sep","oct","nov","dec",
  "bhopal","madhyapradesh","datia","india","link","technicalskills","project",
  "experience","education"
];




function extractSkills(text) {
  const lower = text.toLowerCase();

  // 1. Keyword based skills
  const keywordMatches = SKILL_KEYWORDS.filter(skill =>
    lower.includes(skill)
  );

  // 2. Extract capitalized/camelCase/potential skill words
  const capitalizedMatches = extractCapitalizedWords(text);

  // Combine both raw lists
  let filtered = [...keywordMatches, ...capitalizedMatches];

  // 3. Remove VERY long blobs like:
  // "collaboratedwithfrontendteamtoensureseamlessintegrationwithreact"
  filtered = filtered.filter(w => w.length <= 12);

  // 4. Remove tokens containing numbers (except c++, c#, socket.io)
  filtered = filtered.filter(w =>
    /^[a-zA-Z.+-]+$/.test(w)
  );

  // 5. Remove stopwords (verbs, locations, months, generic words)
  filtered = filtered.filter(w =>
    !SKILL_STOPWORDS.includes(w.toLowerCase())
  );

  // 6. Convert react.js → react
  filtered = filtered.map(w => w.toLowerCase().replace(".js", ""));

  // 7. Unique + sorted
  return [...new Set(filtered)].sort();
}





function scoreContact({ name, email, phone }) {
    let score = 0;
    if (name) score += 4;
    if (email) score += 3;
    if (phone) score += 3;
    return score;
}

function scoreSkills(skills) {
    if (!skills || skills.length === 0) return 0;
    if (skills.length < 5) return 10;
    if (skills.length < 10) return 20;
    return 30;
}

const EXPERIENCE_WORDS = ["experience", "intern", "internship", "worked", "company", "developer", "employment"];

function scoreExperience(text) {
    const lower = text.toLowerCase();
    let score = 0;
    EXPERIENCE_WORDS.forEach(word => {
        if (lower.includes(word)) score += 4;
    });
    return Math.min(score, 20);
}

const PROJECT_WORDS = ["project", "built", "developed", "engineered", "created", "designed"];

function scoreProjects(text) {
    const lower = text.toLowerCase();
    let score = 0;
    PROJECT_WORDS.forEach(word => {
        if (lower.includes(word)) score += 4;
    });
    return Math.min(score, 20);
}

const EDUCATION_WORDS = ["btech", "bachelor", "college", "university", "cgpa", "gpa"];
function scoreEducation(text) {
    const lower = text.toLowerCase();
    let score = 0;
    EDUCATION_WORDS.forEach(word => {
        if (lower.includes(word)) score += 2;
    });
    return Math.min(score, 10);
}

const ACHIEVEMENT_WORDS = ["rank", "award", "achievement", "certification", "certificate", "scholar", "hackathon"];
function scoreAchievements(text) {
    const lower = text.toLowerCase();
    let score = 0;
    ACHIEVEMENT_WORDS.forEach(word => {
        if (lower.includes(word)) score += 2;
    });
    return Math.min(score, 10);
}




function extractJDKeywords(jdText) {
    const lower = jdText.toLowerCase();
    return SKILL_KEYWORDS.filter(skill => lower.includes(skill));
}

function scoreJDMatch(resumeSkills, jdSkills) {
    const matches = resumeSkills.filter(s => jdSkills.includes(s));
    const pct = matches.length / jdSkills.length;

    return Math.round(pct * 30); // up to 30 points
}


function missingJDKeywords(resumeSkills, jdSkills) {
    return jdSkills.filter(s => !resumeSkills.includes(s));
}


router.post("/upload", upload.single("resume"), (req, res) => {
  const filePath = path.resolve(req.file.path);
  const jdText = req.body.jd || ""; // accept JD from frontend

  let fullText = "";

  new PdfReader().parseFileItems(filePath, (err, item) => {
    if (err) {
      console.error("PDF PARSE ERROR:", err);
      return res.status(500).json({ error: "PDF parsing failed" });
    }

    if (!item) {
      const cleaned = cleanText(fullText);

      const name = extractName(cleaned);
      const email = extractEmail(cleaned);
      const phone = extractPhone(cleaned);
      const skills = extractSkills(cleaned);

      // JD Processing
      const jdSkills = extractJDKeywords(jdText);
      const jdMatchScore = scoreJDMatch(skills, jdSkills);
      const missingSkills = missingJDKeywords(skills, jdSkills);

      // Resume Score
      const totalScore =
        scoreContact({ name, email, phone }) +
        scoreSkills(skills) +
        scoreExperience(cleaned) +
        scoreProjects(cleaned) +
        scoreEducation(cleaned) +
        scoreAchievements(cleaned) +
        jdMatchScore;

    const normalizedScore = Math.round((totalScore / 130) * 100);

      return res.json({
        message: "Resume analyzed successfully!",
        name,
        email,
        phone,
        skills,
        jdSkills,
        missingSkills,
        jdMatchScore,
        normalizedScore,
        text: cleaned,
      });
    }

    if (item.text) {
      fullText += item.text + " ";
    }
  });
});





export default router;
