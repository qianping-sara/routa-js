package com.github.phodal.acpmanager.skills

import com.intellij.openapi.diagnostic.logger
import org.yaml.snakeyaml.Yaml

private val log = logger<SkillFrontmatterParser>()

/**
 * Parses YAML frontmatter from SKILL.md files.
 *
 * SKILL.md format:
 * ```
 * ---
 * name: skill-name
 * description: Skill description
 * invocation: user | claude | both
 * ---
 * Markdown content here...
 * ```
 */
object SkillFrontmatterParser {
    private val yaml = Yaml()

    /**
     * Parse a SKILL.md file content and extract frontmatter and markdown.
     *
     * @param content The full content of the SKILL.md file
     * @return Pair of (frontmatter map, markdown content) or null if parsing fails
     */
    fun parse(content: String): Pair<Map<String, Any>, String>? {
        return try {
            val lines = content.split("\n")
            
            // Check if starts with ---
            if (lines.isEmpty() || !lines[0].trim().startsWith("---")) {
                log.warn("SKILL.md does not start with frontmatter delimiter")
                return null
            }
            
            // Find closing ---
            var endIndex = -1
            for (i in 1 until lines.size) {
                if (lines[i].trim().startsWith("---")) {
                    endIndex = i
                    break
                }
            }
            
            if (endIndex == -1) {
                log.warn("SKILL.md frontmatter not properly closed")
                return null
            }
            
            // Extract frontmatter and markdown
            val frontmatterStr = lines.subList(1, endIndex).joinToString("\n")
            val markdownStr = lines.subList(endIndex + 1, lines.size).joinToString("\n").trim()
            
            // Parse YAML
            @Suppress("UNCHECKED_CAST")
            val frontmatter = yaml.load<Map<String, Any>>(frontmatterStr) ?: emptyMap()
            
            Pair(frontmatter, markdownStr)
        } catch (e: Exception) {
            log.warn("Failed to parse SKILL.md frontmatter: ${e.message}", e)
            null
        }
    }

    /**
     * Extract skill metadata from parsed frontmatter.
     *
     * @param frontmatter The parsed YAML frontmatter
     * @return SkillMetadata or null if required fields are missing
     */
    fun extractMetadata(frontmatter: Map<String, Any>): SkillMetadata? {
        return try {
            val name = frontmatter["name"] as? String
            val description = frontmatter["description"] as? String
            val invocationStr = frontmatter["invocation"] as? String ?: "both"
            
            if (name == null || description == null) {
                log.warn("SKILL.md missing required fields: name=$name, description=$description")
                return null
            }
            
            val invocation = when (invocationStr.lowercase()) {
                "user" -> SkillInvocation.USER
                "claude" -> SkillInvocation.CLAUDE
                "both" -> SkillInvocation.BOTH
                else -> {
                    log.warn("Unknown invocation type: $invocationStr, defaulting to BOTH")
                    SkillInvocation.BOTH
                }
            }
            
            SkillMetadata(name, description, invocation)
        } catch (e: Exception) {
            log.warn("Failed to extract skill metadata: ${e.message}", e)
            null
        }
    }
}

/**
 * Extracted skill metadata from frontmatter.
 */
data class SkillMetadata(
    val name: String,
    val description: String,
    val invocation: SkillInvocation
)

