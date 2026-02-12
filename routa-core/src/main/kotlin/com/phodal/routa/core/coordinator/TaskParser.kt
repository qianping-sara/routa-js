package com.phodal.routa.core.coordinator

import com.phodal.routa.core.model.Task
import com.phodal.routa.core.model.TaskStatus
import java.time.Instant
import java.util.UUID

/**
 * Parses `@@@task` blocks from Routa's planning output into [Task] objects.
 *
 * Follows the TypeScript implementation approach for robust parsing:
 * - Uses stateful line-by-line parsing to handle nested code blocks correctly
 * - Each `@@@task` block contains one task (first `# ` heading is title, rest is content)
 * - Extracts structured sections (Objective, Scope, etc.) from the content
 *
 * The `@@@task` block format (with optional markdown heading prefix):
 * ```
 * @@@task
 * # Task Title
 *
 * ## Objective
 * Clear statement
 *
 * ## Scope
 * - file1.kt
 * - file2.kt
 *
 * ## Definition of Done
 * - Acceptance criteria 1
 * - Acceptance criteria 2
 *
 * ## Verification
 * - ./gradlew test
 * @@@
 * ```
 *
 * Also supports markdown heading prefix (e.g., `### @@@task`):
 * ```
 * ### @@@task
 * # Task Title
 * ...
 * @@@
 * ```
 */
object TaskParser {

    /**
     * Parse all `@@@task` blocks from the given text.
     *
     * Uses stateful parsing to correctly handle nested code blocks.
     * If the LLM places multiple tasks inside a single `@@@task` block
     * (identified by multiple `# ` level-1 headers outside code fences),
     * they are automatically split into separate tasks.
     *
     * @param text The Routa output containing task blocks.
     * @param workspaceId The workspace these tasks belong to.
     * @return List of parsed tasks.
     */
    fun parse(text: String, workspaceId: String): List<Task> {
        val blocks = extractTaskBlocks(text)
        if (blocks.isEmpty()) return emptyList()

        return blocks.flatMap { block ->
            splitMultiTaskBlock(block).mapNotNull { subBlock ->
                parseTaskBlock(subBlock, workspaceId)
            }
        }
    }

    /**
     * Extract `@@@task` blocks using stateful line-by-line parsing.
     *
     * This approach correctly handles:
     * - Nested code blocks (```bash ... ```) inside task blocks
     * - Both `@@@task` and `@@@tasks` syntax
     * - Optional markdown heading prefix (e.g., `### @@@task`)
     * - Various line ending styles (\n, \r\n)
     */
    private fun extractTaskBlocks(content: String): List<String> {
        val results = mutableListOf<String>()
        val lines = content.lines()

        var inTaskBlock = false
        var inNestedCodeBlock = false
        val taskBlockLines = mutableListOf<String>()

        for (line in lines) {
            if (!inTaskBlock) {
                // Check for task block start: @@@task or @@@tasks
                // Also supports optional markdown heading prefix: ### @@@task
                if (line.trim().matches(Regex("""#{0,6}\s*@@@tasks?\s*"""))) {
                    inTaskBlock = true
                    inNestedCodeBlock = false
                    taskBlockLines.clear()
                }
            } else {
                // We're inside a task block
                if (!inNestedCodeBlock) {
                    // Check for task block end: @@@
                    if (line.trim() == "@@@") {
                        // End of task block
                        val blockContent = taskBlockLines.joinToString("\n").trim()
                        if (blockContent.isNotEmpty()) {
                            results.add(blockContent)
                        }
                        inTaskBlock = false
                        taskBlockLines.clear()
                    } else if (line.trim().startsWith("```") && line.trim().length > 3) {
                        // Starting a nested code block (e.g., ```bash, ```typescript)
                        inNestedCodeBlock = true
                        taskBlockLines.add(line)
                    } else if (line.trim() == "```") {
                        // Bare ``` - could be start of anonymous code block
                        inNestedCodeBlock = true
                        taskBlockLines.add(line)
                    } else {
                        taskBlockLines.add(line)
                    }
                } else {
                    // We're inside a nested code block
                    taskBlockLines.add(line)
                    // Check for nested code block end (bare ```)
                    if (line.trim() == "```") {
                        inNestedCodeBlock = false
                    }
                }
            }
        }

        return results
    }

