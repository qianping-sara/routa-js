/**
 * TaskParser - port of routa-core TaskParser.kt
 *
 * Parses `@@@task` blocks from ROUTA's planning output into Task objects.
 *
 * Format:
 * ```
 * @@@task
 * # Task Title
 *
 * ## Objective
 * Clear statement of what needs to be done
 *
 * ## Scope
 * - file1.ts
 * - file2.ts
 *
 * ## Definition of Done
 * - Acceptance criteria 1
 * - Acceptance criteria 2
 *
 * ## Verification
 * - npm test
 * @@@
 * ```
 */

import { v4 as uuidv4 } from "uuid";
import { Task, TaskStatus, createTask } from "../models/task";

/**
 * Parse all `@@@task` blocks from the given text.
 *
 * @param text The ROUTA output containing task blocks
 * @param workspaceId The workspace these tasks belong to
 * @returns List of parsed tasks
 */
export function parseTaskBlocks(text: string, workspaceId: string): Task[] {
  const blocks = extractTaskBlocks(text);
  if (blocks.length === 0) return [];

  return blocks.flatMap((block) => {
    const subBlocks = splitMultiTaskBlock(block);
    return subBlocks
      .map((subBlock) => parseTaskBlock(subBlock, workspaceId))
      .filter((task): task is Task => task !== null);
  });
}

/**
 * Extract `@@@task` blocks using stateful line-by-line parsing.
 *
 * Handles:
 * - Nested code blocks (```bash ... ```) inside task blocks
 * - Both `@@@task` and `@@@tasks` syntax
 * - Optional markdown heading prefix (e.g., `### @@@task`)
 */
function extractTaskBlocks(content: string): string[] {
  const results: string[] = [];
  const lines = content.split("\n");

  let inTaskBlock = false;
  let inNestedCodeBlock = false;
  const taskBlockLines: string[] = [];

  for (const line of lines) {
    if (!inTaskBlock) {
      // Check for task block start: @@@task or @@@tasks
      // Also supports optional markdown heading prefix: ### @@@task
      if (/^#{0,6}\s*@@@tasks?\s*$/.test(line.trim())) {
        inTaskBlock = true;
        inNestedCodeBlock = false;
        taskBlockLines.length = 0;
      }
    } else {
      // We're inside a task block
      if (!inNestedCodeBlock) {
        // Check for task block end: @@@
        if (line.trim() === "@@@") {
          const blockContent = taskBlockLines.join("\n").trim();
          if (blockContent.length > 0) {
            results.push(blockContent);
          }
          inTaskBlock = false;
          taskBlockLines.length = 0;
        } else if (line.trim().startsWith("```")) {
          // Starting a nested code block
          inNestedCodeBlock = true;
          taskBlockLines.push(line);
        } else {
          taskBlockLines.push(line);
        }
      } else {
        // Inside nested code block
        taskBlockLines.push(line);
        if (line.trim().startsWith("```")) {
          // Ending nested code block
          inNestedCodeBlock = false;
        }
      }
    }
  }

  return results;
}

/**
 * Split a single block that may contain multiple tasks (multiple `# ` headers)
 * into separate sub-blocks — one per task.
 *
 * Lines inside markdown code fences (``` ... ```) are ignored when scanning
 * for `# ` title headers.
 */
function splitMultiTaskBlock(block: string): string[] {
  const lines = block.split("\n");

  // Find title indices, tracking code fence state
  const titleIndices: number[] = [];
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track code fence state
    if (trimmed.startsWith("```")) {
      inCodeFence = !inCodeFence;
      continue;
    }

    // Only consider `# ` headers outside code fences
    if (!inCodeFence && line.startsWith("# ") && !line.startsWith("## ")) {
      titleIndices.push(i);
    }
  }

  // 0 or 1 title → single task block
  if (titleIndices.length <= 1) return [block];

  // Multiple titles → split at each `# ` boundary
  const subBlocks: string[] = [];
  for (let i = 0; i < titleIndices.length; i++) {
    const start = titleIndices[i];
    const end = i + 1 < titleIndices.length ? titleIndices[i + 1] : lines.length;
    const subBlock = lines.slice(start, end).join("\n").trim();
    if (subBlock.length > 0) {
      subBlocks.push(subBlock);
    }
  }
  return subBlocks;
}

