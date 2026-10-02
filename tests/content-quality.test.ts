import { describe, expect, it } from "vitest";
import { listCourseDirectories, loadCourseDirectory } from "@/modules/content/package-loader";
import { iterateQuestions, validateCoursePackage } from "@/modules/content/package-schema";
import { findNearDuplicateTexts, findRepeatedLessonContent, findRepeatedQuestionContent, nearDuplicateEntries } from "@/modules/content/quality";

describe("content quality checks", () => {
  it("flags text copied between lessons and title-templated objectives", () => {
    const issues = findRepeatedLessonContent([
      { slug: "a", title: "Azure Policy basics", simplerExplanation: "Think of a toolbox.", learningObjectives: ["Explain azure policy basics in practical language"], flashcards: [{ front: "Exam cue", back: "x" }] },
      { slug: "b", title: "Resource locks", simplerExplanation: "Think of a toolbox.", learningObjectives: ["Describe how a Delete lock prevents removal"], flashcards: [{ front: "Exam cue", back: "y" }] },
      { slug: "c", title: "Tags", simplerExplanation: "Tags are like labels on moving boxes.", learningObjectives: ["Use tags for cost reporting"] },
    ]);
    const fields = issues.map((issue) => issue.field).sort();
    expect(fields).toEqual(["flashcards.front", "learningObjectives", "simplerExplanation"]);
    expect(issues.find((issue) => issue.field === "simplerExplanation")?.lessons).toEqual(["a", "b"]);
    expect(issues.find((issue) => issue.field === "learningObjectives")?.lessons).toEqual(["a"]);
  });

  it("flags template questions but allows short options such as service names to repeat", () => {
    const placeholder = (ref: string) => ({
      ref,
      stem: `Which option fits scenario ${ref}?`,
      explanation: "The answer follows the scenario clue.",
      options: [
        { key: "A", text: "The option that directly satisfies the requirement", explanation: `Correct for ${ref}.` },
        { key: "B", text: "Azure Blob Storage", explanation: `Wrong for ${ref}.` },
      ],
    });
    const issues = findRepeatedQuestionContent([placeholder("q1"), placeholder("q2"), placeholder("q3"), { ref: "q4", stem: "Complete the sentence.", options: [] }, { ref: "q5", stem: "Complete the sentence.", options: [] }]);
    const fields = issues.map((issue) => issue.field).sort();
    expect(fields).toEqual(["question.explanation", "question.option", "question.stem"]);
    expect(issues.find((issue) => issue.field === "question.option")?.lessons).toEqual(["q1", "q2", "q3"]);
  });

  it("flags texts that keep another text's word skeleton and only swap the topic", () => {
    const issues = findNearDuplicateTexts([
      { id: "q1", field: "question.explanation", text: "Azure Policy is correct because it evaluates resources against rules and can deny noncompliant deployments." },
      { id: "q2", field: "question.explanation", text: "A resource lock is correct because it evaluates resources against rules and can deny noncompliant deployments." },
      { id: "q3", field: "question.explanation", text: "Tags add name and value metadata to resources so cost reports can be grouped by department or project." },
      { id: "q4", field: "question.stem", text: "Azure Policy is correct because it evaluates resources against rules and can deny noncompliant deployments." },
      { id: "q5", field: "question.explanation", text: "Too short to compare." },
    ]);
    expect(issues.map((issue) => issue.lessons)).toEqual([["q1", "q2"]]);
    expect(issues[0]?.field).toBe("question.explanation (near-duplicate)");
  });

  it("compares the items of instruction-style questions instead of their stems", () => {
    const entries = nearDuplicateEntries([], [
      { ref: "o1", type: "ORDERING", stem: "Put the steps to deploy a virtual machine in the correct order.", ordering: { items: [{ text: "Choose an image" }, { text: "Select a size" }] } },
      { ref: "s1", type: "SINGLE_CHOICE", stem: "Which service stores unstructured objects?", explanation: "Blob Storage stores objects.", options: [{ key: "A", text: "Blob Storage", explanation: "Correct." }] },
      { ref: "t1", type: "TRUE_FALSE", stem: "Blob Storage stores objects.", options: [{ key: "TRUE", text: "True", explanation: "Blob Storage is object storage." }] },
    ]);
    expect(entries.map((entry) => `${entry.id}:${entry.field}`)).toEqual(["o1:question.orderingItems", "s1:question.stem", "s1:question.explanation", "s1:question.optionExplanation", "t1:question.stem", "t1:question.trueFalseExplanation"]);
  });

  it("flags True/False option explanations reused across questions", () => {
    const trueFalse = (ref: string) => ({ ref, type: "TRUE_FALSE", stem: `Statement ${ref} about Azure.`, explanation: `Why ${ref} is true.`, options: [{ key: "TRUE", text: "True", explanation: "This statement is accurate." }, { key: "FALSE", text: "False", explanation: `False would deny statement ${ref}.` }] });
    const issues = findRepeatedQuestionContent([trueFalse("t1"), trueFalse("t2")]);
    expect(issues).toEqual([{ field: "question.trueFalseExplanation", lessons: ["t1", "t2"], sample: "This statement is accurate." }]);
  });

  it("finds no copied lesson content or template questions in the seeded course packages", () => {
    for (const dir of listCourseDirectories("prisma/seed-data/courses")) {
      const result = validateCoursePackage(loadCourseDirectory(dir));
      expect(result.ok, dir).toBe(true);
      if (!result.ok) continue;
      const lessons = result.pkg.domains.flatMap((domain) => domain.modules.flatMap((module) => module.lessons));
      const questions = [...iterateQuestions(result.pkg)].map(({ q }) => q);
      expect(findRepeatedLessonContent(lessons), dir).toEqual([]);
      expect(findRepeatedQuestionContent(questions), dir).toEqual([]);
      expect(findNearDuplicateTexts(nearDuplicateEntries(lessons, questions)), dir).toEqual([]);
    }
  });
});
