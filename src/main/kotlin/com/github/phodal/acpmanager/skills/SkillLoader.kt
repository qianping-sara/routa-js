package com.github.phodal.acpmanager.skills

import com.intellij.openapi.diagnostic.logger
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths

private val log = logger<SkillLoader>()

/**
 * Loads and parses Claude Skills from SKILL.md files.
 *
 * Supports loading from:
 * - Personal skills: ~/.claude/skills/<skill-name>/SKILL.md
 * - Project skills: .claude/skills/<skill-name>/SKILL.md
 * - Plugin skills: <plugin>/skills/<skill-name>/SKILL.md
 */
object SkillLoader {
    private const val SKILL_FILENAME = "SKILL.md"

    /**
     * Load a skill from a directory containing SKILL.md.
     *
     * @param skillDir Path to the skill directory
     * @param source The source of the skill (PERSONAL, PROJECT, PLUGIN)
     * @return SkillDefinition or null if loading fails
     */
    fun load(skillDir: Path, source: SkillSource): SkillDefinition? {
        return try {
            val skillFile = skillDir.resolve(SKILL_FILENAME)
            
            if (!Files.exists(skillFile)) {
                log.debug("SKILL.md not found at: $skillFile")
                return null
            }
            
            if (!Files.isRegularFile(skillFile)) {
                log.warn("SKILL.md is not a regular file: $skillFile")
                return null
            }
            
            val content = Files.readString(skillFile)
            val (frontmatter, markdown) = SkillFrontmatterParser.parse(content) ?: return null
            val metadata = SkillFrontmatterParser.extractMetadata(frontmatter) ?: return null
            
            SkillDefinition(
                name = metadata.name,
                description = metadata.description,
                invocation = metadata.invocation,
                content = markdown,
                source = source,
                filePath = skillFile.toString()
            )
        } catch (e: Exception) {
            log.warn("Failed to load skill from $skillDir: ${e.message}", e)
            null
        }
    }

    /**
     * Load all skills from a directory.
     * Recursively searches for SKILL.md files in subdirectories.
     *
     * @param baseDir The base directory to search
     * @param source The source of the skills
     * @return List of loaded skills
     */
    fun loadAll(baseDir: Path, source: SkillSource): List<SkillDefinition> {
        return try {
            if (!Files.exists(baseDir) || !Files.isDirectory(baseDir)) {
                log.debug("Skills directory does not exist: $baseDir")
                return emptyList()
            }
            
            val skills = mutableListOf<SkillDefinition>()
            
            Files.list(baseDir).use { stream ->
                stream.filter { Files.isDirectory(it) }
                    .forEach { skillDir ->
                        val skill = load(skillDir, source)
                        if (skill != null) {
                            skills.add(skill)
                            log.info("Loaded skill: ${skill.name} from $skillDir")
                        }
                    }
            }
            
            skills
        } catch (e: Exception) {
            log.warn("Failed to load skills from $baseDir: ${e.message}", e)
            emptyList()
        }
    }

    /**
     * Load personal skills from ~/.claude/skills/
     *
     * @return List of personal skills
     */
    fun loadPersonalSkills(): List<SkillDefinition> {
        val personalSkillsPath = Paths.get(System.getProperty("user.home"), ".claude", "skills")
        return loadAll(personalSkillsPath, SkillSource.PERSONAL)
    }

    /**
     * Load project skills from .claude/skills/
     *
     * @param projectBasePath The project base path
     * @return List of project skills
     */
    fun loadProjectSkills(projectBasePath: String): List<SkillDefinition> {
        val projectSkillsPath = Paths.get(projectBasePath, ".claude", "skills")
        return loadAll(projectSkillsPath, SkillSource.PROJECT)
    }
}