/**
 * Parse a single task block into a Task object.
 *
 * The first `# ` heading (outside code fences) is the title.
 * Sections are extracted by looking for `## SectionName` headers.
 */
function parseTaskBlock(block: string, workspaceId: string): Task | null {
  const lines = block.split("\n");

  // Find the title — must be outside code fences
  const [title, titleLineIndex] = findTitleOutsideCodeFences(lines);

  // If no valid title found, skip this block
  if (title === null) return null;

  // Extract content after the title line
  const contentLines =
    titleLineIndex + 1 < lines.length
      ? lines.slice(titleLineIndex + 1)
      : [];

  // Extract structured sections from content
  const objective = extractSection(contentLines, [
    "Objective",
    "目标",
    "Goal",
    "目的",
  ]);
  const scopeList = extractListSection(contentLines, [
    "Scope",
    "范围",
    "作用域",
  ]);
  const acceptanceCriteria = extractListSection(contentLines, [
    "Definition of Done",
    "完成标准",
    "验收标准",
    "Acceptance Criteria",
    "Done Criteria",
    "完成条件",
  ]);
  const verificationCommands = extractListSection(contentLines, [
    "Verification",
    "验证",
    "Verify",
    "验证方法",
    "测试验证",
  ]);

  return createTask({
    id: uuidv4(),
    title,
    objective,
    workspaceId,
    scope: scopeList.join("\n"),
    acceptanceCriteria,
    verificationCommands,
  });
}

/**
 * Find the first `# ` title line that is not inside a code fence.
 *
 * @returns [title, lineIndex] or [null, -1] if no title found
 */
function findTitleOutsideCodeFences(lines: string[]): [string | null, number] {
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track code fence state
    if (trimmed.startsWith("```")) {
      inCodeFence = !inCodeFence;
      continue;
    }

    // Check for title outside code fence
    if (!inCodeFence && line.startsWith("# ") && !line.startsWith("## ")) {
      const title = line.substring(2).trim();
      if (title.length > 0) {
        return [title, i];
      }
    }
  }

  return [null, -1];
}

/**
 * Extract a text section between `## SectionName` and the next `##` or end.
 * Tries multiple aliases for the section name.
 * Correctly handles code fences within sections.
 */
function extractSection(lines: string[], aliases: string[]): string {
  // Find the section start
  let startIdx = -1;
  for (const alias of aliases) {
    startIdx = lines.findIndex((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith(`## ${alias}`) || trimmed === `## ${alias}`;
    });
    if (startIdx !== -1) break;
  }

  if (startIdx === -1) return "";

  // Collect content until next ## header (outside code fences)
  const contentLines: string[] = [];
  let inCodeFence = false;

  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track code fence state
    if (trimmed.startsWith("```")) {
      inCodeFence = !inCodeFence;
      contentLines.push(line);
      continue;
    }

    // Stop at next section header (only if outside code fence)
    if (!inCodeFence && trimmed.startsWith("## ")) {
      break;
    }

    contentLines.push(line);
  }

  return contentLines.join("\n").trim();
}

/**
 * Extract list items (lines starting with `-`) from a section.
 * Tries multiple aliases for the section name.
 */
function extractListSection(lines: string[], aliases: string[]): string[] {
  const section = extractSection(lines, aliases);
  if (section.length === 0) return [];

  return section
    .split("\n")
    .filter((line) => line.trim().startsWith("-"))
    .map((line) => line.trim().substring(1).trim())
    .filter((item) => item.length > 0);
}

