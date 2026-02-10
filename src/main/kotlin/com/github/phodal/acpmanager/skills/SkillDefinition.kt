package com.github.phodal.acpmanager.skills

/**
 * Represents a Claude Skill definition loaded from a SKILL.md file.
 *
 * Skills are reusable instructions that can be invoked via slash commands.
 * They follow the Claude Skills standard: https://code.claude.com/docs/en/skills
 */
data class SkillDefinition(
    val name: String,
    val description: String,
    val invocation: SkillInvocation = SkillInvocation.BOTH,
    val content: String,  // Markdown content without frontmatter
    val source: SkillSource,  // PERSONAL, PROJECT, PLUGIN
    val filePath: String
)

/**
 * Determines who can invoke this skill.
 */
enum class SkillInvocation {
    USER,      // Only user can invoke via /name
    CLAUDE,    // Only Claude can auto-load
    BOTH       // Both user and Claude (default)
}

/**
 * Determines the priority of skills from different sources.
 * Higher priority values override lower priority values.
 */
enum class SkillSource(val priority: Int) {
    PLUGIN(1),      // Plugin-provided skills (lowest priority)
    PERSONAL(2),    // User's personal skills (~/.claude/skills/)
    PROJECT(3)      // Project-specific skills (.claude/skills/) (highest priority)
}

