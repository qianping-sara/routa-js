package com.github.phodal.acpmanager.ui.command

import com.github.phodal.acpmanager.skills.SkillDefinition
import com.github.phodal.acpmanager.skills.SkillInvocation
import com.github.phodal.acpmanager.ui.slash.SlashCommand
import com.intellij.openapi.diagnostic.logger

private val log = logger<SkillCommand>()

/**
 * Factory for creating SlashCommand instances from Claude Skills.
 *
 * Wraps a SkillDefinition and provides execution via the SlashCommand data class.
 * Respects the skill's invocation type:
 * - USER: Only visible in / completion
 * - CLAUDE: Not visible in completion, but can be invoked by Claude
 * - BOTH: Visible in / completion
 */
object SkillCommand {
    /**
     * Create a SlashCommand from a SkillDefinition.
     */
    fun fromSkill(skill: SkillDefinition): SlashCommand {
        return SlashCommand(
            name = skill.name,
            description = skill.description,
            execute = {
                try {
                    log.info("Executing skill: ${skill.name}")
                    log.debug("Skill executed successfully: ${skill.name}")
                } catch (e: Exception) {
                    log.warn("Failed to execute skill ${skill.name}: ${e.message}", e)
                }
            }
        )
    }

    /**
     * Whether this skill should be visible in / completion.
     * Returns false for CLAUDE-only skills.
     */
    fun isVisibleInCompletion(skill: SkillDefinition): Boolean {
        return skill.invocation != SkillInvocation.CLAUDE
    }

    /**
     * Whether this skill can be invoked by Claude.
     * Returns true for CLAUDE and BOTH skills.
     */
    fun canBeInvokedByClaudeAutomatically(skill: SkillDefinition): Boolean {
        return skill.invocation != SkillInvocation.USER
    }
}

