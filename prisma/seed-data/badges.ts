import type { BadgeCriteria } from "../../src/modules/analytics/gamification";

type BadgeSeed = {
  key: string;
  name: string;
  description: string;
  category: "MASTERY" | "TRACK" | "LAB" | "QUIZ" | "STREAK" | "COMEBACK" | "PERSONAL_BEST" | "MILESTONE";
  icon: string;
  xpReward: number;
  criteria: BadgeCriteria;
  tr: { name: string; description: string };
};

export const BADGES: BadgeSeed[] = [
  { key: "first-lesson", name: "First step", description: "Completed your first lesson.", category: "MILESTONE", icon: "Rocket", xpReward: 10, criteria: { type: "first_lesson" }, tr: { name: "İlk adım", description: "İlk dersinizi tamamladınız." } },
  { key: "ten-lessons", name: "Steady learner", description: "Completed 10 lessons.", category: "MILESTONE", icon: "BookOpen", xpReward: 25, criteria: { type: "lessons_completed", count: 10 }, tr: { name: "İstikrarlı öğrenci", description: "10 ders tamamladınız." } },
  { key: "domain-mastery", name: "Domain mastery", description: "Reached 80% accuracy on at least 10 recent questions in a domain.", category: "MASTERY", icon: "Target", xpReward: 40, criteria: { type: "domain_mastery", minAccuracy: 80, minAnswers: 10 }, tr: { name: "Alan uzmanlığı", description: "Bir alanda en az 10 soruda %80 doğruluğa ulaştınız." } },
  { key: "track-complete", name: "Path finisher", description: "Completed every lesson in a learning path.", category: "TRACK", icon: "GraduationCap", xpReward: 100, criteria: { type: "track_completion" }, tr: { name: "Yolu tamamlayan", description: "Bir öğrenme yolundaki tüm dersleri tamamladınız." } },
  { key: "first-lab", name: "Hands-on", description: "Completed your first lab.", category: "LAB", icon: "FlaskConical", xpReward: 20, criteria: { type: "labs_completed", count: 1 }, tr: { name: "Uygulamalı", description: "İlk laboratuvarınızı tamamladınız." } },
  { key: "three-labs", name: "Lab regular", description: "Completed three labs.", category: "LAB", icon: "Zap", xpReward: 40, criteria: { type: "labs_completed", count: 3 }, tr: { name: "Laboratuvar müdavimi", description: "Üç laboratuvar tamamladınız." } },
  { key: "perfect-quiz", name: "Perfect score", description: "Answered every question correctly in a quiz.", category: "QUIZ", icon: "Star", xpReward: 20, criteria: { type: "perfect_quiz" }, tr: { name: "Kusursuz skor", description: "Bir testteki tüm soruları doğru cevapladınız." } },
  { key: "streak-3", name: "Three-day streak", description: "Studied three days in a row.", category: "STREAK", icon: "Flame", xpReward: 15, criteria: { type: "streak", days: 3 }, tr: { name: "Üç günlük seri", description: "Üst üste üç gün çalıştınız." } },
  { key: "streak-7", name: "Week streak", description: "Studied seven days in a row.", category: "STREAK", icon: "Flame", xpReward: 40, criteria: { type: "streak", days: 7 }, tr: { name: "Haftalık seri", description: "Üst üste yedi gün çalıştınız." } },
  { key: "comeback", name: "Comeback", description: "Returned to studying after a week away.", category: "COMEBACK", icon: "TrendingUp", xpReward: 15, criteria: { type: "comeback", inactiveDays: 7 }, tr: { name: "Geri dönüş", description: "Bir haftalık aradan sonra çalışmaya geri döndünüz." } },
  { key: "personal-best", name: "Personal best", description: "Beat your previous best full practice exam score.", category: "PERSONAL_BEST", icon: "Trophy", xpReward: 25, criteria: { type: "personal_best" }, tr: { name: "Kişisel rekor", description: "Önceki en iyi tam deneme sınavı puanınızı geçtiniz." } },
  { key: "exam-ready-practice", name: "Practice target reached", description: "Scored at least 75% on a full practice exam.", category: "PERSONAL_BEST", icon: "Medal", xpReward: 50, criteria: { type: "practice_exam_score", minPercent: 75 }, tr: { name: "Pratik hedefine ulaşıldı", description: "Tam bir deneme sınavında en az %75 aldınız." } },
  { key: "xp-1000", name: "1,000 XP", description: "Earned 1,000 experience points.", category: "MILESTONE", icon: "Crown", xpReward: 0, criteria: { type: "xp", amount: 1000 }, tr: { name: "1.000 XP", description: "1.000 deneyim puanı kazandınız." } },
  { key: "quest-day-1", name: "Daily trio", description: "Claimed all three daily quests in one day.", category: "STREAK", icon: "ListChecks", xpReward: 20, criteria: { type: "quest_days", count: 1 }, tr: { name: "Günlük üçlü", description: "Bir günde üç günlük görevin tamamını aldınız." } },
  { key: "quest-day-7", name: "Quest week", description: "Claimed all daily quests on seven days.", category: "STREAK", icon: "CalendarCheck", xpReward: 60, criteria: { type: "quest_days", count: 7 }, tr: { name: "Görev haftası", description: "Yedi gün boyunca tüm günlük görevleri aldınız." } },
  { key: "focus-1", name: "Focused start", description: "Completed your first focus session.", category: "MILESTONE", icon: "Timer", xpReward: 10, criteria: { type: "focus_sessions", count: 1 }, tr: { name: "Odaklı başlangıç", description: "İlk odak oturumunuzu tamamladınız." } },
  { key: "focus-10", name: "Deep work", description: "Completed 10 focus sessions.", category: "MILESTONE", icon: "TimerReset", xpReward: 40, criteria: { type: "focus_sessions", count: 10 }, tr: { name: "Derin çalışma", description: "10 odak oturumu tamamladınız." } },
  { key: "three-star-lab-1", name: "Three-star finish", description: "Completed a lab with three stars.", category: "LAB", icon: "Stars", xpReward: 25, criteria: { type: "three_star_labs", count: 1 }, tr: { name: "Üç yıldızlı bitiriş", description: "Bir laboratuvarı üç yıldızla tamamladınız." } },
  { key: "three-star-lab-5", name: "Lab precision", description: "Completed five labs with three stars.", category: "LAB", icon: "BadgeCheck", xpReward: 75, criteria: { type: "three_star_labs", count: 5 }, tr: { name: "Laboratuvar ustalığı", description: "Beş laboratuvarı üç yıldızla tamamladınız." } },
  { key: "lightning-8", name: "Lightning sharp", description: "Completed a lightning round with at least 8 correct answers.", category: "QUIZ", icon: "Zap", xpReward: 25, criteria: { type: "lightning_correct", minCorrect: 8 }, tr: { name: "Yıldırım gibi", description: "En az 8 doğru cevapla bir yıldırım turu tamamladınız." } },
  { key: "combo-10", name: "Combo ten", description: "Reached a combo of 10 in lightning practice.", category: "QUIZ", icon: "Sparkles", xpReward: 35, criteria: { type: "lightning_combo", combo: 10 }, tr: { name: "Onluk kombo", description: "Yıldırım alıştırmasında 10 komboya ulaştınız." } },
  { key: "lab-explorer", name: "Lab explorer", description: "Completed labs in three different certifications.", category: "LAB", icon: "Compass", xpReward: 60, criteria: { type: "lab_cert_explorer", count: 3 }, tr: { name: "Laboratuvar kâşifi", description: "Üç farklı sertifikada laboratuvar tamamladınız." } },
];
