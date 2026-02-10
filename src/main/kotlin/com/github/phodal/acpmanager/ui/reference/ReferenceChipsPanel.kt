package com.github.phodal.acpmanager.ui.reference

import com.github.phodal.acpmanager.acp.MessageReference
import com.intellij.icons.AllIcons
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import java.awt.*
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.JPanel

private val log = logger<ReferenceChipsPanel>()

/**
 * Panel that displays references as clickable chips/badges.
 */
class ReferenceChipsPanel(
    private val project: Project,
    private val references: List<MessageReference>
) : JPanel(FlowLayout(FlowLayout.LEFT, 4, 4)) {

    init {
        isOpaque = false
        border = JBUI.Borders.emptyTop(4)

        for (reference in references) {
            add(createReferenceChip(reference))
        }
    }

    private fun createReferenceChip(reference: MessageReference): JPanel {
        val chip = JPanel(BorderLayout()).apply {
            isOpaque = true
            background = JBColor(Color(0xE8F4F8), Color(0x1E3A3A))
            border = JBUI.Borders.empty(2, 6)
            preferredSize = Dimension(150, 24)
            cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)
        }

        val icon = when (reference.type) {
            "file" -> AllIcons.FileTypes.Text
            "symbol" -> AllIcons.Nodes.Method
            else -> AllIcons.General.Information
        }

        val label = JBLabel(reference.displayText, icon, JBLabel.LEFT).apply {
            foreground = JBColor(Color(0x0066CC), Color(0x6BA3FF))
            font = font.deriveFont(Font.PLAIN, font.size2D - 1)
        }

        chip.add(label, BorderLayout.CENTER)

        chip.addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                openReference(reference)
            }

            override fun mouseEntered(e: MouseEvent) {
                chip.background = JBColor(Color(0xD0E8F0), Color(0x2A4A4A))
            }

            override fun mouseExited(e: MouseEvent) {
                chip.background = JBColor(Color(0xE8F4F8), Color(0x1E3A3A))
            }
        })

        return chip
    }

    private fun openReference(reference: MessageReference) {
        try {
            when (reference.type) {
                "file" -> {
                    val filePath = reference.metadata["path"] as? String ?: return
                    val file = LocalFileSystem.getInstance().findFileByPath(filePath)
                    if (file != null) {
                        FileEditorManager.getInstance(project).openFile(file, true)
                        log.info("Opened file: $filePath")
                    }
                }
                "symbol" -> {
                    val lineNumber = (reference.metadata["lineNumber"] as? Number)?.toInt() ?: 0
                    log.info("Symbol reference: ${reference.displayText} at line $lineNumber")
                    // TODO: Navigate to symbol in editor
                }
            }
        } catch (e: Exception) {
            log.warn("Failed to open reference: ${e.message}", e)
        }
    }
}