    /**
     * Split a single block that may contain multiple tasks (multiple `# ` headers)
     * into separate sub-blocks — one per task.
     *
     * If the block contains only one `# ` header (or none), it is returned as-is.
     *
     * **Important:** Lines inside markdown code fences (``` ... ```) are ignored
     * when scanning for `# ` title headers. This prevents bash comments like
     * `# Check if file exists` inside verification code blocks from being
     * mistaken for task titles.
     */
    internal fun splitMultiTaskBlock(block: String): List<String> {
        val lines = block.lines()

        // Find title indices, tracking code fence state
        val titleIndices = mutableListOf<Int>()
        var inCodeFence = false

        for (i in lines.indices) {
            val line = lines[i]
            val trimmed = line.trim()

            // Track code fence state
            if (trimmed.startsWith("```")) {
                inCodeFence = !inCodeFence
                continue
            }

            // Only consider `# ` headers outside code fences
            if (!inCodeFence && line.startsWith("# ") && !line.startsWith("## ")) {
                titleIndices.add(i)
            }
        }

        // 0 or 1 title → single task block
        if (titleIndices.size <= 1) return listOf(block)

        // Multiple titles → split at each `# ` boundary
        val subBlocks = mutableListOf<String>()
        for (i in titleIndices.indices) {
            val start = titleIndices[i]
            val end = if (i + 1 < titleIndices.size) titleIndices[i + 1] else lines.size
            val subBlock = lines.subList(start, end).joinToString("\n").trim()
            if (subBlock.isNotEmpty()) {
                subBlocks.add(subBlock)
            }
        }
        return subBlocks
    }

    /**
     * Parse a single task block into a [Task] object.
     *
     * The first `# ` heading (outside code fences) is the title.
     * Sections are extracted by looking for `## SectionName` headers.
     */
    internal fun parseTaskBlock(block: String, workspaceId: String): Task? {
        val lines = block.lines()

        // Find the title — must be outside code fences
        val (title, titleLineIndex) = findTitleOutsideCodeFences(lines)

        // If no valid title found, skip this block
        if (title == null) return null

        // Extract content after the title line
        val contentLines = if (titleLineIndex + 1 < lines.size) {
            lines.subList(titleLineIndex + 1, lines.size)
        } else {
            emptyList()
        }

        // Extract structured sections from content
        val objective = extractSection(contentLines, listOf("Objective", "目标", "Goal", "目的"))
        val scope = extractListSection(contentLines, listOf("Scope", "范围", "作用域"))
        val acceptanceCriteria = extractListSection(
            contentLines,
            listOf("Definition of Done", "完成标准", "验收标准", "Acceptance Criteria", "Done Criteria", "完成条件")
        )
        val verificationCommands = extractListSection(
            contentLines,
            listOf("Verification", "验证", "Verify", "验证方法", "测试验证")
        )

        val now = Instant.now().toString()
        return Task(
            id = UUID.randomUUID().toString(),
            title = title,
            objective = objective,
            scope = scope,
            acceptanceCriteria = acceptanceCriteria,
            verificationCommands = verificationCommands,
            status = TaskStatus.PENDING,
            workspaceId = workspaceId,
            createdAt = now,
            updatedAt = now,
        )
    }

    /**
     * Find the first `# ` title line that is not inside a code fence.
     *
     * @return Pair of (title, lineIndex) or (null, -1) if no title found.
     */
    private fun findTitleOutsideCodeFences(lines: List<String>): Pair<String?, Int> {
        var inCodeFence = false

        for (i in lines.indices) {
            val line = lines[i]
            val trimmed = line.trim()

            // Track code fence state
            if (trimmed.startsWith("```")) {
                inCodeFence = !inCodeFence
                continue
            }

            // Check for title outside code fence
            if (!inCodeFence && line.startsWith("# ") && !line.startsWith("## ")) {
                val title = line.removePrefix("# ").trim()
                if (title.isNotEmpty()) {
                    return Pair(title, i)
                }
            }
        }

        return Pair(null, -1)
    }

    /**
     * Extract a text section between `## SectionName` and the next `##` or end.
     * Tries multiple aliases for the section name.
     * Correctly handles code fences within sections.
     */
    private fun extractSection(lines: List<String>, aliases: List<String>): String {
        // Find the section start
        var startIdx = -1
        for (alias in aliases) {
            startIdx = lines.indexOfFirst { line ->
                val trimmed = line.trim()
                trimmed.startsWith("## $alias") || trimmed == "## $alias"
            }
            if (startIdx != -1) break
        }

        if (startIdx == -1) return ""

        // Collect content until next ## header (outside code fences)
        val contentLines = mutableListOf<String>()
        var inCodeFence = false

        for (i in (startIdx + 1) until lines.size) {
            val line = lines[i]
            val trimmed = line.trim()

            // Track code fence state
            if (trimmed.startsWith("```")) {
                inCodeFence = !inCodeFence
                contentLines.add(line)
                continue
            }

            // Stop at next section header (only if outside code fence)
            if (!inCodeFence && trimmed.startsWith("## ")) {
                break
            }

            contentLines.add(line)
        }

        return contentLines.joinToString("\n").trim()
    }

    /**
     * Extract list items (lines starting with `-`) from a section.
     * Tries multiple aliases for the section name.
     */
    private fun extractListSection(lines: List<String>, aliases: List<String>): List<String> {
        val section = extractSection(lines, aliases)
        if (section.isEmpty()) return emptyList()

        return section.lines()
            .filter { it.trim().startsWith("-") }
            .map { it.trim().removePrefix("-").trim() }
            .filter { it.isNotEmpty() }
    }
}
